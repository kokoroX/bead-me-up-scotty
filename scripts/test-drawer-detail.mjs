// Drawer regression: closed list rows carry a summary only; the full bead is
// fetched on demand, while open beads keep rendering straight from the list.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.SCOTTY_TEST_URL;
assert.ok(base, "Set SCOTTY_TEST_URL to an isolated demo server");

const bead = (id, title, extra = {}) => ({
  id,
  title,
  status: "open",
  issue_type: "task",
  priority: 2,
  labels: [],
  dependencies: [],
  comments: [],
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  ...extra,
});

const openBead = bead("open-bead", "Open fixture", {
  description: "Open description from list",
  notes: "Open notes",
});
const closedBead = bead("closed-detail", "Closed fixture", {
  status: "closed",
  close_reason: "Shipped",
  summary_only: true,
  comment_count: 4,
  checklist: { done: 1, total: 2 },
});
const errorBead = bead("closed-error", "Closed error fixture", {
  status: "closed",
  summary_only: true,
  comment_count: 0,
  checklist: { done: 0, total: 0 },
});
const fullClosed = {
  ...closedBead,
  summary_only: undefined,
  checklist: undefined,
  description: "Detailed closed description",
  notes: "Detailed closed notes",
  design: "Detailed closed design",
  acceptance_criteria: "Detailed closed acceptance",
  metadata: { owner: "fixture" },
  comments: [{ author: "alice", text: "Detailed closed comment" }],
};

let detailRequests = 0;
let readOnly = true;
let listReady = Promise.resolve();
const browser = await chromium.launch();
let page;
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/viewer-mode", (route) => route.fulfill({ json: { readOnly } }));
  await page.route("**/api/p/demo/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/beads/stream")) return route.abort();
    if (path.endsWith("/beads")) {
      await listReady;
      return route.fulfill({
        json: {
          beads: [openBead, closedBead, errorBead],
          meta: { kind: "demo", humanActor: "reviewer", humanAllowlist: ["reviewer"], pollIntervalMs: 300_000 },
        },
      });
    }
    if (path.endsWith("/beads/closed-detail")) {
      detailRequests += 1;
      await new Promise((resolve) => setTimeout(resolve, 500));
      return route.fulfill({ json: fullClosed });
    }
    if (path.endsWith("/beads/closed-error")) {
      return route.fulfill({ status: 500, json: { error: "fixture detail failed" } });
    }
    if (path.endsWith("/beads/open-bead")) {
      return route.fulfill({ json: {} });
    }
    return route.fulfill({ json: {} });
  });

  // Closed card comment count comes from the summary fields, not from comments.
  await page.goto(`${base}/p/demo?view=board`);
  const card = page.locator("article").filter({ hasText: "Closed fixture" });
  await card.waitFor();
  assert.equal(await card.locator('[title="comments"]').innerText(), "4");
  assert.equal(await card.locator('[title="checklist progress"]').innerText(), "1/2");

  // Delayed detail: the content area shows a loading line, then the full body.
  await page.goto(`${base}/p/demo?bead=closed-detail`);
  const dialog = page.getByRole("dialog");
  await dialog.getByTestId("detail-loading").waitFor();
  assert.match(await dialog.getByTestId("detail-loading").innerText(), /Loading details/);
  await dialog.getByText("Detailed closed description", { exact: true }).waitFor();
  assert.equal(await dialog.getByTestId("detail-loading").count(), 0);
  assert.match(await dialog.getByText("Detailed closed comment", { exact: true }).innerText(), /Detailed closed comment/);
  assert.equal(detailRequests, 1);

  // A failed detail fetch keeps the header and offers a retry.
  await page.goto(`${base}/p/demo?bead=closed-error`);
  const failed = page.getByRole("dialog");
  await failed.getByTestId("detail-load-error").waitFor();
  assert.match(await failed.getByTestId("detail-load-error").innerText(), /Couldn’t load details/);
  await failed.getByRole("button", { name: "Retry", exact: true }).waitFor();
  assert.match(await failed.getByText("Closed error fixture", { exact: true }).innerText(), /Closed error fixture/);

  // Open beads never depend on the detail request: an invalid body is ignored
  // and the list description renders immediately.
  await page.goto(`${base}/p/demo?bead=open-bead`);
  const openDialog = page.getByRole("dialog");
  await openDialog.getByText("Open description from list", { exact: true }).waitFor();
  await page.waitForTimeout(250);
  assert.equal(await openDialog.getByTestId("detail-loading").count(), 0);
  assert.equal(await openDialog.getByTestId("detail-load-error").count(), 0);

  // A valid delayed detail must preserve an open bead's in-progress edit.
  readOnly = false;
  let releaseOpenDetail;
  const draftEntered = new Promise((resolve) => { releaseOpenDetail = resolve; });
  await page.route("**/api/p/demo/beads/open-bead", async (route) => {
    await Promise.all([
      new Promise((resolve) => setTimeout(resolve, 800)),
      draftEntered,
    ]);
    return route.fulfill({ json: openBead });
  });
  const openDetailResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/p/demo/beads/open-bead" &&
    response.request().method() === "GET",
  );
  await page.goto(`${base}/p/demo?bead=open-bead`);
  const editingDialog = page.getByRole("dialog");
  await editingDialog.getByRole("button", { name: "Edit title & description", exact: true }).click();
  const titleInput = editingDialog.getByPlaceholder("Title", { exact: true });
  const titleDraft = "Open title draft survives detail arrival";
  await titleInput.fill(titleDraft);
  releaseOpenDetail();
  const response = await openDetailResponse;
  assert.equal(response.status(), 200);
  assert.equal(await response.finished(), null);
  await page.waitForTimeout(300);
  assert.equal(await titleInput.isVisible(), true);
  assert.equal(await titleInput.inputValue(), titleDraft);

  // A deep link's detail can arrive before the list. Keep the modal closed
  // until the list (and board live region) exists, so it cannot aria-hide the
  // entire app shell and swallow a later viewer-mode banner.
  let releaseList;
  listReady = new Promise((resolve) => { releaseList = resolve; });
  await page.route("**/api/p/demo/beads/open-bead", (route) =>
    route.fulfill({ json: openBead }),
  );
  const earlyDetailResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/p/demo/beads/open-bead" &&
    response.request().method() === "GET",
  );
  await page.goto(`${base}/p/demo?view=board&bead=open-bead`);
  const earlyResponse = await earlyDetailResponse;
  assert.equal(await earlyResponse.finished(), null);
  await page.waitForTimeout(300);
  assert.equal(await page.getByRole("dialog").count(), 0, "detail alone cannot open a modal over the loading shell");
  releaseList();
  await page.getByRole("dialog").getByRole("heading", { name: "Open fixture", exact: true }).waitFor();
  await page.locator('[id^="DndLiveRegion-"]').waitFor({ state: "attached" });
  readOnly = true;
  const banner = page.getByRole("button", { name: "Read Only Mode", exact: true });
  await banner.waitFor();
  assert.equal(await banner.count(), 1, "the viewer-mode banner remains in the accessibility tree with the drawer open");
  assert.deepEqual(errors, []);

  console.log("PASS: closed drawer loads details on demand, reports loading/failure with retry, open beads retain edit drafts, and early details wait for the list without hiding the viewer-mode banner");
} catch (error) {
  console.error({ errors, url: page?.url(), body: page ? (await page.locator("body").innerText()).slice(0, 3000) : "" });
  throw error;
} finally {
  await browser.close();
}

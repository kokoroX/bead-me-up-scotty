// Read-only agents regression: project responses use fixed fixtures throughout.
import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.SCOTTY_TEST_URL;
assert.ok(base, "Set SCOTTY_TEST_URL to an isolated demo server");

const bead = {
  id: "jkr-y124",
  title: "Agents fixture bead",
  status: "in_progress",
  issue_type: "task",
  priority: 2,
  labels: [],
  dependencies: [],
  created_at: "2026-10-26T00:00:00Z",
  updated_at: "2026-10-26T00:00:00Z",
};
const agent = (shortName, extra = {}) => ({
  name: `jikerental/${shortName}`,
  shortName,
  pool: "jikerental/backend.polecat",
  state: "working",
  running: true,
  suspended: false,
  activity: "in-turn",
  model: "fixture-model",
  provider: "claude",
  lastActivity: "2026-10-26T11:56:16+08:00",
  activeBead: null,
  unavailableReason: null,
  ...extra,
});
const agents = [
  agent("backend.furiosa", { activeBead: bead.id }),
  agent("backend.wisp-worker", { state: "waiting", activeBead: "jkr-wisp-az4g" }),
  agent("backend.stopped", { state: "stopped", running: false, activity: null }),
  agent("backend.suspended", { state: "suspended", running: false, suspended: true, unavailableReason: "agent is suspended", activeBead: bead.id }),
];
let response = { configured: true, rig: "jikerental", agents };
let status = 200;
const writes = [];
const browser = await chromium.launch();
let page;
try {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
  page = await context.newPage();
  page.setDefaultTimeout(15_000);
  await page.route("**/api/viewer-mode", (route) => route.fulfill({ json: { readOnly: true } }));
  await page.route("**/api/p/demo/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== "GET") {
      writes.push({ method: request.method(), path });
      return route.abort();
    }
    if (path.endsWith("/beads/stream")) return route.abort();
    if (path.endsWith("/agents")) return route.fulfill({ status, json: response });
    if (path.endsWith("/beads")) {
      return route.fulfill({ json: { beads: [bead], meta: { kind: "demo", humanActor: "reviewer", humanAllowlist: ["reviewer"], pollIntervalMs: 300_000 } } });
    }
    if (path.endsWith(`/beads/${bead.id}`)) return route.fulfill({ json: bead });
    return route.fulfill({ json: {} });
  });

  const url = new URL("/p/demo", base);
  url.searchParams.set("view", "agents");
  await page.goto(url.href);
  const main = page.getByRole("main");
  await main.getByRole("heading", { name: "Agents", exact: true }).waitFor();
  const running = main.locator("details").filter({ has: page.locator("summary", { hasText: "Running (2)" }) });
  const stopped = main.locator("details").filter({ has: page.locator("summary", { hasText: "Stopped & suspended (2)" }) });
  await running.getByText("backend.furiosa", { exact: true }).waitFor();
  assert.equal(await running.getAttribute("open"), "", "Running starts expanded");
  assert.equal(await running.getByText("backend.wisp-worker", { exact: true }).isVisible(), true);
  assert.equal(await stopped.getAttribute("open"), null, "Stopped & suspended starts collapsed");
  assert.equal(await stopped.getByText("backend.stopped", { exact: true }).isVisible(), false);
  await stopped.locator("summary").click();
  await stopped.getByText("backend.stopped", { exact: true }).waitFor();
  await stopped.getByText("backend.suspended", { exact: true }).waitFor();
  assert.equal(await stopped.locator("li").filter({ hasText: "backend.suspended" }).getAttribute("title"), "agent is suspended");
  await stopped.locator("summary").click();
  assert.equal(await stopped.getByText("backend.stopped", { exact: true }).isVisible(), false, "group can collapse again");
  await running.locator("summary").click();
  assert.equal(await running.getByText("backend.furiosa", { exact: true }).isVisible(), false, "Running can collapse too");
  await running.locator("summary").click();

  const row = running.locator("li").filter({ hasText: "backend.furiosa" });
  assert.equal(await row.getByText("Pool: backend.polecat", { exact: true }).isVisible(), true, "pool rig prefix is hidden");
  assert.equal(await row.getByText("Model: fixture-model", { exact: true }).isVisible(), true);
  assert.equal(await running.getByRole("button", { name: "jkr-wisp-az4g", exact: true }).count(), 0, "unknown wisps are not links");
  const wisp = running.getByText("jkr-wisp-az4g", { exact: true });
  await wisp.waitFor();
  assert.equal(await wisp.evaluate((element) => element.tagName), "SPAN");
  await wisp.click();
  assert.equal(await page.getByRole("dialog").count(), 0, "clicking plain wisp text leaves the drawer closed");

  await row.getByRole("button", { name: bead.id, exact: true }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("heading", { name: bead.title, exact: true }).waitFor();
  const beadAgents = page.getByTestId("bead-agents");
  await beadAgents.waitFor();
  await beadAgents.getByText(`${agents[0].shortName} · working`, { exact: true }).waitFor();
  await beadAgents.getByText(`${agents[3].shortName} · suspended`, { exact: true }).waitFor();
  assert.equal(new URL(page.url()).searchParams.get("view"), "agents");
  await drawer.getByRole("button", { name: "Close", exact: true }).click();
  await drawer.waitFor({ state: "detached" });

  response = { configured: false, agents: [] };
  await page.goto(url.href);
  await main.getByText("Set GASCITY_API_URL to enable the read-only Gas City agents view.", { exact: true }).waitFor();

  status = 502;
  response = { error: "gascity agents request failed: HTTP 503", code: "gascity_unavailable" };
  await page.goto(url.href);
  await main.getByRole("alert").filter({ hasText: response.error }).waitFor();

  status = 200;
  response = { configured: true, rig: "jikerental", agents: [] };
  await page.goto(url.href);
  await main.getByText("No agents in this rig.", { exact: true }).waitFor();
  response = {};
  await page.goto(url.href);
  await main.getByRole("alert").filter({ hasText: "Invalid agents response." }).waitFor();
  const missingAgentsUrl = new URL(url);
  missingAgentsUrl.searchParams.set("bead", bead.id);
  await page.goto(missingAgentsUrl.href);
  await drawer.getByRole("heading", { name: bead.title, exact: true }).waitFor();
  assert.equal(await page.getByTestId("bead-agents").count(), 0, "missing agents fields leave the drawer usable without an Agent section");

  assert.deepEqual(writes, [], "agents navigation and bead inspection never write project data");
  console.log("PASS: agents groups, known-bead links, inert wisps, drawer agents, pool prefixes, unconfigured/empty/error/missing-field states, and read-only behavior");
} catch (error) {
  console.error({ url: page?.url(), body: page ? (await page.locator("body").innerText()).slice(0, 3000) : "" });
  throw error;
} finally {
  await browser.close();
}

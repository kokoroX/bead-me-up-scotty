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
const systemAgent = (shortName, extra = {}) => agent(shortName, { pool: null, ...extra });
const agents = [
  agent("backend.furiosa", { activeBead: bead.id }),
  agent("backend.wisp-worker", { state: "waiting", activeBead: "jkr-wisp-az4g" }),
  agent("backend.stopped", { state: "stopped", running: false, activity: null }),
  agent("backend.suspended", { state: "suspended", running: false, suspended: true, unavailableReason: "agent is suspended", activeBead: bead.id }),
  agent("miniapp.worker", { pool: "jikerental/miniapp.polecat" }),
  agent("miniapp.stopped", { pool: "jikerental/miniapp.polecat", state: "stopped", running: false, activity: null }),
  agent("ledger.stopped", { pool: "jikerental/ledger.polecat", state: "stopped", running: false, activity: null, activeBead: bead.id }),
  systemAgent("mayor", { state: "working" }),
  systemAgent("witness", { state: "stopped", running: false, activity: null }),
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

  // Default view: type grouping. System comes first, then polecats.
  const toggle = main.getByTestId("agents-group-toggle");
  await toggle.waitFor();
  const typeButton = toggle.getByRole("button", { name: "Type", exact: true });
  const statusButton = toggle.getByRole("button", { name: "Status", exact: true });
  assert.equal(await typeButton.getAttribute("aria-pressed"), "true", "Type is the default grouping");
  assert.equal(await statusButton.getAttribute("aria-pressed"), "false");
  assert.equal(new URL(page.url()).searchParams.has("agentsGroup"), false, "default type grouping has no URL param");

  const systemSection = main.getByTestId("agents-section-system");
  const polecatSection = main.getByTestId("agents-section-polecat");
  await systemSection.waitFor();
  await polecatSection.waitFor();
  assert.deepEqual(
    await main.locator('[data-testid^="agents-section-"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-testid"))),
    ["agents-section-system", "agents-section-polecat"],
    "System section renders before Polecats",
  );
  assert.equal(await systemSection.getAttribute("open"), "", "System starts expanded");
  assert.equal(await polecatSection.getAttribute("open"), "", "Polecats starts expanded");
  assert.equal(await systemSection.locator(":scope > summary").innerText(), "System (2 · 1 running)");
  assert.equal(await polecatSection.locator(":scope > summary").innerText(), "Polecats (7 · 3 running)");

  // System agents: running ones listed directly, the rest behind a collapsed subgroup.
  assert.equal(await systemSection.getByText("mayor", { exact: true }).isVisible(), true);
  const systemStopped = systemSection.locator("details");
  assert.equal(await systemStopped.count(), 1);
  assert.equal(await systemStopped.getAttribute("open"), null, "stopped system agents start collapsed");
  assert.equal(await systemStopped.getByText("witness", { exact: true }).isVisible(), false);

  // Polecats: one subgroup per pool, alphabetical; a pool with nothing running starts collapsed.
  assert.deepEqual(
    await polecatSection.locator("[data-agent-pool]").evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-agent-pool"))),
    ["backend", "ledger", "miniapp"],
  );
  const backend = polecatSection.locator('[data-agent-pool="backend"]');
  const ledger = polecatSection.locator('[data-agent-pool="ledger"]');
  const miniapp = polecatSection.locator('[data-agent-pool="miniapp"]');
  assert.equal(await backend.locator(":scope > summary").innerText(), "backend (4 · 2 running)");
  assert.equal(await ledger.locator(":scope > summary").innerText(), "ledger (1 · 0 running)");
  assert.equal(await miniapp.locator(":scope > summary").innerText(), "miniapp (2 · 1 running)");
  assert.equal(await backend.getAttribute("open"), "", "pools with running agents start expanded");
  assert.equal(await miniapp.getAttribute("open"), "", "pools with running agents start expanded");
  assert.equal(await ledger.getAttribute("open"), null, "a pool with no running agents starts collapsed");

  assert.equal(await backend.getByText("backend.furiosa", { exact: true }).isVisible(), true);
  assert.equal(await backend.getByText("backend.wisp-worker", { exact: true }).isVisible(), true);
  assert.equal(await miniapp.getByText("miniapp.worker", { exact: true }).isVisible(), true);
  const backendStopped = backend.locator("details");
  assert.equal(await backendStopped.count(), 1);
  assert.equal(await backendStopped.getAttribute("open"), null, "stopped polecats start collapsed");
  assert.equal(await backendStopped.getByText("backend.stopped", { exact: true }).isVisible(), false);
  await backendStopped.locator(":scope > summary").click();
  await backendStopped.getByText("backend.stopped", { exact: true }).waitFor();
  await backendStopped.getByText("backend.suspended", { exact: true }).waitFor();
  assert.equal(await backendStopped.locator("li").filter({ hasText: "backend.suspended" }).getAttribute("title"), "agent is suspended");
  await backendStopped.locator(":scope > summary").click();
  assert.equal(await backendStopped.getByText("backend.stopped", { exact: true }).isVisible(), false, "stopped polecats can collapse again");

  const row = backend.locator("li").filter({ hasText: "backend.furiosa" });
  assert.equal(await row.getByText("Pool: backend.polecat", { exact: true }).isVisible(), true, "pool rig prefix is hidden");
  assert.equal(await row.getByText("Model: fixture-model", { exact: true }).isVisible(), true);
  assert.equal(await backend.getByRole("button", { name: "jkr-wisp-az4g", exact: true }).count(), 0, "unknown wisps are not links");
  const wisp = backend.getByText("jkr-wisp-az4g", { exact: true });
  await wisp.waitFor();
  assert.equal(await wisp.evaluate((element) => element.tagName), "SPAN");
  await wisp.click();
  assert.equal(await page.getByRole("dialog").count(), 0, "clicking plain wisp text leaves the drawer closed");

  await ledger.locator(":scope > summary").click();
  assert.equal(await ledger.getByText("ledger.stopped", { exact: true }).count(), 1);
  assert.equal(await ledger.getByText("ledger.stopped", { exact: true }).isVisible(), false, "stopped agents stay collapsed inside a stopped pool");
  await ledger.locator(":scope > summary").click();
  assert.equal(await ledger.getAttribute("open"), null);

  // Switching to status grouping puts the original Running / Stopped & suspended
  // groups back and records the choice in the URL without a history entry.
  const historyLength = await page.evaluate(() => history.length);
  await statusButton.click();
  await page.waitForFunction(() => new URL(location.href).searchParams.get("agentsGroup") === "status");
  assert.equal(await page.evaluate(() => history.length), historyLength, "group toggle replaces instead of pushing history");
  assert.equal(await statusButton.getAttribute("aria-pressed"), "true");
  assert.equal(await typeButton.getAttribute("aria-pressed"), "false");
  assert.equal(await main.getByTestId("agents-section-system").count(), 0);
  assert.equal(await main.getByTestId("agents-section-polecat").count(), 0);

  const running = main.locator("details").filter({ has: page.locator("summary", { hasText: "Running (4)" }) });
  const stopped = main.locator("details").filter({ has: page.locator("summary", { hasText: "Stopped & suspended (5)" }) });
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

  await typeButton.click();
  await page.waitForFunction(() => !new URL(location.href).searchParams.has("agentsGroup"));
  assert.equal(await typeButton.getAttribute("aria-pressed"), "true");
  await main.getByTestId("agents-section-system").waitFor();

  await backend.locator("li").filter({ hasText: "backend.furiosa" }).getByRole("button", { name: bead.id, exact: true }).evaluate((link) => link.click());
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("heading", { name: bead.title, exact: true }).waitFor();
  const badge = drawer.getByTestId("bead-agent-badge");
  await badge.waitFor();
  const badgeText = await badge.innerText();
  assert.ok(badgeText.includes(agents[0].shortName), "header badge names the agent");
  assert.ok(badgeText.includes("working"), "header badge shows the agent state");
  assert.ok(badgeText.includes("+2"), "header badge counts the other agents");
  assert.match(await badge.getAttribute("title"), /View in Agents/);
  const beadAgents = page.getByTestId("bead-agents");
  await beadAgents.waitFor();
  await beadAgents.getByText(agents[0].shortName, { exact: true }).waitFor();
  await beadAgents.getByText("working", { exact: true }).first().waitFor();
  await beadAgents.getByText("Model: fixture-model", { exact: true }).first().waitFor();
  await beadAgents.getByText(agents[3].shortName, { exact: true }).waitFor();
  await beadAgents.getByText("suspended", { exact: true }).first().waitFor();
  await beadAgents.getByText("ledger.stopped", { exact: true }).waitFor();
  assert.equal(await beadAgents.getByTestId("bead-agent-link").count(), 3);
  assert.equal(new URL(page.url()).searchParams.get("view"), "agents");
  // Active agents follow the fixture order: furiosa, suspended, ledger.stopped.
  // Collapse all three ancestors while the drawer makes the page inert.
  const inertPolecatSection = page.locator('[data-testid="agents-section-polecat"]');
  const inertLedger = page.locator('[data-testid="agents-section-polecat"] [data-agent-pool="ledger"]');
  const inertLedgerStopped = page.locator('[data-testid="agents-section-polecat"] [data-agent-pool="ledger"] details');
  await inertPolecatSection.evaluate((section) => { section.open = false; });
  assert.equal(await inertPolecatSection.getAttribute("open"), null);
  await inertLedger.evaluate((pool) => { pool.open = false; });
  assert.equal(await inertLedger.getAttribute("open"), null);
  await inertLedgerStopped.evaluate((group) => { group.open = false; });
  assert.equal(await inertLedgerStopped.getAttribute("open"), null);
  await beadAgents.getByTestId("bead-agent-link").nth(2).click();
  await drawer.waitFor({ state: "detached" });
  const focusedRow = page.locator(`[data-agent-name="${agents[6].name}"]`);
  await focusedRow.waitFor();
  assert.equal(await focusedRow.isVisible(), true, "focused agent row is visible");
  assert.equal(await focusedRow.getAttribute("data-highlighted"), "true");
  assert.equal(await main.getByTestId("agents-section-polecat").getAttribute("open"), "", "jump expands the Polecats section");
  const focusedLedger = main.locator('[data-agent-pool="ledger"]');
  assert.equal(await focusedLedger.getAttribute("open"), "", "jump expands the ledger pool");
  assert.equal(await focusedLedger.locator("details").getAttribute("open"), "", "jump expands the nested Stopped & suspended group");
  assert.equal(new URL(page.url()).searchParams.get("view"), "agents");
  assert.equal(new URL(page.url()).searchParams.get("agent"), agents[6].name);
  await page.waitForFunction(() => !new URL(location.href).searchParams.has("agent"));

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
  assert.equal(await page.getByTestId("bead-agent-badge").count(), 0, "missing agents fields leave the header without an agent badge");

  assert.deepEqual(writes, [], "agents navigation and bead inspection never write project data");
  console.log("PASS: type/status grouping toggle, system/polecat sections, polecat pool subgroups, collapsed stopped groups, known-bead links, inert wisps, drawer agent badge/cards, multi-level agent jump highlight, pool prefixes, unconfigured/empty/error/missing-field states, and read-only behavior");
} catch (error) {
  console.error({ url: page?.url(), body: page ? (await page.locator("body").innerText()).slice(0, 3000) : "" });
  throw error;
} finally {
  await browser.close();
}

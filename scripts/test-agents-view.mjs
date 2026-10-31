// Read-only agents regression: project and transcript responses use fixed fixtures.
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
  activeBeadSummary: null,
  unavailableReason: null,
  contextPct: null,
  contextWindow: null,
  ...extra,
});
const systemAgent = (shortName, extra = {}) => agent(shortName, { pool: null, ...extra });
const agents = [
  agent("backend.furiosa", {
    activeBead: bead.id, contextPct: 42, contextWindow: 200_000,
    activeBeadSummary: { id: bead.id, title: bead.title, status: bead.status, type: "task", priority: 2 },
  }),
  agent("backend.wisp-worker", {
    state: "waiting", activeBead: "jkr-wisp-az4g",
    activeBeadSummary: { id: "jkr-wisp-az4g", title: "mol-witness-patrol", status: "in_progress", type: "molecule", priority: null },
  }),
  agent("backend.stopped", { state: "stopped", running: false, activity: null }),
  agent("backend.suspended", { state: "suspended", running: false, suspended: true, unavailableReason: "agent is suspended", activeBead: bead.id }),
  agent("miniapp.worker", { pool: "jikerental/miniapp.polecat", state: "idle" }),
  agent("miniapp.stopped", { pool: "jikerental/miniapp.polecat", state: "stopped", running: false, activity: null }),
  agent("ledger.stopped", { pool: "jikerental/ledger.polecat", state: "stopped", running: false, activity: null, activeBead: bead.id }),
  systemAgent("mayor", { state: "working" }),
  systemAgent("witness", { state: "stopped", running: false, activity: null }),
];
const resultText = "Fixture tool output with several lines of useful information. ".repeat(3);
const transcript = {
  configured: true,
  available: true,
  format: "structured",
  turns: [
    { id: "turn-2", role: "assistant", text: "[thinking] Private fixture thought" },
    { id: "turn-3", role: "assistant", text: "[Read]" },
    { id: "turn-4", role: "user", text: `[result] ${resultText}` },
    { id: "turn-5", role: "assistant", text: "Plain fixture text <b>never HTML</b>\nSecond line" },
  ],
  pagination: { hasOlder: true, total: 5 },
};
const olderTranscript = {
  ...transcript,
  turns: [{ id: "turn-1", role: "user", text: "An earlier fixture request" }],
  pagination: { hasOlder: false, total: 5 },
};
let response = { configured: true, rig: "jikerental", agents };
let status = 200;
let outputResponse = transcript;
let outputStatus = 200;
const outputRequests = [];
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
  await page.route("**/agents/output**", async (route) => {
    const request = route.request();
    if (request.method() !== "GET") {
      writes.push({ method: request.method(), path: new URL(request.url()).pathname });
      return route.abort();
    }
    const params = new URL(request.url()).searchParams;
    outputRequests.push(Object.fromEntries(params));
    if (params.has("before")) {
      assert.equal(params.get("before"), "turn-2", "older pages use the first turn's id");
      return route.fulfill({ json: olderTranscript });
    }
    return route.fulfill({ status: outputStatus, json: outputResponse });
  });

  const url = new URL("/p/demo", base);
  url.searchParams.set("view", "agents");
  await page.goto(url.href);
  const main = page.getByRole("main");
  const detail = main.getByTestId("agent-detail");
  const conversation = detail.getByTestId("agent-conversation");
  const row = (name) => main.locator(`[data-agent-name="jikerental/${name}"]`);
  await main.getByRole("heading", { name: "Agents", exact: true }).waitFor();
  await detail.getByRole("heading", { name: agents[0].shortName, exact: true }).waitFor();
  const stateChip = (state) =>
    detail.locator(`[data-state="${state}"]`).filter({ hasText: state });
  const workingStateColor = await stateChip("working").evaluate((node) => getComputedStyle(node).color);
  await page.waitForFunction((name) => new URL(location.href).searchParams.get("agent") === name, agents[0].name);
  assert.equal(await row(agents[0].shortName).getAttribute("aria-current"), "true", "first working agent is selected");
  await conversation.getByTestId("agent-turn").first().waitFor();
  assert.equal(outputRequests[0].agent, agents[0].shortName, "output requests use the short name");
  assert.match(await detail.getByTestId("agent-context-meter").innerText(), /42%/);
  assert.match(await detail.getByTestId("agent-context-meter").innerText(), /84k \/ 200k tokens/);
  const states = main.getByTestId("agents-state-filter");
  const allChip = states.locator('[data-agent-state="all"]');
  assert.equal(await allChip.getAttribute("aria-pressed"), "true", "All is selected without a state parameter");
  assert.equal(await allChip.getAttribute("aria-label"), `All (${agents.length})`);
  const taskSummary = row("backend.furiosa").getByTestId("agent-row-bead");
  assert.match(await taskSummary.innerText(), /Agents fixture bead/);
  assert.match(await taskSummary.innerText(), /P2/);
  assert.match(await taskSummary.innerText(), /jkr-y124/);
  assert.equal(await taskSummary.getByText(bead.title, { exact: true }).getAttribute("title"), bead.title);
  const wispSummary = row("backend.wisp-worker").getByTestId("agent-row-bead");
  assert.match(await wispSummary.innerText(), /molecule/);
  assert.match(await wispSummary.innerText(), /mol-witness-patrol/);
  assert.doesNotMatch(await wispSummary.innerText(), /P/);
  assert.equal(await row("backend.stopped").getByTestId("agent-row-bead").count(), 0);
  assert.equal((await row("backend.suspended").getByTestId("agent-row-bead").textContent()).trim(), bead.id, "missing summaries fall back to the bead id");

  // Four structured turn types remain plain text; thoughts and results collapse.
  assert.equal(await conversation.getByTestId("agent-turn").count(), 4);
  const thinking = conversation.getByTestId("agent-turn").nth(0);
  assert.equal(await thinking.getAttribute("data-role"), "assistant");
  assert.equal(await thinking.locator("details").getAttribute("open"), null);
  assert.equal(await thinking.locator("summary").innerText(), "Thinking…");
  assert.equal(await thinking.getByText("Private fixture thought", { exact: true }).isVisible(), false);
  const tool = conversation.getByTestId("agent-turn").nth(1);
  assert.equal(await tool.getByText("Read", { exact: true }).evaluate((node) => node.tagName), "SPAN");
  const result = conversation.getByTestId("agent-turn").nth(2);
  assert.equal(await result.getAttribute("data-role"), "user");
  assert.equal(await result.locator("details").getAttribute("open"), null);
  assert.equal(await result.locator("summary").innerText(), `${resultText.trim().slice(0, 60)}…`);
  await result.locator("summary").click();
  assert.equal(await result.locator("details").getAttribute("open"), "");
  const plain = conversation.getByTestId("agent-turn").nth(3);
  assert.match(await plain.innerText(), /<b>never HTML<\/b>/);
  assert.equal(await plain.locator("b").count(), 0);
  await conversation.getByTestId("agent-load-older").click();
  await conversation.getByText("An earlier fixture request", { exact: true }).waitFor();
  assert.equal(await conversation.getByTestId("agent-turn").count(), 5);
  assert.match(await conversation.getByTestId("agent-turn").first().innerText(), /An earlier fixture request/);
  assert.equal(await conversation.getByTestId("agent-load-older").count(), 0);
  assert.equal(outputRequests.some((request) => request.before === "turn-2"), true);

  // Default type grouping: System, then Polecats, then alphabetical pools.
  const toggle = main.getByTestId("agents-group-toggle");
  const typeButton = toggle.getByRole("button", { name: "Type", exact: true });
  const statusButton = toggle.getByRole("button", { name: "Status", exact: true });
  assert.equal(await typeButton.getAttribute("aria-pressed"), "true");
  assert.equal(await statusButton.getAttribute("aria-pressed"), "false");
  assert.equal(new URL(page.url()).searchParams.has("agentsGroup"), false);
  const systemSection = main.getByTestId("agents-section-system");
  const polecatSection = main.getByTestId("agents-section-polecat");
  assert.deepEqual(
    await main.locator('[data-testid^="agents-section-"]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute("data-testid"))),
    ["agents-section-system", "agents-section-polecat"],
  );
  assert.equal(await systemSection.getAttribute("open"), "");
  assert.equal(await polecatSection.getAttribute("open"), "");
  assert.equal(await systemSection.locator(":scope > summary").innerText(), "System (2 · 1 running)");
  assert.equal(await polecatSection.locator(":scope > summary").innerText(), "Polecats (7 · 3 running)");
  assert.equal(await row("mayor").isVisible(), true);
  const systemStopped = systemSection.locator("details");
  assert.equal(await systemStopped.count(), 1);
  assert.equal(await systemStopped.getAttribute("open"), null);
  assert.equal(await row("witness").isVisible(), false);
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
  assert.equal(await backend.getAttribute("open"), "");
  assert.equal(await miniapp.getAttribute("open"), "");
  assert.equal(await ledger.getAttribute("open"), null);
  const backendStopped = backend.locator("details");
  assert.equal(await backendStopped.getAttribute("open"), null);
  assert.equal(await row("backend.stopped").isVisible(), false);
  await backendStopped.locator(":scope > summary").click();
  await row("backend.stopped").waitFor();
  assert.equal(await row("backend.suspended").getAttribute("title"), "agent is suspended");
  await backendStopped.locator(":scope > summary").click();
  assert.equal(await row("backend.stopped").isVisible(), false, "stopped group can collapse again");
  await ledger.locator(":scope > summary").click();
  assert.equal(await row("ledger.stopped").isVisible(), false, "stopped rows have their own disclosure");
  await ledger.locator(":scope > summary").click();

  // Selecting a row changes the detail and the persistent URL selection.
  await row("backend.wisp-worker").click();
  await detail.getByRole("heading", { name: "backend.wisp-worker", exact: true }).waitFor();
  assert.equal(await stateChip("waiting").count(), 1, "detail header chip carries its state");
  assert.notEqual(
    await stateChip("waiting").evaluate((node) => getComputedStyle(node).color),
    workingStateColor,
    "waiting and working chips use different accents",
  );
  assert.equal(new URL(page.url()).searchParams.get("agent"), agents[1].name);
  assert.equal(await row("backend.wisp-worker").getAttribute("aria-current"), "true");
  assert.equal(await row("backend.furiosa").getAttribute("aria-current"), null);
  assert.match(await detail.getByTestId("agent-context-meter").innerText(), /Context usage not reported/);
  const wisp = detail.getByText("jkr-wisp-az4g", { exact: true });
  assert.equal(await wisp.evaluate((element) => element.tagName), "SPAN");
  await wisp.click();
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(await detail.getByRole("button", { name: "jkr-wisp-az4g", exact: true }).count(), 0);
  const conversationTab = detail.getByRole("tab", { name: "Conversation", exact: true });
  await conversationTab.focus();
  await conversationTab.press("ArrowRight");
  const detailsTab = detail.getByRole("tab", { name: "Details", exact: true });
  assert.equal(await detailsTab.getAttribute("aria-selected"), "true");
  assert.match(await detail.getByRole("tabpanel").innerText(), /jikerental\/backend.wisp-worker/);
  await detailsTab.press("Home");
  assert.equal(await conversationTab.getAttribute("aria-selected"), "true");

  // Name and state filters affect the master list and use replace for URL state.
  const filter = main.getByTestId("agents-filter");
  await filter.fill("MINIAPP");
  assert.equal(await main.locator("[data-agent-name]").count(), 2);
  assert.equal(await row("miniapp.worker").isVisible(), true);
  await filter.fill("");
  // Each state dot carries its data-state and a distinct accent: working is the
  // brand color, waiting amber, idle blue, stopped grey. Suspended is a hollow
  // dashed ring rather than a filled dot.
  const stateDot = (state) =>
    states.locator(`[data-agent-state="${state}"] [data-state="${state}"]`);
  const dotColors = [];
  for (const state of ["working", "waiting", "idle", "stopped"]) {
    assert.equal(await stateDot(state).count(), 1, `${state} dot carries data-state`);
    dotColors.push(await stateDot(state).evaluate((node) => getComputedStyle(node).backgroundColor));
  }
  assert.equal(new Set(dotColors).size, 4, "state dots use four different colors");
  assert.equal(
    await stateDot("suspended").evaluate((node) => getComputedStyle(node).borderStyle),
    "dashed",
    "suspended is a hollow dashed ring",
  );
  // Next 16.4 reflects native history updates before the filter UI commits.
  // Wait for the rendered chip too before checking filtered rows.
  const waitForState = (state) => page.waitForFunction((expected) =>
    new URL(location.href).searchParams.get("agentsState") === expected &&
    document.querySelector(`[data-agent-state="${expected}"]`)?.getAttribute("aria-pressed") === "true",
    state,
  );
  const historyLength = await page.evaluate(() => history.length);
  const waitingChip = states.getByRole("button", { name: "Waiting (1)", exact: true });
  await waitingChip.click();
  await waitForState("waiting");
  assert.equal(await waitingChip.getAttribute("aria-pressed"), "true");
  assert.equal(await main.locator("[data-agent-name]").count(), 1);
  assert.equal(await row("backend.wisp-worker").isVisible(), true);
  await waitingChip.click();
  await waitForState("all");
  assert.equal(await allChip.getAttribute("aria-pressed"), "true");
  assert.equal(await main.locator("[data-agent-name]").count(), agents.length);
  await states.getByRole("button", { name: "Working (2)", exact: true }).click();
  await waitForState("working");
  await allChip.click();
  await waitForState("all");
  assert.equal(await main.locator("[data-agent-name]").count(), agents.length);
  await states.getByRole("button", { name: "Suspended (1)", exact: true }).click();
  await waitForState("suspended");
  assert.equal(await main.locator("[data-agent-name]").count(), 1);
  assert.equal(await row("backend.suspended").isVisible(), true);
  assert.equal(await page.evaluate(() => history.length), historyLength);
  await states.getByRole("button", { name: "Suspended (1)", exact: true }).click();
  await waitForState("all");
  assert.equal(await allChip.getAttribute("aria-pressed"), "true");
  assert.equal(await main.locator("[data-agent-name]").count(), agents.length);
  await filter.fill("does-not-exist");
  await main.getByText("No matching agents.", { exact: true }).waitFor();
  await filter.fill("");

  // Status mode preserves Running / Stopped & suspended and history length.
  await statusButton.click();
  await page.waitForFunction(() => new URL(location.href).searchParams.get("agentsGroup") === "status");
  assert.equal(await page.evaluate(() => history.length), historyLength);
  assert.equal(await statusButton.getAttribute("aria-pressed"), "true");
  assert.equal(await main.getByTestId("agents-section-system").count(), 0);
  assert.equal(await main.getByTestId("agents-section-polecat").count(), 0);
  const running = main.locator('[data-group-key="status-running"]');
  const stopped = main.locator('[data-group-key="status-stopped"]');
  assert.equal(await running.locator(":scope > summary").innerText(), "Running (4)");
  assert.equal(await stopped.locator(":scope > summary").innerText(), "Stopped & suspended (5)");
  assert.equal(await running.getAttribute("open"), "");
  assert.equal(await stopped.getAttribute("open"), null);
  await stopped.locator(":scope > summary").click();
  await row("backend.suspended").waitFor();
  assert.equal(await row("backend.suspended").getAttribute("title"), "agent is suspended");
  await stopped.locator(":scope > summary").click();
  assert.equal(await row("backend.stopped").isVisible(), false);
  await running.locator(":scope > summary").click();
  assert.equal(await row("backend.furiosa").isVisible(), false, "running group can collapse");
  await running.locator(":scope > summary").click();
  await typeButton.click();
  await page.waitForFunction(() => !new URL(location.href).searchParams.has("agentsGroup"));

  // Known beads open the modal; jump back reveals every selected-row ancestor.
  await row("backend.furiosa").click();
  await detail.getByRole("button", { name: bead.id, exact: true }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("heading", { name: bead.title, exact: true }).waitFor();
  const badge = drawer.getByTestId("bead-agent-badge");
  const badgeText = await badge.innerText();
  assert.ok(badgeText.includes(agents[0].shortName));
  assert.ok(badgeText.includes("working"));
  assert.ok(badgeText.includes("+2"));
  assert.match(await badge.getAttribute("title"), /View in Agents/);
  const beadAgents = page.getByTestId("bead-agents");
  await beadAgents.getByText(agents[0].shortName, { exact: true }).waitFor();
  await beadAgents.getByText("Model: fixture-model", { exact: true }).first().waitFor();
  await beadAgents.getByText(agents[3].shortName, { exact: true }).waitFor();
  await beadAgents.getByText("suspended", { exact: true }).first().waitFor();
  await beadAgents.getByText("ledger.stopped", { exact: true }).waitFor();
  assert.equal(await beadAgents.getByTestId("bead-agent-link").count(), 3);
  // Use CSS locators for the page while Base UI marks the background inert.
  const inertPolecat = page.locator('[data-testid="agents-section-polecat"]');
  const inertLedger = page.locator('[data-testid="agents-section-polecat"] [data-agent-pool="ledger"]');
  const inertLedgerStopped = inertLedger.locator("details");
  await inertPolecat.evaluate((node) => { node.open = false; });
  await inertLedger.evaluate((node) => { node.open = false; });
  await inertLedgerStopped.evaluate((node) => { node.open = false; });
  await beadAgents.getByTestId("bead-agent-link").nth(2).click();
  await drawer.waitFor({ state: "detached" });
  await detail.getByRole("heading", { name: "ledger.stopped", exact: true }).waitFor();
  const selected = row("ledger.stopped");
  await selected.waitFor();
  assert.equal(await selected.isVisible(), true);
  assert.equal(await selected.getAttribute("aria-current"), "true");
  assert.equal(await polecatSection.getAttribute("open"), "");
  assert.equal(await ledger.getAttribute("open"), "");
  assert.equal(await ledger.locator("details").getAttribute("open"), "");
  assert.equal(new URL(page.url()).searchParams.get("agent"), agents[6].name);
  await page.reload();
  await detail.getByRole("heading", { name: "ledger.stopped", exact: true }).waitFor();
  assert.equal(await row("ledger.stopped").getAttribute("aria-current"), "true", "selection survives reload");

  const allUrl = new URL(url);
  allUrl.searchParams.set("agentsState", "all");
  await page.goto(allUrl.href);
  await detail.getByRole("heading", { name: agents[0].shortName, exact: true }).waitFor();
  assert.equal(await allChip.getAttribute("aria-pressed"), "true", "explicit all URLs select All");
  assert.equal(await main.locator("[data-agent-name]").count(), agents.length);
  assert.equal(await backend.locator("details").getAttribute("open"), null, "All does not force stopped groups open");
  const unknownStateUrl = new URL(url);
  unknownStateUrl.searchParams.set("agentsState", "future-state");
  await page.goto(unknownStateUrl.href);
  await detail.getByRole("heading", { name: agents[0].shortName, exact: true }).waitFor();
  assert.equal(await allChip.getAttribute("aria-pressed"), "true", "unknown states fall back to All");
  assert.equal(await main.locator("[data-agent-name]").count(), agents.length);

  // Transcript failures and missing fields leave the master list usable.
  outputResponse = { configured: true, available: false };
  await page.goto(url.href);
  await conversation.getByText("No transcript for this agent.", { exact: true }).waitFor();
  assert.equal(await row("backend.furiosa").isVisible(), true);
  await row("backend.wisp-worker").click();
  await detail.getByRole("heading", { name: "backend.wisp-worker", exact: true }).waitFor();
  outputStatus = 502;
  outputResponse = { error: "fixture output unavailable", code: "gascity_unavailable" };
  await page.goto(url.href);
  await conversation.getByRole("alert").filter({ hasText: "fixture output unavailable" }).waitFor();
  assert.equal(await row("mayor").isVisible(), true);
  await row("mayor").click();
  await detail.getByRole("heading", { name: "mayor", exact: true }).waitFor();
  outputStatus = 200;
  outputResponse = { configured: true, available: true, turns: null };
  await page.goto(url.href);
  await conversation.getByText("No messages yet.", { exact: true }).waitFor();
  outputResponse = { configured: "true", available: "true" };
  await page.goto(url.href);
  await conversation.getByText("Gas City is not configured.", { exact: true }).waitFor();
  outputResponse = { ...transcript, format: "text", pagination: { hasOlder: false, total: 4 } };
  await page.goto(url.href);
  await conversation.locator("pre").waitFor();
  assert.match(await conversation.locator("pre").innerText(), /\[thinking\]/);
  assert.match(await conversation.locator("pre").innerText(), /<b>never HTML<\/b>/);
  assert.equal(await conversation.locator("pre b").count(), 0);
  outputResponse = transcript;

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
  assert.equal(await page.getByTestId("bead-agents").count(), 0);
  assert.equal(await page.getByTestId("bead-agent-badge").count(), 0);

  assert.deepEqual(writes, [], "agents, transcripts and bead inspection never write project data");
  console.log("PASS: master/detail selection, active bead row summaries, All/state filters, persistent URL, structured/plain transcripts, older pages, context meter, type/status grouping, drawer jump, transcript/list errors, missing fields and read-only behavior");
} catch (error) {
  console.error({ url: page?.url(), body: page ? (await page.locator("body").innerText()).slice(0, 3000) : "" });
  throw error;
} finally {
  await browser.close();
}

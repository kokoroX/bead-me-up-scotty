import assert from "node:assert/strict";
import { agentType, attachBeadSummaries, createCityAgentsCache, parseAgentOutputQuery, parseRigMap, polecatPoolName, rigForProject, toAgentOutput, toBeadSummary, toProjectAgents } from "../lib/gascity-agents.ts";

const rig = "jikerental";
const agent = (name, extra = {}) => ({ name: `${rig}/${name}`, rig, ...extra });

const filtered = toProjectAgents({ items: [
  agent("backend.furiosa"),
  { name: "mayor" },
  { name: "other/polecat", rig: "other" },
  { name: "unknown-rig", rig: null },
], total: 4, future_field: true }, rig);
assert.deepEqual(filtered.map((entry) => entry.name), ["jikerental/backend.furiosa"]);
assert.deepEqual(toProjectAgents({ items: [] }, rig), []);

const sorted = toProjectAgents({ items: [
  agent("stopped", { state: "stopped" }),
  agent("idle", { running: true, state: "idle" }),
  agent("working-z", { running: true, state: "working" }),
  agent("waiting", { running: true, state: "waiting" }),
  agent("working-a", { running: true, state: "working" }),
  agent("other", { running: true, state: "future-state" }),
  agent("off-waiting", { state: "waiting" }),
  agent("off-working", { state: "working" }),
  agent("off-idle", { state: "idle" }),
  agent("suspended", { state: "suspended", suspended: true }),
  agent("off-working-a", { state: "working" }),
] }, rig);
assert.deepEqual(sorted.map((entry) => entry.shortName), [
  "working-a", "working-z", "waiting", "idle", "other",
  "off-working", "off-working-a", "off-waiting", "off-idle", "stopped", "suspended",
]);

const lastActivity = "2026-10-26T11:56:16+08:00";
const [full] = toProjectAgents({ items: [agent("backend.furiosa", {
  pool: "jikerental/backend.polecat",
  state: "working",
  running: true,
  suspended: false,
  activity: "in-turn",
  model: "gpt-6-luna",
  provider: "claude",
  active_bead: "jkr-y124",
  unavailable_reason: "agent is suspended",
  context_pct: 42.5,
  context_window: 200_000,
  session: { name: "session-name", last_activity: lastActivity, attached: false },
  future_field: "ignored",
})] }, rig);
assert.deepEqual(full, {
  name: "jikerental/backend.furiosa",
  shortName: "backend.furiosa",
  pool: "jikerental/backend.polecat",
  state: "working",
  running: true,
  suspended: false,
  activity: "in-turn",
  model: "gpt-6-luna",
  provider: "claude",
  lastActivity,
  activeBead: "jkr-y124",
  activeBeadSummary: null,
  unavailableReason: "agent is suspended",
  contextPct: 42.5,
  contextWindow: 200_000,
});
// The view strips the rig prefix; the model preserves the upstream pool value.
const displayPool = (pool) => pool?.startsWith(`${rig}/`) ? pool.slice(rig.length + 1) : pool;
assert.equal(displayPool(full.pool), "backend.polecat");
const [unprefixed] = toProjectAgents({ items: [{ name: "standalone", rig, pool: "shared/polecat" }] }, rig);
assert.equal(unprefixed.shortName, "standalone");
assert.equal(unprefixed.pool, "shared/polecat");
assert.equal(displayPool(unprefixed.pool), "shared/polecat");
const [similarPrefix] = toProjectAgents({ items: [{ name: "jikerental-other/agent", rig }] }, rig);
assert.equal(similarPrefix.shortName, "jikerental-other/agent");

assert.equal(agentType("jikerental/backend.polecat", rig), "polecat");
assert.equal(agentType("jikerental/miniapp.polecat", rig), "polecat");
assert.equal(agentType("backend.polecat", rig), "polecat");
assert.equal(agentType(null, rig), "system");
assert.equal(agentType("", rig), "system");
assert.equal(agentType("jikerental/claude", rig), "system");
assert.equal(agentType("jikerental/backend.polecat.extra", rig), "system");
assert.equal(polecatPoolName("jikerental/backend.polecat", rig), "backend");
assert.equal(polecatPoolName("jikerental/miniapp.polecat", rig), "miniapp");
assert.equal(polecatPoolName("backend.polecat", rig), "backend");
assert.equal(polecatPoolName(null, rig), null);
assert.equal(polecatPoolName("jikerental/claude", rig), null);
assert.equal(polecatPoolName("jikerental", rig), null);

const [minimal] = toProjectAgents({ items: [agent("minimal")] }, rig);
assert.deepEqual(minimal, {
  name: "jikerental/minimal", shortName: "minimal", pool: null, state: "unknown",
  running: false, suspended: false, activity: null, model: null, provider: null,
  lastActivity: null, activeBead: null, activeBeadSummary: null, unavailableReason: null,
  contextPct: null, contextWindow: null,
});
const [nullable] = toProjectAgents({ items: [agent("nullable", {
  pool: null, state: null, running: null, suspended: null, activity: null,
  model: null, provider: null, active_bead: null, unavailable_reason: null, session: null,
  context_pct: null, context_window: null,
})] }, rig);
assert.deepEqual(nullable, { ...minimal, name: "jikerental/nullable", shortName: "nullable" });
assert.equal(toProjectAgents({ items: [agent("session", { session: {} })] }, rig)[0].lastActivity, null);
assert.equal(toProjectAgents({ items: [agent("session", { session: { last_activity: null } })] }, rig)[0].lastActivity, null);

for (const raw of [null, [], {}, { items: null }, { items: {} }, { items: [{}] },
  { items: [agent("bad", { running: "true" })] },
  { items: [agent("bad", { session: { last_activity: 123 } })] },
  { items: [agent("bad", { pool: [] })] }]) {
  assert.throws(() => toProjectAgents(raw, rig), "malformed responses must throw");
}

const wispBead = {
  id: "jkr-wisp-azwm", title: "mol-refinery-patrol", status: "in_progress",
  issue_type: "molecule", ephemeral: true, metadata: {},
};
const taskBead = { id: "jkr-y124", title: "Fixture task", status: "open", issue_type: "task", priority: 2 };
assert.deepEqual(toBeadSummary(wispBead), {
  id: wispBead.id, title: wispBead.title, status: "in_progress", type: "molecule", priority: null,
});
assert.deepEqual(toBeadSummary(taskBead), {
  id: taskBead.id, title: taskBead.title, status: "open", type: "task", priority: 2,
});
assert.deepEqual(toBeadSummary({ id: "minimal", title: "Minimal", status: "open" }), {
  id: "minimal", title: "Minimal", status: "open", type: null, priority: null,
});
assert.throws(() => toBeadSummary({ id: "no-title", status: "open" }));
for (const priority of [-1, 5, 1.5, "2"]) {
  assert.throws(() => toBeadSummary({ ...taskBead, priority }));
}

const summaryAgents = toProjectAgents({ items: [
  agent("a", { active_bead: wispBead.id }),
  agent("b", { active_bead: wispBead.id }),
  agent("c", { active_bead: "missing" }),
  agent("d", { active_bead: taskBead.id }),
  agent("e"),
  agent("f", { active_bead: "invalid" }),
  agent("g", { active_bead: "" }),
] }, rig);
const originalAgents = structuredClone(summaryAgents);
summaryAgents.forEach(Object.freeze);
Object.freeze(summaryAgents);
const beadLoads = [];
const beadWarnings = [];
const warn = console.warn;
let enriched;
try {
  console.warn = (message) => beadWarnings.push(message);
  // Defer resolution so every unique id must start loading before any completes.
  const pendingBeads = [];
  const attaching = attachBeadSummaries(summaryAgents, (id) => new Promise((resolve, reject) => {
    beadLoads.push(id);
    pendingBeads.push(() => {
      if (id === "missing") reject(new Error("HTTP 404"));
      else resolve(id === "invalid" ? { id, status: "open" } : id === wispBead.id ? wispBead : taskBead);
    });
  }));
  assert.deepEqual(beadLoads, [wispBead.id, "missing", taskBead.id, "invalid"]);
  pendingBeads.forEach((complete) => complete());
  enriched = await attaching;
} finally {
  console.warn = warn;
}
assert.deepEqual(summaryAgents, originalAgents, "summary attachment does not modify input agents");
assert.notEqual(enriched, summaryAgents);
assert.deepEqual(enriched.map((entry) => entry.name), summaryAgents.map((entry) => entry.name));
enriched.forEach((entry, index) => assert.notEqual(entry, summaryAgents[index]));
assert.deepEqual(enriched[0].activeBeadSummary, toBeadSummary(wispBead));
assert.deepEqual(enriched[1].activeBeadSummary, toBeadSummary(wispBead));
assert.equal(enriched[2].activeBeadSummary, null, "a failed loader leaves only that bead unresolved");
assert.deepEqual(enriched[3].activeBeadSummary, toBeadSummary(taskBead));
assert.equal(enriched[4].activeBeadSummary, null);
assert.equal(enriched[5].activeBeadSummary, null, "invalid bead data is isolated too");
assert.equal(enriched[6].activeBeadSummary, null);
assert.equal(beadWarnings.length, 2);
assert.match(beadWarnings[0], /missing.*HTTP 404/);
assert.match(beadWarnings[1], /invalid.*title/);
assert.ok(beadWarnings.every((message) => !message.includes("\n")), "each bead failure logs one line");
assert.deepEqual(await attachBeadSummaries([], async () => assert.fail("empty agents must not load beads")), []);

assert.deepEqual(parseRigMap("projA=rigA,projB=rigB"), { projA: "rigA", projB: "rigB" });
assert.deepEqual(parseRigMap(" projA = rigA , projB = rigB "), { projA: "rigA", projB: "rigB" });
assert.deepEqual(parseRigMap(undefined), {});
assert.deepEqual(parseRigMap(""), {});
assert.deepEqual(parseRigMap("  ,  , "), {});
assert.deepEqual(parseRigMap("broken,=rig,project=,a=b=c,valid=rig, = , trailing"), { valid: "rig" });
assert.deepEqual(parseRigMap("project=first,project=last"), { project: "last" });
assert.equal(Object.hasOwn(parseRigMap("__proto__=rig"), "__proto__"), true);

const cityUrl = "http://fixture.invalid/v0/city/city/agents";
let now = 0;
const loads = [];
const loadCity = createCityAgentsCache((url) => new Promise((resolve, reject) => {
  loads.push({ url, resolve, reject });
}), () => now);
const rawCity = { items: [agent("cached"), { name: "other/cached", rig: "other" }] };
const first = loadCity(cityUrl);
const concurrent = loadCity(cityUrl);
assert.equal(loads.length, 1, "concurrent city requests share one upstream call");
now = 8_300;
loads[0].resolve(rawCity);
assert.equal(await first, rawCity);
assert.equal(await concurrent, rawCity);
assert.equal(await loadCity(cityUrl), rawCity);
assert.equal(loads.length, 1, "fresh results use the cache");
assert.deepEqual(toProjectAgents(await loadCity(cityUrl), rig).map((entry) => entry.shortName), ["cached"]);
assert.deepEqual(toProjectAgents(await loadCity(cityUrl), "other").map((entry) => entry.shortName), ["cached"]);
now = 18_299;
assert.equal(await loadCity(cityUrl), rawCity, "TTL starts when the slow request completes");
now = 18_300;
const expired = loadCity(cityUrl);
const expiredConcurrent = loadCity(cityUrl);
assert.equal(loads.length, 2, "expired concurrent reads share one refresh");
const refreshed = { items: [] };
loads[1].resolve(refreshed);
assert.equal(await expired, refreshed);
assert.equal(await expiredConcurrent, refreshed);

for (const otherUrl of ["http://other.invalid/v0/city/city/agents", "http://fixture.invalid/v0/city/other/agents"]) {
  const other = loadCity(otherUrl);
  assert.equal(loads.at(-1).url, otherUrl, "API URL and city each partition the cache");
  loads.at(-1).resolve(rawCity);
  assert.equal(await other, rawCity);
}
assert.equal(loads.length, 4);

now += 10_000;
const failed = loadCity(cityUrl);
const failedConcurrent = loadCity(cityUrl);
const failures = Promise.allSettled([failed, failedConcurrent]);
loads[4].reject(new Error("HTTP 503"));
assert.deepEqual((await failures).map((result) => result.status), ["rejected", "rejected"]);
const retry = loadCity(cityUrl);
assert.equal(loads.length, 6, "failure clears the in-flight request and is not cached");
const invalid = assert.rejects(retry);
loads[5].resolve({});
await invalid;
const validRetry = loadCity(cityUrl);
assert.equal(loads.length, 7, "invalid city responses are not cached");
loads[6].resolve(rawCity);
assert.equal(await validRetry, rawCity);
assert.equal(await loadCity(cityUrl), rawCity);
assert.equal(loads.length, 7);

assert.equal(rigForProject("project", parseRigMap("project=mapped")), "mapped");
assert.equal(rigForProject("other", parseRigMap("project=mapped")), "other");
assert.equal(rigForProject("toString", {}), "toString");

const outputTurn = { id: "turn-1", role: "assistant", text: "Plain <b>text</b>", timestamp: lastActivity };
assert.deepEqual(toAgentOutput({
  format: "structured",
  turns: [{ ...outputTurn, future_field: true }],
  pagination: { has_older_messages: true, total_message_count: 25, returned_message_count: 1 },
}), {
  format: "structured",
  turns: [outputTurn],
  pagination: { hasOlder: true, total: 25 },
});
assert.deepEqual(toAgentOutput({ format: "text", turns: [{ role: "user", text: "hello" }] }), {
  format: "text", turns: [{ role: "user", text: "hello" }],
  pagination: { hasOlder: false, total: null },
});
assert.deepEqual(toAgentOutput({ format: "structured", turns: [], pagination: {} }).turns, []);
for (const raw of [null, {}, { format: "text" }, { format: 4, turns: [] },
  { format: "text", turns: null }, { format: "text", turns: {} },
  { format: "text", turns: [{ role: "user" }] },
  { format: "text", turns: [{ role: 3, text: "bad" }] },
  { format: "text", turns: [{ role: "user", text: "bad", id: 3 }] },
  { format: "text", turns: [], pagination: { has_older_messages: "yes" } },
  { format: "text", turns: [], pagination: { returned_message_count: "3" } },
  { format: "text", turns: [], pagination: null }]) {
  assert.throws(() => toAgentOutput(raw), "invalid output, including missing turns, must throw");
}
assert.equal(toProjectAgents({ items: [agent("zero", { context_pct: 0, context_window: 0 })] }, rig)[0].contextPct, 0);
assert.throws(() => toProjectAgents({ items: [agent("bad", { context_pct: "40" })] }, rig));
assert.throws(() => toProjectAgents({ items: [agent("bad", { context_window: "200000" })] }, rig));

assert.deepEqual(parseAgentOutputQuery({ agent: "backend.furiosa" }), { agent: "backend.furiosa" });
assert.deepEqual(parseAgentOutputQuery({ agent: "A_0-1.test", before: "turn-123", tail: "0" }), {
  agent: "A_0-1.test", before: "turn-123", tail: 0,
});
assert.equal(parseAgentOutputQuery({ agent: "a", tail: "50" }).tail, 50);
assert.equal(parseAgentOutputQuery({ agent: "a", before: "a".repeat(128) }).before.length, 128);
for (const invalid of [undefined, null, "", "../agent", "rig/agent", "_agent", "-agent", "a b", "a?x=1", "a\\nb"]) {
  assert.throws(() => parseAgentOutputQuery({ agent: invalid }));
}
for (const before of ["", "a".repeat(129), "../turn", "turn_1", "turn.1", "a/b", "a b"]) {
  assert.throws(() => parseAgentOutputQuery({ agent: "a", before }));
}
for (const tail of ["", "-1", "51", "1.5", "NaN", "Infinity", " 1", "1e1", "1x"]) {
  assert.throws(() => parseAgentOutputQuery({ agent: "a", tail }));
}

console.log("PASS: agents normalization/context fields, active bead summaries/deduplication/failure isolation, rig mapping, grouping, city cache, output schema/camelCase pagination, and agent/before/tail validation");

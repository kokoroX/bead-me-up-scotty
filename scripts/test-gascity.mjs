import assert from "node:assert/strict";
import { createCityAgentsCache, toProjectAgents, parseRigMap } from "../lib/gascity-agents.ts";

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
  unavailableReason: "agent is suspended",
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

const [minimal] = toProjectAgents({ items: [agent("minimal")] }, rig);
assert.deepEqual(minimal, {
  name: "jikerental/minimal", shortName: "minimal", pool: null, state: "unknown",
  running: false, suspended: false, activity: null, model: null, provider: null,
  lastActivity: null, activeBead: null, unavailableReason: null,
});
const [nullable] = toProjectAgents({ items: [agent("nullable", {
  pool: null, state: null, running: null, suspended: null, activity: null,
  model: null, provider: null, active_bead: null, unavailable_reason: null, session: null,
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

console.log("PASS: rig filtering, running/state/name sorting, field normalization, pool prefixes, response validation, rig map parsing, and city cache TTL/concurrency/isolation/recovery");

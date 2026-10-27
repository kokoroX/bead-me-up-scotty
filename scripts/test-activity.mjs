import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Load the server module in Node and resolve the app's extensionless TS imports.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: "data:text/javascript,", shortCircuit: true };
    }
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (!specifier.startsWith(".") || /\.[a-z]+$/i.test(specifier)) throw error;
      return nextResolve(`${specifier}.ts`, context);
    }
  },
});

const { buildActivity, isWispId } = await import("../lib/interactions.ts");

const createdAt = "2026-10-20T10:00:00Z";
const closedAt = "2026-10-20T11:00:00Z";
const bead = (id, extra = {}) => ({
  id,
  title: `Bead ${id}`,
  status: "open",
  issue_type: "task",
  priority: 2,
  labels: [],
  dependencies: [],
  comments: [],
  created_at: createdAt,
  ...extra,
});
const fieldChange = (issueId, actor = "") => ({
  id: `${issueId}-status`,
  kind: "field_change",
  issue_id: issueId,
  actor,
  created_at: closedAt,
  extra: { field: "status", old_value: "open", new_value: "closed" },
});

for (const id of ["jkr-wisp-ab12", "jkr-wisp-ab12.3"]) {
  assert.equal(isWispId(id), true, `${id} is a wisp`);
}
for (const id of ["jkr-33nv", "wisp-x", "jkr-wispy"]) {
  assert.equal(isWispId(id), false, `${id} is not a wisp`);
}
console.log("PASS: isWispId follows bd's -wisp- convention, including child steps");

const ids = ["jkr-33nv", "jkr-wisp-ab12", "jkr-wisp-ab12.1"];
const beads = ids.map((id) => bead(id, {
  status: "closed",
  closed_at: closedAt,
  comments: [{ author: "", text: "Automatic comment", created_at: createdAt }],
}));
const events = [...ids, "jkr-wisp-log-only"].map((id) => fieldChange(id));
const before = structuredClone({ beads, events });

for (const log of [[], events]) {
  const visible = buildActivity(beads, log, []);
  assert.equal(visible.length, 3, "the regular bead keeps creation, comment and close");
  assert.ok(visible.every((item) => item.issueId === "jkr-33nv"));
  assert.deepEqual(buildActivity(beads, log, [], { includeWisps: false }), visible);

  const all = buildActivity(beads, log, [], { includeWisps: true });
  assert.equal(all.length, log.length ? 10 : 9, "opting in keeps every activity kind");
  for (const id of ids) {
    assert.equal(all.filter((item) => item.issueId === id).length, 3);
  }
  if (log.length) {
    assert.ok(all.some((item) => item.issueId === "jkr-wisp-log-only"));
  }
  assert.deepEqual(visible, all.filter((item) => !isWispId(item.issueId)));
}
assert.deepEqual({ beads, events }, before, "building activity must not mutate inputs");

const manyBeads = Array.from({ length: 160 }, (_, i) => [
  bead(`jkr-${i}`),
  bead(`jkr-wisp-${i}`, { created_at: closedAt }),
]).flat();
const page = buildActivity(manyBeads, [], []).slice(0, 150);
assert.equal(page.length, 150, "wisps do not consume any of the 150 feed slots");
assert.ok(page.every((item) => !isWispId(item.issueId)));
console.log("PASS: default feeds exclude wisps from all sources before the 150-item limit; opt-in keeps them");

for (const name of [undefined, ""]) {
  const items = buildActivity([bead("jkr-empty", {
    created_by: name,
    comments: [{ author: name, text: "Comment", created_at: closedAt }],
  })], [], ["system"]);
  assert.equal(items.length, 2);
  for (const item of items) {
    assert.equal(item.actor, "system", `empty ${item.action} actor becomes system`);
    assert.equal(item.origin, "agent", "origin uses the original empty name");
  }
}
console.log("PASS: empty or missing creators and comment authors display system with agent origin");

for (const [assignee, createdBy, expected] of [
  ["assigned-agent", "alice", "assigned-agent"],
  ["", "alice", "alice"],
  [undefined, "alice", "alice"],
  ["", "", "system"],
  [undefined, undefined, "system"],
]) {
  const items = buildActivity([bead("jkr-closed", {
    assignee,
    created_by: createdBy,
    status: "closed",
    closed_at: closedAt,
  })], [], ["alice", "system"]);
  const closed = items.find((item) => item.action === "closed");
  assert.equal(closed?.actor, expected);
  assert.equal(closed?.origin, expected === "alice" ? "human" : "agent");
}
console.log("PASS: synthesized closes fall back through assignee, created_by, system");

for (const actor of [undefined, "", "alice"]) {
  const event = { ...fieldChange("jkr-status"), actor };
  const [item] = buildActivity([], [event], ["alice", "system"]);
  assert.equal(item.actor, actor || "system");
  assert.equal(item.origin, actor === "alice" ? "human" : "agent");
  assert.equal(item.action, "closed");
}
const named = buildActivity([bead("jkr-named", {
  created_by: "alice",
  comments: [{ author: "bob", text: "Hello", created_at: closedAt }],
})], [], ["alice"]);
assert.equal(named.find((item) => item.action === "created")?.actor, "alice");
assert.equal(named.find((item) => item.action === "created")?.origin, "human");
assert.equal(named.find((item) => item.action === "commented")?.actor, "bob");
assert.equal(named.find((item) => item.action === "commented")?.origin, "agent");
console.log("PASS: field changes use system for empty actors and named actors keep their attribution");

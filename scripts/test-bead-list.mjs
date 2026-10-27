import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// The app uses extensionless TypeScript imports, which Node's ESM resolver does
// not try; add the extension so the real module (including beads-view) loads.
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (!specifier.startsWith(".") || /\.[a-z]+$/i.test(specifier)) throw error;
      return nextResolve(`${specifier}.ts`, context);
    }
  },
});

const { slimBeadList } = await import("../lib/bead-list.ts");

const bead = (id, extra = {}) => ({
  id,
  title: `Bead ${id}`,
  status: "open",
  issue_type: "task",
  priority: 2,
  labels: [],
  dependencies: [],
  comments: [],
  ...extra,
});

const open = bead("open", {
  description: "Open body",
  notes: "Open notes",
  design: "Open design",
  acceptance_criteria: "Open acceptance",
  metadata: { key: "value" },
  comments: [{ author: "alice", text: "hi" }],
});
const closed = bead("closed", {
  status: "closed",
  close_reason: "done",
  description: "Steps:\n- [x] one\n- [ ] two",
  notes: "Closed notes",
  design: "Closed design",
  acceptance_criteria: "Closed acceptance",
  metadata: { owner: "bob" },
  comments: [{ author: "alice", text: "one" }, { author: "bob", text: "two" }],
});
const closedNoBody = bead("closed-empty", { status: "closed" });
const closedCounted = bead("closed-counted", {
  status: "closed",
  comment_count: 7,
  comments: [{ author: "alice", text: "ignored" }],
});
const input = [open, closed, closedNoBody, closedCounted];
const before = structuredClone(input);
const slim = slimBeadList(input);

assert.equal(slim[0], open, "open beads are returned unchanged");
assert.deepEqual(slim[0], before[0], "open beads keep every field");
assert.notEqual(slim[1], closed, "a closed bead is replaced, not mutated");

for (const field of ["description", "notes", "design", "acceptance_criteria", "metadata", "comments"]) {
  assert.equal(field in slim[1], false, `closed beads drop ${field}`);
}
assert.equal(slim[1].summary_only, true);
assert.equal(slim[1].comment_count, 2, "comment_count falls back to comments.length");
assert.deepEqual(slim[1].checklist, { done: 1, total: 2 });
assert.equal(slim[1].title, closed.title);
assert.equal(slim[1].close_reason, "done", "close_reason stays for the drawer/list views");

assert.equal(slim[2].summary_only, true);
assert.equal(slim[2].comment_count, 0);
assert.deepEqual(slim[2].checklist, { done: 0, total: 0 }, "no description means an empty checklist");
for (const field of ["description", "notes", "design", "acceptance_criteria", "metadata", "comments"]) {
  assert.equal(field in slim[2], false);
}

assert.equal(slim[3].comment_count, 7, "an existing comment_count wins over comments.length");
assert.equal(slim[3].summary_only, true);
assert.deepEqual(slim[3].checklist, { done: 0, total: 0 });

assert.deepEqual(input, before, "slimBeadList must not mutate its input");
assert.deepEqual(closed.comments.length, 2);
assert.equal(closed.description, before[1].description);

const [deferred] = slimBeadList([bead("deferred", { status: "deferred", description: "Later" })]);
assert.equal(deferred.description, "Later", "only closed beads are slimmed");

console.log("PASS: closed beads are slimmed with summary_only/comment_count/checklist, open beads are untouched, and input is not mutated");

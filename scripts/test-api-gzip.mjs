import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { okJson } from "../lib/json-response.ts";

const data = { beads: [{ id: "a", title: "Gzip fixture", description: "x".repeat(256) }], meta: { kind: "demo" } };

const gzipped = okJson(new Request("http://fixture.invalid/beads", {
  headers: { "Accept-Encoding": "gzip, deflate, br" },
}), data);
assert.equal(gzipped.status, 200);
assert.equal(gzipped.headers.get("content-encoding"), "gzip");
assert.equal(gzipped.headers.get("content-type"), "application/json");
assert.equal(gzipped.headers.get("vary"), "Accept-Encoding");
assert.deepEqual(JSON.parse(gunzipSync(Buffer.from(await gzipped.arrayBuffer())).toString()), data);

const plain = okJson(new Request("http://fixture.invalid/beads", {
  headers: { "Accept-Encoding": "br" },
}), data, 201);
assert.equal(plain.status, 201);
assert.equal(plain.headers.get("content-encoding"), null);
assert.equal(plain.headers.get("content-type"), "application/json");
assert.equal(plain.headers.get("vary"), "Accept-Encoding");
assert.deepEqual(await plain.json(), data);

const noHeader = okJson(new Request("http://fixture.invalid/beads"), data);
assert.equal(noHeader.headers.get("content-encoding"), null);
assert.deepEqual(await noHeader.json(), data);
assert.equal(noHeader.headers.get("vary"), "Accept-Encoding");

console.log("PASS: okJson gzips accepted requests, answers plain JSON otherwise, and always varies on Accept-Encoding");

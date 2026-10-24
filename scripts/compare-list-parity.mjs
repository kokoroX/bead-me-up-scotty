import { isDeepStrictEqual } from "node:util";
import { performance } from "node:perf_hooks";

const [baseA, baseB, ...projects] = process.argv.slice(2);
if (!baseA || !baseB || !projects.length) {
  console.error("Usage: node scripts/compare-list-parity.mjs <baseUrlA> <baseUrlB> <projectId>...");
  process.exit(1);
}

function endpoint(base, project, resource) {
  return `${base.replace(/\/+$/, "")}/api/p/${encodeURIComponent(project)}/${resource}`;
}

async function request(base, project, resource) {
  const start = performance.now();
  const response = await fetch(endpoint(base, project, resource), { signal: AbortSignal.timeout(60000) });
  const text = await response.text();
  const elapsed = performance.now() - start;
  if (!response.ok) throw new Error(`${resource}: HTTP ${response.status}: ${text.slice(0, 300)}`);
  const data = JSON.parse(text);
  if (resource === "beads" && !Array.isArray(data.beads)) {
    throw new Error("beads response does not contain a beads array");
  }
  return { data, elapsed };
}

function stableKey(value) {
  if (Array.isArray(value)) return `[${value.map(stableKey).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableKey(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalize(bead) {
  const result = { ...bead };
  if (Array.isArray(result.labels)) result.labels = [...result.labels].sort();
  for (const field of ["dependencies", "comments"]) {
    if (!Array.isArray(result[field])) continue;
    // Complete canonical keys disambiguate equal IDs/targets without depending
    // on object property order, and retain every field for the deep comparison.
    result[field] = result[field].map((value) => [stableKey(value), value])
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, value]) => value);
  }
  return result;
}

function differences(a, b, path, report) {
  if (isDeepStrictEqual(a, b)) return;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) report(`${path}.length`, a.length, b.length);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      differences(a[i], b[i], `${path}[${i}]`, report);
    }
  } else if (a !== null && b !== null && typeof a === "object" && typeof b === "object" &&
      !Array.isArray(a) && !Array.isArray(b)) {
    for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) {
      const fieldPath = path ? `${path}.${key}` : key;
      if (Object.hasOwn(a, key) !== Object.hasOwn(b, key)) report(fieldPath, a[key], b[key]);
      else differences(a[key], b[key], fieldPath, report);
    }
  } else report(path, a, b);
}

function display(value) {
  return value === undefined ? "<missing>" : JSON.stringify(value);
}

function compare(a, b) {
  const byA = new Map(a.map((bead) => [bead.id, bead]));
  const byB = new Map(b.map((bead) => [bead.id, bead]));
  const onlyA = [...byA.keys()].filter((id) => !byB.has(id));
  const onlyB = [...byB.keys()].filter((id) => !byA.has(id));
  console.log(`  IDs: A=${byA.size}, B=${byB.size}, only A=${onlyA.length}, only B=${onlyB.length}`);
  if (onlyA.length) console.log(`  Only A (first 20): ${JSON.stringify(onlyA.slice(0, 20))}`);
  if (onlyB.length) console.log(`  Only B (first 20): ${JSON.stringify(onlyB.slice(0, 20))}`);
  let count = 0;
  for (const [id, bead] of byA) {
    if (!byB.has(id)) continue;
    differences(normalize(bead), normalize(byB.get(id)), "", (path, left, right) => {
      if (count < 20) console.log(`  ${id}  ${path}  ${display(left)}  ${display(right)}`);
      count++;
    });
  }
  console.log(`  Field differences: ${count}${count > 20 ? " (first 20 shown)" : ""}`);
  let mismatches = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]?.id === b[i]?.id) continue;
    if (mismatches < 10) console.log(`  Order[${i}]: A=${display(a[i]?.id)} B=${display(b[i]?.id)}`);
    mismatches++;
  }
  console.log(`  Array order: ${mismatches ? `${mismatches} mismatched positions (first 10 shown)` : "identical"}`);
  return onlyA.length > 0 || onlyB.length > 0 || count > 0;
}

async function benchmark(base, project, label) {
  for (const resource of ["activity", "beads"]) {
    const times = [];
    for (let i = 0; i < 5; i++) times.push((await request(base, project, resource)).elapsed);
    times.sort((a, b) => a - b);
    console.log(`  ${label} /${resource}: median ${times[2].toFixed(1)} ms (5 requests, response body included)`);
  }
}

let failed = false;
for (const project of projects) {
  console.log(`Project ${project}`);
  try {
    const [a, b] = await Promise.all([request(baseA, project, "beads"), request(baseB, project, "beads")]);
    if (compare(a.data.beads, b.data.beads)) failed = true;
    await benchmark(baseA, project, "A");
    await benchmark(baseB, project, "B");
  } catch (error) {
    console.error(`  ERROR: ${error.message}`);
    failed = true;
  }
}
process.exitCode = failed ? 1 : 0;

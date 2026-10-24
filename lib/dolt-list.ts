import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createPool, type Pool, type PoolConnection, type RowDataPacket } from "mysql2/promise";
import { beadSchema, type Bead } from "@/lib/schema";

export interface DoltTarget {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  tls: boolean;
}

const pools = new Map<string, Pool>();
const depTarget = "COALESCE(depends_on_issue_id, depends_on_wisp_id, depends_on_external)";
const issueColumns = `id, title, description, notes, design, acceptance_criteria,
  status, priority, issue_type, assignee, owner, created_by, created_at, updated_at,
  started_at, closed_at, close_reason, due_at, defer_until, estimated_minutes,
  external_ref, spec_id, CAST(metadata AS CHAR) AS metadata, await_type`;
const persistentFilter = "(is_template = 0 OR is_template IS NULL) AND (ephemeral = 0 OR ephemeral IS NULL)";
const zeroTime = "0001-01-01T00:00:00Z";
const epoch = "1970-01-01T00:00:00Z";
type Row = Record<string, unknown>;

export function readDoltTarget(repoPath: string): DoltTarget | null {
  try {
    const metadata = JSON.parse(readFileSync(path.join(repoPath, ".beads", "metadata.json"), "utf8"));
    if (metadata.backend !== "dolt" || metadata.dolt_mode !== "server" ||
        typeof metadata.dolt_database !== "string" || !metadata.dolt_database) return null;
    const envPort = process.env.BEADS_DOLT_SERVER_PORT;
    const port = envPort && /^[+-]?\d+$/.test(envPort)
      ? Number(envPort)
      : metadata.dolt_server_port || 3307;
    return {
      host: process.env.BEADS_DOLT_SERVER_HOST || metadata.dolt_server_host || "127.0.0.1",
      port,
      user: process.env.BEADS_DOLT_SERVER_USER || metadata.dolt_server_user || "root",
      password: process.env.BEADS_DOLT_PASSWORD || "",
      database: metadata.dolt_database,
      tls: process.env.BEADS_DOLT_SERVER_TLS === "true",
    };
  } catch {
    return null;
  }
}

function poolFor(target: DoltTarget): Pool {
  const key = JSON.stringify([target.host, target.port, target.user, target.database]);
  let pool = pools.get(key);
  if (!pool) {
    pool = createPool({
      host: target.host,
      port: target.port,
      user: target.user,
      password: target.password,
      database: target.database,
      ssl: target.tls ? {} : undefined,
      connectionLimit: 2,
      dateStrings: true,
      jsonStrings: true,
      timezone: "Z",
      charset: "utf8mb4",
      connectTimeout: 5000,
    });
    pools.set(key, pool);
  }
  return pool;
}

async function rows(connection: PoolConnection, sql: string): Promise<Row[]> {
  const [result] = await connection.query<RowDataPacket[]>({ sql, timeout: 15000 });
  return result;
}

// Mirror Go time.Time's RFC3339Nano JSON without passing fractional seconds
// through Date (which would truncate them to milliseconds). DATETIME is UTC,
// as in bd's go-sql-driver/mysql DSN with parseTime=true and its default loc.
function goTime(value: unknown, required = false): string {
  const fallback = required ? epoch : zeroTime;
  if (typeof value !== "string") return fallback;
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:[.,](\d+))?(Z|[+-]\d{2}:\d{2})?$/.exec(value);
  if (!match) return fallback;
  const [, date, time, fraction = "", offset = "Z"] = match;
  const seconds = `${date}T${time}`;
  // Go's parser rejects invalid calendar dates and out-of-range clock fields.
  const instant = new Date(`${seconds}Z`);
  if (!Number.isFinite(instant.getTime()) || instant.toISOString().slice(0, 19) !== seconds) return fallback;
  if (offset !== "Z" && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4)) > 59)) return fallback;
  const nanos = fraction.slice(0, 9).replace(/0+$/, "");
  const zone = offset === "+00:00" || offset === "-00:00" ? "Z" : offset;
  const result = `${seconds}${nanos ? `.${nanos}` : ""}${zone}`;
  return required && result === zeroTime ? epoch : result;
}

function timeKey(value: unknown): bigint {
  const valueString = goTime(value);
  const wholeSeconds = valueString.replace(/\.\d+/, "");
  const fraction = /\.(\d+)/.exec(valueString)?.[1] ?? "";
  return BigInt(new Date(wholeSeconds).getTime()) * BigInt(1000000) + BigInt(fraction.padEnd(9, "0"));
}

function issueRecord(row: Row): Row {
  const record: Row = {
    id: row.id,
    title: row.title,
    priority: Number(row.priority),
    created_at: goTime(row.created_at, true),
    updated_at: goTime(row.updated_at, true),
    dependency_count: 0,
    dependent_count: 0,
    comment_count: 0,
    labels: [],
    dependencies: [],
    comments: [],
  };
  // String fields tagged omitempty in types.Issue. Zod supplies scotty's
  // defaults; optional strings without defaults must remain absent when empty.
  for (const key of ["description", "notes", "design", "acceptance_criteria", "status",
    "issue_type", "assignee", "owner", "created_by", "close_reason", "spec_id", "await_type"]) {
    if (row[key] != null && row[key] !== "") record[key] = row[key];
  }
  for (const key of ["started_at", "closed_at", "due_at", "defer_until"]) {
    if (row[key] != null) record[key] = goTime(row[key]);
  }
  if (row.external_ref != null) record.external_ref = row.external_ref;
  if (row.estimated_minutes != null) record.estimated_minutes = Number(row.estimated_minutes);
  // ScanIssueFrom deliberately omits the exact string "{}" as well as NULL/empty.
  if (typeof row.metadata === "string" && row.metadata !== "" && row.metadata !== "{}") {
    record.metadata = JSON.parse(row.metadata);
  }
  return record;
}

export async function listFromDolt(target: DoltTarget): Promise<Bead[]> {
  const connection = await poolFor(target).getConnection();
  try {
    await connection.query("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ");
    await connection.query("START TRANSACTION READ ONLY");
    const config = new Map((await rows(connection, "SELECT `key`, value FROM config WHERE `key` = 'types.infra' OR `key` = 'export.exclude_owners' OR `key` = 'export.exclude_owner'")).map((r) => [r.key, r.value]));
    // The legacy singular key is part of buildOwnerExcludeSet too.
    if (config.get("export.exclude_owners") || config.get("export.exclude_owner")) {
      throw new Error("Dolt direct list does not support export.exclude_owners");
    }
    const configuredInfra = String(config.get("types.infra") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    // Deliberately DB -> defaults only: project config.yaml is not available
    // for every mounted server project.
    const infra = new Set(configuredInfra.length ? configuredInfra : ["agent", "role", "message"]);
    const wispIDs = new Set((await rows(connection, "SELECT id FROM wisps")).map((r) => r.id));
    const durable = (await rows(connection, `SELECT ${issueColumns} FROM issues WHERE ${persistentFilter} ORDER BY priority ASC, created_at DESC, id ASC`))
      .filter((r) => !infra.has(String(r.issue_type)));
    const wisps = (await rows(connection, `SELECT ${issueColumns} FROM wisps WHERE ${persistentFilter} ORDER BY priority ASC, created_at DESC, id ASC`))
      .filter((r) => !infra.has(String(r.issue_type)));
    const selectedWisps = new Set(wisps.map((r) => r.id));
    const selected = [...durable.filter((r) => !selectedWisps.has(r.id)), ...wisps];
    if (wisps.length) {
      // searchInTx prefers matching wisps on duplicate IDs and re-sorts the
      // merged legs using sqlbuild.Less: priority, created DESC, bytewise ID.
      const times = new Map(selected.map((r) => [r, timeKey(r.created_at)]));
      selected.sort((a, b) => Number(a.priority) - Number(b.priority) ||
        (times.get(a)! > times.get(b)! ? -1 : times.get(a)! < times.get(b)! ? 1 :
          Buffer.compare(Buffer.from(String(a.id)), Buffer.from(String(b.id)))));
    }
    const records = new Map(selected.map((r) => [r.id, issueRecord(r)]));
    for (const wisp of [false, true]) {
      // Membership, not no_history/ephemeral flags, chooses the relation plane.
      const prefix = wisp ? "wisp_" : "";
      const recordFor = (id: unknown) => wispIDs.has(id) === wisp ? records.get(id) : undefined;
      for (const label of await rows(connection, `SELECT issue_id, label FROM ${prefix}labels ORDER BY issue_id, label`)) {
        const record = recordFor(label.issue_id);
        if (record) (record.labels as unknown[]).push(label.label);
      }
      for (const dep of await rows(connection, `SELECT issue_id, ${depTarget} AS depends_on_id, type, created_at, created_by FROM ${prefix}dependencies ORDER BY issue_id, depends_on_id, type, id`)) {
        const record = recordFor(dep.issue_id);
        if (!record) continue;
        const dependency: Row = { issue_id: dep.issue_id, depends_on_id: dep.depends_on_id, type: dep.type, created_at: goTime(dep.created_at) };
        if (dep.created_by) dependency.created_by = dep.created_by;
        (record.dependencies as Row[]).push(dependency);
      }
      for (const comment of await rows(connection, `SELECT id, issue_id, author, text, created_at FROM ${prefix}comments ORDER BY issue_id, created_at ASC, id ASC`)) {
        const record = recordFor(comment.issue_id);
        if (!record) continue;
        (record.comments as Row[]).push({ ...comment, created_at: goTime(comment.created_at) });
        record.comment_count = Number(record.comment_count) + 1;
      }
      // Classic GetDependencyCounts skips the wisp dep table when wisps is
      // empty. Otherwise both tables contribute, even for filtered-out sources.
      if (wisp && !wispIDs.size) continue;
      for (const count of await rows(connection, `SELECT issue_id, COUNT(*) AS count FROM ${prefix}dependencies WHERE type = 'blocks' GROUP BY issue_id`)) {
        const record = records.get(count.issue_id);
        if (record) record.dependency_count = Number(record.dependency_count) + Number(count.count);
      }
      for (const count of await rows(connection, `SELECT ${depTarget} AS target_id, COUNT(*) AS count FROM ${prefix}dependencies WHERE type = 'blocks' GROUP BY ${depTarget}`)) {
        const record = records.get(count.target_id);
        if (record) record.dependent_count = Number(record.dependent_count) + Number(count.count);
      }
    }
    const beads: Bead[] = [];
    for (const record of records.values()) {
      const parsed = beadSchema.safeParse(record);
      if (parsed.success && parsed.data.issue_type) beads.push(parsed.data);
    }
    await connection.commit();
    return beads;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // Never return a connection with an unknown transaction state to the pool.
      connection.destroy();
    }
    throw error;
  } finally {
    connection.release();
  }
}

import { z } from "zod";

const agentSchema = z.object({
  name: z.string(),
  rig: z.string().nullable().optional(),
  pool: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  running: z.boolean().nullable().optional(),
  suspended: z.boolean().nullable().optional(),
  activity: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  provider: z.string().nullable().optional(),
  active_bead: z.string().nullable().optional(),
  unavailable_reason: z.string().nullable().optional(),
  session: z.object({
    last_activity: z.string().nullable().optional(),
  }).passthrough().nullable().optional(),
}).passthrough();

const agentsSchema = z.object({
  items: z.array(agentSchema),
  total: z.number().nullable().optional(),
}).passthrough();

/** Project-scoped, read-only Gas City agent view model. */
export interface GascityAgent {
  name: string;
  shortName: string;
  pool: string | null;
  state: string;
  running: boolean;
  suspended: boolean;
  activity: string | null;
  model: string | null;
  provider: string | null;
  lastActivity: string | null;
  activeBead: string | null;
  unavailableReason: string | null;
}

function stateOrder(state: string): number {
  const order = ["working", "waiting", "idle"].indexOf(state);
  return order < 0 ? 3 : order;
}

/** Validate a city response, select the rig, and sort running agents first. */
export function toProjectAgents(raw: unknown, rig: string): GascityAgent[] {
  const { items } = agentsSchema.parse(raw);
  const prefix = `${rig}/`;
  return items.filter((agent) => agent.rig === rig).map((agent) => ({
    name: agent.name,
    shortName: agent.name.startsWith(prefix) ? agent.name.slice(prefix.length) : agent.name,
    pool: agent.pool ?? null,
    state: agent.state ?? "unknown",
    running: agent.running ?? false,
    suspended: agent.suspended ?? false,
    activity: agent.activity ?? null,
    model: agent.model ?? null,
    provider: agent.provider ?? null,
    lastActivity: agent.session?.last_activity ?? null,
    activeBead: agent.active_bead ?? null,
    unavailableReason: agent.unavailable_reason ?? null,
  })).sort((a, b) =>
    Number(b.running) - Number(a.running) ||
    stateOrder(a.state) - stateOrder(b.state) ||
    a.name.localeCompare(b.name),
  );
}

/** Cache validated city responses for ten seconds and share in-flight requests. */
export function createCityAgentsCache(
  load: (url: string) => Promise<unknown>,
  now: () => number = Date.now,
) {
  const cache = new Map<string, { raw: unknown; expiresAt: number }>();
  const inflight = new Map<string, Promise<unknown>>();

  return async (url: string): Promise<unknown> => {
    const cached = cache.get(url);
    if (cached && cached.expiresAt > now()) return cached.raw;
    cache.delete(url);
    const pending = inflight.get(url);
    if (pending) return pending;

    const request = (async () => {
      const raw = await load(url);
      agentsSchema.parse(raw);
      cache.set(url, { raw, expiresAt: now() + 10_000 });
      return raw;
    })();
    inflight.set(url, request);
    try {
      return await request;
    } finally {
      inflight.delete(url);
    }
  };
}

/** Parse comma-separated project=rig pairs, ignoring empty or malformed entries. */
export function parseRigMap(value: string | undefined): Record<string, string> {
  return Object.fromEntries((value ?? "").split(",").flatMap((entry) => {
    const parts = entry.split("=").map((part) => part.trim());
    return parts.length === 2 && parts[0] && parts[1] ? [[parts[0], parts[1]]] : [];
  }));
}

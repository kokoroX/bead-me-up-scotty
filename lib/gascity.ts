import "server-only";
import {
  createCityAgentsCache,
  parseRigMap,
  rigForProject,
  toAgentOutput,
  toProjectAgents,
  type AgentOutput,
  type GascityAgent,
} from "./gascity-agents";

const fetchCityAgents = createCityAgentsCache(async (url) => {
  const response = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(45_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
});

/** Fetch the city's cached agents and select this project's rig. */
export async function fetchProjectAgents(projectId: string): Promise<{
  configured: boolean;
  rig?: string;
  agents: GascityAgent[];
}> {
  const apiUrl = process.env.GASCITY_API_URL?.trim();
  if (!apiUrl) return { configured: false, agents: [] };

  const city = process.env.GASCITY_CITY || "city";
  const rig = rigForProject(projectId, parseRigMap(process.env.SCOTTY_GASCITY_RIGS));
  try {
    const raw = await fetchCityAgents(`${apiUrl.replace(/\/+$/, "")}/v0/city/${encodeURIComponent(city)}/agents`);
    const agents = toProjectAgents(raw, rig);
    return { configured: true, rig, agents };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`gascity agents request failed: ${message}`, { cause: error });
  }
}

/** Configuration, availability and validated transcript data for one agent. */
export type AgentOutputResult =
  | { configured: false }
  | { configured: true; available: false }
  | ({ configured: true; available: true } & AgentOutput);

/**
 * Fetch one page of an agent's read-only transcript. A 404 from Gas City means
 * the agent has no session yet; every other failure is reported to the caller.
 */
export async function fetchAgentOutput(
  projectId: string,
  agent: string,
  before?: string,
  tail?: number,
): Promise<AgentOutputResult> {
  const apiUrl = process.env.GASCITY_API_URL?.trim();
  if (!apiUrl) return { configured: false };

  const city = process.env.GASCITY_CITY || "city";
  const rig = rigForProject(projectId, parseRigMap(process.env.SCOTTY_GASCITY_RIGS));
  const params = new URLSearchParams();
  if (before !== undefined) params.set("before", before);
  if (tail !== undefined) params.set("tail", String(tail));
  const query = params.size > 0 ? `?${params.toString()}` : "";
  const path = ["v0", "city", city, "agent", rig, agent, "output"]
    .map(encodeURIComponent)
    .join("/");

  let response: Response;
  try {
    response = await fetch(`${apiUrl.replace(/\/+$/, "")}/${path}${query}`, {
      method: "GET",
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`gascity agent output request failed: ${message}`, { cause: error });
  }
  if (response.status === 404) return { configured: true, available: false };
  if (!response.ok) {
    throw new Error(`gascity agent output request failed: HTTP ${response.status}`);
  }

  let raw: unknown;
  try {
    raw = await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`gascity agent output response was not JSON: ${message}`, { cause: error });
  }
  return { configured: true, available: true, ...toAgentOutput(raw) };
}

import "server-only";
import { createCityAgentsCache, parseRigMap, toProjectAgents, type GascityAgent } from "./gascity-agents";

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
  const rigs = parseRigMap(process.env.SCOTTY_GASCITY_RIGS);
  const rig = Object.hasOwn(rigs, projectId) ? rigs[projectId] : projectId;
  try {
    const raw = await fetchCityAgents(`${apiUrl.replace(/\/+$/, "")}/v0/city/${encodeURIComponent(city)}/agents`);
    const agents = toProjectAgents(raw, rig);
    return { configured: true, rig, agents };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`gascity agents request failed: ${message}`, { cause: error });
  }
}

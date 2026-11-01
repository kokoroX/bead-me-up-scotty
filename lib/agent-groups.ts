import type { GascityAgent } from "@/lib/gascity-agents";

export type AgentGroup = "atWork" | "idle" | "off";

/** Group by work state so process liveness does not obscure active work. */
export function agentGroup(agent: GascityAgent): AgentGroup {
  if (agent.state === "working" || agent.state === "waiting") return "atWork";
  if (agent.state === "idle") return "idle";
  return "off";
}

export const GROUP_LABELS: Record<AgentGroup, string> = {
  atWork: "At work",
  idle: "Idle",
  off: "Stopped and suspended",
};

export const GROUP_ORDER: AgentGroup[] = ["atWork", "idle", "off"];

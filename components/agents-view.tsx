"use client";
import * as React from "react";
import { useApp } from "@/components/app-context";
import { Icon } from "@/components/icons";
import { useAgents } from "@/hooks/use-agents";
import { useBeads } from "@/hooks/use-beads";
import { useUrlState } from "@/hooks/use-url-state";
import { relTime } from "@/lib/beads-view";
import { polecatPoolName, type GascityAgent } from "@/lib/gascity-agents";

interface AgentListProps {
  agents: GascityAgent[];
  prefix: string | null;
  beadIds: Set<string>;
  openBead: (id: string) => void;
}

function AgentList({ agents, prefix, beadIds, openBead }: AgentListProps) {
  return (
    <ul className="border-t border-border">
      {agents.map((agent) => {
        const pool = prefix && agent.pool?.startsWith(prefix) ? agent.pool.slice(prefix.length) : agent.pool;
        return (
          <li
            key={agent.name}
            data-agent-name={agent.name}
            title={agent.suspended ? agent.unavailableReason ?? undefined : undefined}
            className="border-b border-border px-3 py-[10px] transition-[background-color,box-shadow] duration-500 last:border-b-0 data-[highlighted=true]:bg-[var(--brand-weak)] data-[highlighted=true]:ring-1 data-[highlighted=true]:ring-inset data-[highlighted=true]:ring-[var(--brand)]"
          >
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="font-semibold">{agent.shortName}</span>
              <span className="rounded-full border border-border bg-[var(--surface-2)] px-2 py-px text-[10.5px] font-semibold text-[var(--text-2)]">
                {agent.state}
              </span>
              {agent.activity && <span className="text-[12px] text-[var(--text-3)]">{agent.activity}</span>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--text-3)]">
              <span>Model: {agent.model ?? "—"}</span>
              <span>Pool: {pool ?? "—"}</span>
              <span title={agent.lastActivity ?? undefined}>Last active: {agent.lastActivity ? relTime(agent.lastActivity) : "—"}</span>
              {agent.activeBead && (beadIds.has(agent.activeBead) ? (
                <button
                  type="button"
                  onClick={() => openBead(agent.activeBead!)}
                  className="rounded px-1 font-mono text-[11px] text-[var(--brand)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
                >
                  {agent.activeBead}
                </button>
              ) : (
                <span className="font-mono text-[11px]">{agent.activeBead}</span>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Title for a type or pool section, for example `System (14 · 9 running)`. */
function groupTitle(label: string, agents: GascityAgent[]): string {
  const running = agents.filter((agent) => agent.running).length;
  return `${label} (${agents.length} · ${running} running)`;
}

/** Read-only agents for this project's rig, with links to known active beads. */
export function AgentsView() {
  const { projectId, openDetail } = useApp();
  const { data, isLoading, error } = useAgents(projectId);
  const { data: beadData } = useBeads(projectId);
  const { searchParams, updateUrl } = useUrlState();
  const focusName = searchParams.get("agent");
  const groupMode = searchParams.get("agentsGroup") === "status" ? "status" : "type";
  const beadIds = new Set(beadData?.beads.map((bead) => bead.id) ?? []);
  const agents = Array.isArray(data?.agents) ? data.agents : [];
  const missingData = !isLoading && (!data || data.malformed || !Array.isArray(data.agents));
  const prefix = data?.rig ? `${data.rig}/` : null;
  const rig = data?.rig ?? "";
  const groups = [
    { label: "Running", agents: agents.filter((agent) => agent.running), open: true },
    { label: "Stopped & suspended", agents: agents.filter((agent) => !agent.running), open: false },
  ];

  // Split agents into system and polecat sections, then group polecats by pool.
  const systemAgents: GascityAgent[] = [];
  const polecatGroups = new Map<string, GascityAgent[]>();
  for (const agent of agents) {
    const poolName = polecatPoolName(agent.pool, rig);
    if (poolName === null) {
      systemAgents.push(agent);
    } else {
      const group = polecatGroups.get(poolName);
      if (group) group.push(agent);
      else polecatGroups.set(poolName, [agent]);
    }
  }
  const sortedPolecatGroups = [...polecatGroups].sort(([a], [b]) => a.localeCompare(b));
  const polecatAgents = sortedPolecatGroups.flatMap(([, groupAgents]) => groupAgents);

  const selectGroup = (mode: "type" | "status") => {
    updateUrl((params) => {
      if (mode === "status") params.set("agentsGroup", "status");
      else params.delete("agentsGroup");
    }, "replace");
  };

  // Arriving from a bead's drawer: reveal every enclosing group, center the
  // agent's row and flash it briefly. The `agent` param is one-shot, so drop it
  // afterwards to keep a refresh from highlighting again.
  React.useEffect(() => {
    if (!focusName) return;
    const row = document.querySelector<HTMLElement>(
      `[data-agent-name="${CSS.escape(focusName)}"]`,
    );
    if (!row) return;
    let group = row.closest("details");
    while (group) {
      group.open = true;
      group = group.parentElement?.closest("details") ?? null;
    }
    row.setAttribute("data-highlighted", "true");
    const frame = requestAnimationFrame(() => row.scrollIntoView({ block: "center" }));
    const timer = setTimeout(() => {
      row.removeAttribute("data-highlighted");
      updateUrl((params) => params.delete("agent"), "replace");
    }, 2500);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      row.removeAttribute("data-highlighted");
    };
  }, [focusName, data, groupMode, updateUrl]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-6 py-4">
        <Icon name="bot" size={18} className="text-[var(--text-2)]" />
        <h1 className="text-[15px] font-[650]">Agents</h1>
        <span className="text-[12px] text-[var(--text-3)]">
          · Gas City agents{data?.rig ? ` in ${data.rig}` : ""}, refreshed every 30 seconds
        </span>
        <div className="ml-auto flex items-center gap-2" data-testid="agents-group-toggle">
          <span className="text-[12px] text-[var(--text-3)]">Group by</span>
          <button
            type="button"
            aria-pressed={groupMode === "type"}
            onClick={() => selectGroup("type")}
            className="h-8 rounded-[8px] border border-border px-3 text-[12px] aria-pressed:border-[var(--brand)] aria-pressed:bg-[var(--brand-weak)] aria-pressed:text-[var(--brand)]"
          >
            Type
          </button>
          <button
            type="button"
            aria-pressed={groupMode === "status"}
            onClick={() => selectGroup("status")}
            className="h-8 rounded-[8px] border border-border px-3 text-[12px] aria-pressed:border-[var(--brand)] aria-pressed:bg-[var(--brand-weak)] aria-pressed:text-[var(--brand)]"
          >
            Status
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {error || missingData ? (
          <div role="alert" className="p-8 text-center text-[13px] text-destructive">{error?.message ?? "Invalid agents response."}</div>
        ) : isLoading ? (
          <div className="p-8 text-center text-[13px] text-[var(--text-3)]">Loading agents…</div>
        ) : data && !data.configured ? (
          <div className="p-8 text-center text-[13px] text-[var(--text-3)]">
            Set GASCITY_API_URL to enable the read-only Gas City agents view.
          </div>
        ) : agents.length === 0 ? (
          <div className="p-8 text-center text-[13px] text-[var(--text-3)]">No agents in this rig.</div>
        ) : (
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            {groupMode === "status" ? (
              groups.map((group) => (
                <details key={group.label} open={group.open} className="rounded-[10px] border border-border">
                  <summary className="cursor-pointer px-3 py-[10px] text-[13px] font-semibold text-[var(--text-2)]">
                    {group.label} ({group.agents.length})
                  </summary>
                  <AgentList agents={group.agents} prefix={prefix} beadIds={beadIds} openBead={openDetail} />
                </details>
              ))
            ) : (
              <>
                {systemAgents.length > 0 && (
                  <details open data-testid="agents-section-system" className="rounded-[10px] border border-border">
                    <summary className="cursor-pointer px-3 py-[10px] text-[13px] font-semibold text-[var(--text-2)]">
                      {groupTitle("System", systemAgents)}
                    </summary>
                    {systemAgents.some((agent) => agent.running) && (
                      <AgentList agents={systemAgents.filter((agent) => agent.running)} prefix={prefix} beadIds={beadIds} openBead={openDetail} />
                    )}
                    {systemAgents.some((agent) => !agent.running) && (
                      <details className="border-t border-border">
                        <summary className="cursor-pointer px-6 py-[10px] text-[13px] text-[var(--text-2)]">
                          Stopped &amp; suspended ({systemAgents.filter((agent) => !agent.running).length})
                        </summary>
                        <AgentList agents={systemAgents.filter((agent) => !agent.running)} prefix={prefix} beadIds={beadIds} openBead={openDetail} />
                      </details>
                    )}
                  </details>
                )}
                {sortedPolecatGroups.length > 0 && (
                  <details open data-testid="agents-section-polecat" className="rounded-[10px] border border-border">
                    <summary className="cursor-pointer px-3 py-[10px] text-[13px] font-semibold text-[var(--text-2)]">
                      {groupTitle("Polecats", polecatAgents)}
                    </summary>
                    {sortedPolecatGroups.map(([poolName, groupAgents]) => {
                      const running = groupAgents.filter((agent) => agent.running);
                      const stopped = groupAgents.filter((agent) => !agent.running);
                      return (
                        <details key={poolName} open={running.length > 0} data-agent-pool={poolName} className="border-t border-border">
                          <summary className="cursor-pointer px-6 py-[10px] text-[13px] font-semibold text-[var(--text-2)]">
                            {groupTitle(poolName, groupAgents)}
                          </summary>
                          {running.length > 0 && (
                            <AgentList agents={running} prefix={prefix} beadIds={beadIds} openBead={openDetail} />
                          )}
                          {stopped.length > 0 && (
                            <details className="border-t border-border">
                              <summary className="cursor-pointer px-9 py-[10px] text-[13px] text-[var(--text-2)]">
                                Stopped &amp; suspended ({stopped.length})
                              </summary>
                              <AgentList agents={stopped} prefix={prefix} beadIds={beadIds} openBead={openDetail} />
                            </details>
                          )}
                        </details>
                      );
                    })}
                  </details>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

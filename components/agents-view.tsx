"use client";
import * as React from "react";
import { useApp } from "@/components/app-context";
import { Icon } from "@/components/icons";
import { useAgents } from "@/hooks/use-agents";
import { useBeads } from "@/hooks/use-beads";
import { relTime } from "@/lib/beads-view";

/** Read-only agents for this project's rig, with links to known active beads. */
export function AgentsView() {
  const { projectId, openDetail } = useApp();
  const { data, isLoading, error } = useAgents(projectId);
  const { data: beadData } = useBeads(projectId);
  const beadIds = new Set(beadData?.beads.map((bead) => bead.id) ?? []);
  const agents = Array.isArray(data?.agents) ? data.agents : [];
  const missingData = !isLoading && (!data || data.malformed || !Array.isArray(data.agents));
  const prefix = data?.rig ? `${data.rig}/` : null;
  const groups = [
    { label: "Running", agents: agents.filter((agent) => agent.running), open: true },
    { label: "Stopped & suspended", agents: agents.filter((agent) => !agent.running), open: false },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-6 py-4">
        <Icon name="bot" size={18} className="text-[var(--text-2)]" />
        <h1 className="text-[15px] font-[650]">Agents</h1>
        <span className="text-[12px] text-[var(--text-3)]">
          · Gas City agents{data?.rig ? ` in ${data.rig}` : ""}, refreshed every 30 seconds
        </span>
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
            {groups.map((group) => (
              <details key={group.label} open={group.open} className="rounded-[10px] border border-border">
                <summary className="cursor-pointer px-3 py-[10px] text-[13px] font-semibold text-[var(--text-2)]">
                  {group.label} ({group.agents.length})
                </summary>
                <ul className="border-t border-border">
                  {group.agents.map((agent) => {
                    const pool = prefix && agent.pool?.startsWith(prefix) ? agent.pool.slice(prefix.length) : agent.pool;
                    return (
                      <li
                        key={agent.name}
                        title={agent.suspended ? agent.unavailableReason ?? undefined : undefined}
                        className="border-b border-border px-3 py-[10px] last:border-b-0"
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
                              onClick={() => openDetail(agent.activeBead!)}
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
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

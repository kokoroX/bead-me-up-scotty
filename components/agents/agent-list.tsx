import * as React from "react";
import { agentGroup, GROUP_LABELS, GROUP_ORDER } from "@/lib/agent-groups";
import { agentStateClasses } from "@/lib/agent-state";
import { relTime } from "@/lib/beads-view";
import { polecatPoolName, STATE_ORDER, type GascityAgent } from "@/lib/gascity-agents";

interface AgentRowProps {
  agent: GascityAgent;
  rig: string;
  selected: boolean;
  onSelect: (name: string) => void;
}

/** One selectable row in the master list. */
function AgentRow({ agent, rig, selected, onSelect }: AgentRowProps) {
  const tone = agentStateClasses(agent.state);
  const bead = agent.activeBeadSummary;
  const beadTypeClass = bead?.type === "bug"
    ? "bg-destructive/10 text-destructive"
    : bead?.type === "molecule"
      ? "bg-[var(--brand-weak)] text-[var(--brand)]"
      : "bg-[var(--surface-2)] text-[var(--text-2)]";
  return (
    <li>
      <button
        type="button"
        data-agent-name={agent.name}
        aria-current={selected ? "true" : undefined}
        title={agent.suspended ? agent.unavailableReason ?? undefined : undefined}
        onClick={() => onSelect(agent.name)}
        className={`flex w-full flex-col gap-1 border-l-2 px-3 py-2 text-left text-[13px] transition-colors ${
          selected
            ? "border-[var(--brand)] bg-[var(--brand-weak)]"
            : "border-transparent hover:bg-[var(--surface-2)]"
        }`}
      >
        <span className="flex w-full min-w-0 items-center gap-2">
          <span
            aria-hidden
            data-state={agent.state}
            className={`h-[7px] w-[7px] flex-shrink-0 rounded-full ${tone.dot} ${
              tone.pulse ? "animate-pulse motion-reduce:animate-none" : ""
            }`}
          />
          <span className="min-w-0 flex-1 truncate font-medium">{agent.shortName}</span>
          <span className="flex-shrink-0 text-[11px] text-[var(--text-3)]">
            {agent.lastActivity ? relTime(agent.lastActivity) : "—"}
          </span>
        </span>
        <span data-testid="agent-row-bead" className="flex w-full min-w-0 items-center gap-[5px] pl-[15px] text-[12px] whitespace-nowrap">
          <span className="flex-shrink-0 rounded-[4px] border border-border px-[4px] text-[10px] text-[var(--text-2)]">
            {polecatPoolName(agent.pool, rig) ?? "system"}
          </span>
          {agent.activeBead ? (
            <>
              {bead && (
                <>
                  {bead.type !== null && (
                    <span className={`flex-shrink-0 rounded-[4px] px-[5px] text-[10px] font-semibold ${beadTypeClass}`}>
                      {bead.type}
                    </span>
                  )}
                  <span title={bead.title} className={`min-w-0 flex-1 truncate ${!agent.running ? "text-[var(--text-2)]" : ""}`}>
                    {bead.title}
                  </span>
                  {bead.priority !== null && (
                    <span className="flex-shrink-0 rounded-[4px] border border-border px-[4px] text-[10px] text-[var(--text-2)]">
                      P{bead.priority}
                    </span>
                  )}
                </>
              )}
              <span className="flex-shrink-0 font-mono text-[10.5px] text-[var(--text-3)]">
                {bead?.id ?? agent.activeBead}
              </span>
            </>
          ) : (
            <span className="min-w-0 truncate text-[var(--text-2)]">{agent.activity || "—"}</span>
          )}
        </span>
      </button>
    </li>
  );
}

function AgentRows({ agents, rig, selectedName, onSelect }: {
  agents: GascityAgent[];
  rig: string;
  selectedName: string | null;
  onSelect: (name: string) => void;
}) {
  if (agents.length === 0) return null;
  return (
    <ul className="border-t border-border">
      {agents.map((agent) => (
        <AgentRow key={agent.name} agent={agent} rig={rig} selected={agent.name === selectedName} onSelect={onSelect} />
      ))}
    </ul>
  );
}

interface GroupProps extends Omit<React.ComponentProps<"details">, "open" | "onToggle"> {
  groupKey: string;
  defaultOpen: boolean;
  forcedOpen: boolean;
  openGroups: Record<string, boolean>;
  onToggle: (key: string, open: boolean) => void;
  label: React.ReactNode;
  children: React.ReactNode;
}

/** A native disclosure whose open state survives polling re-renders. */
function Group({ groupKey, defaultOpen, forcedOpen, openGroups, onToggle, label, children, className = "", ...rest }: GroupProps) {
  const open = forcedOpen || (openGroups[groupKey] ?? defaultOpen);
  return (
    <details
      {...rest}
      data-group-key={groupKey}
      open={open}
      onToggle={(event) => onToggle(groupKey, event.currentTarget.open)}
      className={`rounded-[10px] border border-border ${className}`}
    >
      <summary className="cursor-pointer px-3 py-[9px] text-[12.5px] font-semibold text-[var(--text-2)]">
        {label}
      </summary>
      {children}
    </details>
  );
}

/** Describe mixed states without conflating work state and process liveness. */
function groupTitle(label: string, agents: GascityAgent[]): string {
  const counts = new Map<string, number>();
  for (const agent of agents) counts.set(agent.state, (counts.get(agent.state) ?? 0) + 1);
  const unknown = [...counts.keys()].filter((state) => !STATE_ORDER.some((known) => known === state)).sort((a, b) => a.localeCompare(b));
  const states = [...STATE_ORDER, ...unknown].filter((state) => counts.has(state));
  const breakdown = states.length > 1 ? ` · ${states.map((state) => `${counts.get(state)} ${state}`).join(" · ")}` : "";
  return `${label} (${agents.length}${breakdown})`;
}

interface AgentListProps {
  agents: GascityAgent[];
  rig: string;
  selectedName: string | null;
  onSelect: (name: string) => void;
  groupMode: "state" | "pool";
  openGroups: Record<string, boolean>;
  toggleGroup: (key: string, open: boolean) => void;
  narrowing: boolean;
}

/** Render the scrollable master list in state or pool groups. */
export function AgentList({ agents, rig, selectedName, onSelect, groupMode, openGroups, toggleGroup, narrowing }: AgentListProps) {
  const visibleKey = agents.map((agent) => agent.name).join("|");
  React.useEffect(() => {
    if (!selectedName) return;
    const row = document.querySelector<HTMLElement>(
      `[data-agent-name="${CSS.escape(selectedName)}"]`,
    );
    if (!row) return;
    let group = row.closest("details");
    while (group) {
      group.open = true;
      group = group.parentElement?.closest("details") ?? null;
    }
    const frame = requestAnimationFrame(() => row.scrollIntoView({ block: "nearest" }));
    return () => cancelAnimationFrame(frame);
  }, [selectedName, visibleKey, groupMode]);

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
  const systemRunning = systemAgents.filter((agent) => agent.running);
  const systemStopped = systemAgents.filter((agent) => !agent.running);
  const rows = (groupAgents: GascityAgent[]) => (
    <AgentRows agents={groupAgents} rig={rig} selectedName={selectedName} onSelect={onSelect} />
  );
  const groupProps = { forcedOpen: narrowing, openGroups, onToggle: toggleGroup };

  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      {agents.length === 0 ? (
        <div className="p-4 text-center text-[12px] text-[var(--text-3)]">No matching agents.</div>
      ) : groupMode === "state" ? (
        <div className="flex flex-col gap-2">
          {GROUP_ORDER.map((key) => {
            const groupAgents = agents.filter((agent) => agentGroup(agent) === key);
            if (groupAgents.length === 0) return null;
            return (
              <Group key={key} groupKey={`state:${key}`} defaultOpen={key !== "off"} {...groupProps} label={groupTitle(GROUP_LABELS[key], groupAgents)}>
                {rows(groupAgents)}
              </Group>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {systemAgents.length > 0 && (
            <Group groupKey="system" defaultOpen {...groupProps} label={groupTitle("System", systemAgents)} data-testid="agents-section-system">
              {systemRunning.length > 0 ? (
                <>
                  {rows(systemRunning)}
                  {systemStopped.length > 0 && (
                    <Group groupKey="system-stopped" defaultOpen={false} {...groupProps} label={groupTitle(GROUP_LABELS.off, systemStopped)} className="mt-1 border-x-0 border-b-0">
                      {rows(systemStopped)}
                    </Group>
                  )}
                </>
              ) : (
                rows(systemStopped)
              )}
            </Group>
          )}
          {sortedPolecatGroups.length > 0 && (
            <Group groupKey="polecat" defaultOpen {...groupProps} label={groupTitle("Polecats", polecatAgents)} data-testid="agents-section-polecat">
              {sortedPolecatGroups.map(([poolName, groupAgents]) => {
                const running = groupAgents.filter((agent) => agent.running);
                const stopped = groupAgents.filter((agent) => !agent.running);
                return (
                  <Group key={poolName} groupKey={`pool:${poolName}`} defaultOpen={running.length > 0} {...groupProps} label={groupTitle(poolName, groupAgents)} data-agent-pool={poolName} className="mt-1 border-x-0 border-b-0">
                    {running.length > 0 ? (
                      <>
                        {rows(running)}
                        {stopped.length > 0 && (
                          <Group groupKey={`pool-stopped:${poolName}`} defaultOpen={false} {...groupProps} label={groupTitle(GROUP_LABELS.off, stopped)} className="mt-1 border-x-0 border-b-0">
                            {rows(stopped)}
                          </Group>
                        )}
                      </>
                    ) : (
                      rows(stopped)
                    )}
                  </Group>
                );
              })}
            </Group>
          )}
        </div>
      )}
    </div>
  );
}

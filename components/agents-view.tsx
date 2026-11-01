"use client";
import * as React from "react";
import { AgentConversation } from "@/components/agents/agent-conversation";
import { AgentList } from "@/components/agents/agent-list";
import { useApp } from "@/components/app-context";
import { Icon } from "@/components/icons";
import { useAgents } from "@/hooks/use-agents";
import { useBeads } from "@/hooks/use-beads";
import { useUrlState } from "@/hooks/use-url-state";
import { agentStateClasses } from "@/lib/agent-state";
import { relTime } from "@/lib/beads-view";
import {
  polecatPoolName,
  STATE_ORDER,
  type GascityAgent,
} from "@/lib/gascity-agents";

const STATE_FILTERS = ["all", ...STATE_ORDER] as const;
type AgentStateFilter = (typeof STATE_FILTERS)[number];

const STATE_LABELS: Record<AgentStateFilter, string> = {
  all: "All",
  working: "Working",
  waiting: "Waiting",
  idle: "Idle",
  suspended: "Suspended",
  stopped: "Stopped",
};

type DetailTab = "conversation" | "details";

function formatTokens(value: number): string {
  return value >= 1000 ? `${Math.round(value / 1000)}k` : String(value);
}

interface AgentDetailProps {
  agent: GascityAgent;
  rig: string;
  beadIds: Set<string>;
  openBead: (id: string) => void;
}

/** Right-hand pane: agent summary, context meter, transcript and raw details. */
function AgentDetail({ agent, rig, beadIds, openBead }: AgentDetailProps) {
  const { projectId } = useApp();
  const [tab, setTab] = React.useState<DetailTab>("conversation");
  const tabRefs = React.useRef<Record<DetailTab, HTMLButtonElement | null>>({
    conversation: null,
    details: null,
  });
  const tone = agentStateClasses(agent.state);
  const poolName = polecatPoolName(agent.pool, rig);
  const typeLabel = poolName === null ? "System" : `Polecat · ${poolName}`;
  const contextPct = typeof agent.contextPct === "number" ? agent.contextPct : null;
  const contextWindow = typeof agent.contextWindow === "number" ? agent.contextWindow : null;
  const usedTokens =
    contextPct !== null && contextWindow !== null
      ? Math.round((contextWindow * contextPct) / 100)
      : null;

  const tabs: DetailTab[] = ["conversation", "details"];
  const selectTab = (next: DetailTab) => {
    setTab(next);
    requestAnimationFrame(() => tabRefs.current[next]?.focus());
  };
  const onTabKeyDown = (event: React.KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = tabs.indexOf(tab);
    const next =
      event.key === "Home"
        ? tabs[0]
        : event.key === "End"
          ? tabs[tabs.length - 1]
          : tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
    selectTab(next);
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="border-b border-border px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            aria-hidden
            data-state={agent.state}
            className={`h-[8px] w-[8px] flex-shrink-0 rounded-full ${tone.dot} ${
              tone.pulse ? "animate-pulse motion-reduce:animate-none" : ""
            }`}
          />
          <h2 className="text-[20px] font-[650] leading-none">{agent.shortName}</h2>
          <span
            data-state={agent.state}
            className={`rounded-full border px-2 py-px text-[10.5px] font-semibold ${tone.chip}`}
          >
            {agent.state}
          </span>
          {agent.state === "working" && (
            <span className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
              <span aria-hidden className="h-[6px] w-[6px] animate-pulse rounded-full bg-emerald-500 motion-reduce:animate-none" />
              live
            </span>
          )}
        </div>
        <div className="mt-[7px] flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--text-3)]">
          <span>Type: {typeLabel}</span>
          <span>Model: {agent.model ?? "—"}</span>
          <span title={agent.lastActivity ?? undefined}>
            Last active: {agent.lastActivity ? relTime(agent.lastActivity) : "—"}
          </span>
          <span className="flex items-center gap-1">
            Bead:{" "}
            {agent.activeBead ? (
              beadIds.has(agent.activeBead) ? (
                <button
                  type="button"
                  onClick={() => openBead(agent.activeBead!)}
                  className="rounded px-1 font-mono text-[11px] text-[var(--brand)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
                >
                  {agent.activeBead}
                </button>
              ) : (
                <span className="font-mono text-[11px]">{agent.activeBead}</span>
              )
            ) : (
              <span>—</span>
            )}
          </span>
        </div>
        <div data-testid="agent-context-meter" className="mt-3 max-w-[360px]">
          {contextPct !== null ? (
            <>
              <div className="flex items-center justify-between text-[11px] text-[var(--text-2)]">
                <span>Context usage</span>
                <span>{Math.round(contextPct)}%</span>
              </div>
              <div
                role="meter"
                aria-label="Context usage"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.max(0, Math.min(100, contextPct))}
                className="mt-1 h-[6px] overflow-hidden rounded-full bg-[var(--surface-2)]"
              >
                <div
                  className="h-full rounded-full bg-[var(--brand)]"
                  style={{ width: `${Math.max(0, Math.min(100, contextPct))}%` }}
                />
              </div>
              <div className="mt-1 text-[11px] text-[var(--text-3)]">
                {usedTokens !== null && contextWindow !== null
                  ? `${formatTokens(usedTokens)} / ${formatTokens(contextWindow)} tokens`
                  : `${Math.round(contextPct)}% of context used`}
              </div>
            </>
          ) : (
            <>
              <div className="h-[6px] rounded-full bg-[var(--surface-2)]" />
              <div className="mt-1 text-[11px] text-[var(--text-3)]">
                Context usage not reported
              </div>
            </>
          )}
        </div>
      </div>

      <div role="tablist" aria-label="Agent detail" className="flex gap-1 border-b border-border px-4">
        {tabs.map((item) => (
          <button
            key={item}
            ref={(element) => {
              tabRefs.current[item] = element;
            }}
            type="button"
            role="tab"
            id={`agent-tab-${item}`}
            aria-controls={`agent-panel-${item}`}
            aria-selected={tab === item}
            tabIndex={tab === item ? 0 : -1}
            onClick={() => setTab(item)}
            onKeyDown={onTabKeyDown}
            className={`border-b-2 px-3 py-2 text-[12.5px] font-medium ${
              tab === item
                ? "border-[var(--brand)] text-[var(--brand)]"
                : "border-transparent text-[var(--text-2)] hover:text-[var(--text)]"
            }`}
          >
            {item === "conversation" ? "Conversation" : "Details"}
          </button>
        ))}
      </div>

      {tab === "conversation" ? (
        <AgentConversation agent={agent} projectId={projectId} />
      ) : (
        <div
          role="tabpanel"
          id="agent-panel-details"
          aria-labelledby="agent-tab-details"
          className="min-h-0 flex-1 overflow-y-auto p-4"
        >
          <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-[9px] text-[12.5px]">
            <dt className="text-[var(--text-3)]">Name</dt>
            <dd className="font-mono text-[11.5px]">{agent.name}</dd>
            <dt className="text-[var(--text-3)]">Pool</dt>
            <dd>{agent.pool ?? "—"}</dd>
            <dt className="text-[var(--text-3)]">State / activity</dt>
            <dd>{agent.activity ? `${agent.state} · ${agent.activity}` : agent.state}</dd>
            <dt className="text-[var(--text-3)]">Process</dt>
            <dd>
              {agent.running ? "live" : "stopped"}
              {agent.suspended && " · suspended"}
              {agent.unavailableReason && ` · ${agent.unavailableReason}`}
            </dd>
            <dt className="text-[var(--text-3)]">Model</dt>
            <dd>{agent.model ?? "—"}</dd>
            <dt className="text-[var(--text-3)]">Last activity</dt>
            <dd className="font-mono text-[11.5px]">{agent.lastActivity ?? "—"}</dd>
            <dt className="text-[var(--text-3)]">Active bead</dt>
            <dd>
              {agent.activeBead ? (
                beadIds.has(agent.activeBead) ? (
                  <button
                    type="button"
                    onClick={() => openBead(agent.activeBead!)}
                    className="rounded font-mono text-[11.5px] text-[var(--brand)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
                  >
                    {agent.activeBead}
                  </button>
                ) : (
                  <span className="font-mono text-[11.5px]">{agent.activeBead}</span>
                )
              ) : (
                "—"
              )}
            </dd>
          </dl>
        </div>
      )}
    </div>
  );
}

/** Read-only master/detail view of this project's rig agents and transcripts. */
export function AgentsView() {
  const { projectId, openDetail } = useApp();
  const { data, isLoading, error } = useAgents(projectId);
  const { data: beadData } = useBeads(projectId);
  const { searchParams, updateUrl } = useUrlState();
  const groupMode = searchParams.get("agentsGroup") === "pool" ? "pool" : "state";
  const rawStateFilter = searchParams.get("agentsState");
  const stateFilter = STATE_FILTERS.includes(rawStateFilter as AgentStateFilter)
    ? (rawStateFilter as AgentStateFilter)
    : "all";
  const selectedName = searchParams.get("agent");
  const [filter, setFilter] = React.useState("");
  const [openGroups, setOpenGroups] = React.useState<Record<string, boolean>>({});
  const beadIds = new Set(beadData?.beads.map((bead) => bead.id) ?? []);
  const agents = React.useMemo(
    () => (Array.isArray(data?.agents) ? data.agents : []),
    [data],
  );
  const missingData = !isLoading && (!data || data.malformed || !Array.isArray(data.agents));
  const rig = data?.rig ?? "";

  const selectedAgent = React.useMemo(() => {
    if (selectedName) {
      const found = agents.find((agent) => agent.name === selectedName);
      if (found) return found;
    }
    return (
      agents.find((agent) => agent.state === "working") ??
      agents.find((agent) => agent.running) ??
      agents[0] ??
      null
    );
  }, [agents, selectedName]);

  // Keep the selection persistent in the URL, including the initial fallback.
  React.useEffect(() => {
    if (!selectedAgent || selectedName === selectedAgent.name) return;
    updateUrl((params) => params.set("agent", selectedAgent.name), "replace");
  }, [selectedAgent, selectedName, updateUrl]);

  const selectAgent = (name: string) => {
    updateUrl((params) => params.set("agent", name), "replace");
  };

  const selectGroup = (mode: "state" | "pool") => {
    updateUrl((params) => {
      if (mode === "pool") params.set("agentsGroup", "pool");
      else params.delete("agentsGroup");
    }, "replace");
  };

  const toggleState = (state: AgentStateFilter) => {
    updateUrl((params) => {
      params.set("agentsState", state === stateFilter ? "all" : state);
    }, "replace");
  };

  const toggleGroup = React.useCallback((key: string, open: boolean) => {
    setOpenGroups((previous) =>
      previous[key] === open ? previous : { ...previous, [key]: open },
    );
  }, []);

  const needle = filter.trim().toLowerCase();
  const narrowing = needle !== "" || stateFilter !== "all";
  const visibleAgents = agents.filter(
    (agent) =>
      (stateFilter === "all" || agent.state === stateFilter) &&
      (needle === "" || agent.shortName.toLowerCase().includes(needle)),
  );

  const normal = !error && !missingData && !isLoading && data?.configured === true && agents.length > 0;

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
            aria-pressed={groupMode === "state"}
            onClick={() => selectGroup("state")}
            className="h-8 rounded-[8px] border border-border px-3 text-[12px] aria-pressed:border-[var(--brand)] aria-pressed:bg-[var(--brand-weak)] aria-pressed:text-[var(--brand)]"
          >
            State
          </button>
          <button
            type="button"
            aria-pressed={groupMode === "pool"}
            onClick={() => selectGroup("pool")}
            className="h-8 rounded-[8px] border border-border px-3 text-[12px] aria-pressed:border-[var(--brand)] aria-pressed:bg-[var(--brand-weak)] aria-pressed:text-[var(--brand)]"
          >
            Pool
          </button>
        </div>
      </div>

      {normal && (
        <div
          data-testid="agents-state-filter"
          className="flex flex-wrap items-center gap-1 border-b border-border px-4 py-2"
        >
          {STATE_FILTERS.map((state) => {
            const count = state === "all" ? agents.length : agents.filter((agent) => agent.state === state).length;
            const dot = state === "all" ? "bg-[var(--text-3)]" : agentStateClasses(state).dot;
            return (
              <React.Fragment key={state}>
                <button
                  type="button"
                  data-agent-state={state}
                  aria-pressed={stateFilter === state}
                  aria-label={`${STATE_LABELS[state]} (${count})`}
                  onClick={() => toggleState(state)}
                  className="flex items-center gap-[6px] rounded-[7px] px-2 py-[3px] text-[11.5px] text-[var(--text-2)] hover:bg-[var(--surface-2)] aria-pressed:bg-[var(--brand-weak)] aria-pressed:text-[var(--brand)]"
                >
                  <span aria-hidden data-state={state} className={`h-[7px] w-[7px] rounded-full ${dot}`} />
                  <span>{STATE_LABELS[state]}</span>
                  <span className="text-[var(--text-3)]">{count}</span>
                </button>
                {state === "all" && <span aria-hidden className="mx-1 h-4 w-px bg-border" />}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {error || missingData ? (
        <div role="alert" className="p-8 text-center text-[13px] text-destructive">
          {error?.message ?? "Invalid agents response."}
        </div>
      ) : isLoading ? (
        <div className="p-8 text-center text-[13px] text-[var(--text-3)]">Loading agents…</div>
      ) : data && !data.configured ? (
        <div className="p-8 text-center text-[13px] text-[var(--text-3)]">
          Set GASCITY_API_URL to enable the read-only Gas City agents view.
        </div>
      ) : agents.length === 0 ? (
        <div className="p-8 text-center text-[13px] text-[var(--text-3)]">No agents in this rig.</div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <aside className="flex max-h-[45vh] w-full flex-col border-b border-border md:max-h-none md:w-[300px] md:flex-shrink-0 md:border-b-0 md:border-r">
            <div className="border-b border-border p-2">
              <input
                type="search"
                data-testid="agents-filter"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Filter agents…"
                aria-label="Filter agents by name"
                className="h-8 w-full rounded-[8px] border border-border bg-background px-2 text-[12px] outline-none focus:border-[var(--brand)]"
              />
            </div>
            <AgentList
              agents={visibleAgents}
              rig={rig}
              selectedName={selectedName}
              onSelect={selectAgent}
              groupMode={groupMode}
              openGroups={openGroups}
              toggleGroup={toggleGroup}
              narrowing={narrowing}
            />
          </aside>

          <section data-testid="agent-detail" className="flex min-h-0 min-w-0 flex-1 flex-col">
            {selectedAgent ? (
              <AgentDetail
                key={selectedAgent.name}
                agent={selectedAgent}
                rig={rig}
                beadIds={beadIds}
                openBead={openDetail}
              />
            ) : (
              <div className="p-8 text-center text-[13px] text-[var(--text-3)]">
                Select an agent to view its context.
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

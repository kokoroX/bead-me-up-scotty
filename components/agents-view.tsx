"use client";
import * as React from "react";
import { useApp } from "@/components/app-context";
import { Icon } from "@/components/icons";
import { useAgentOutput } from "@/hooks/use-agent-output";
import { useAgents } from "@/hooks/use-agents";
import { useBeads } from "@/hooks/use-beads";
import { useUrlState } from "@/hooks/use-url-state";
import { agentStateClasses } from "@/lib/agent-state";
import { relTime } from "@/lib/beads-view";
import {
  polecatPoolName,
  type AgentTurn,
  type GascityAgent,
} from "@/lib/gascity-agents";
import type { AgentOutputResponse } from "@/lib/api-client";

const STATE_FILTERS = ["all", "working", "waiting", "idle", "suspended", "stopped"] as const;
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

interface AgentRowProps {
  agent: GascityAgent;
  selected: boolean;
  onSelect: (name: string) => void;
}

/** One selectable row in the master list. */
function AgentRow({ agent, selected, onSelect }: AgentRowProps) {
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
        {agent.activeBead && (
          <span data-testid="agent-row-bead" className="flex w-full min-w-0 items-center gap-[5px] pl-[15px] text-[12px] whitespace-nowrap">
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
          </span>
        )}
      </button>
    </li>
  );
}

function AgentRows({
  agents,
  selectedName,
  onSelect,
}: {
  agents: GascityAgent[];
  selectedName: string | null;
  onSelect: (name: string) => void;
}) {
  return (
    <ul className="border-t border-border">
      {agents.map((agent) => (
        <AgentRow
          key={agent.name}
          agent={agent}
          selected={agent.name === selectedName}
          onSelect={onSelect}
        />
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
function Group({
  groupKey,
  defaultOpen,
  forcedOpen,
  openGroups,
  onToggle,
  label,
  children,
  className = "",
  ...rest
}: GroupProps) {
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

/** Title for a type or pool section, for example `System (14 · 9 running)`. */
function groupTitle(label: string, agents: GascityAgent[]): string {
  const running = agents.filter((agent) => agent.running).length;
  return `${label} (${agents.length} · ${running} running)`;
}

function formatTokens(value: number): string {
  return value >= 1000 ? `${Math.round(value / 1000)}k` : String(value);
}

function flattenTurns(pages: AgentOutputResponse[] | undefined): AgentTurn[] {
  if (!pages) return [];
  const turns: AgentTurn[] = [];
  const seen = new Set<string>();
  for (const page of [...pages].reverse()) {
    for (const turn of page.turns) {
      if (turn.id) {
        if (seen.has(turn.id)) continue;
        seen.add(turn.id);
      }
      turns.push(turn);
    }
  }
  return turns;
}

function firstLine(text: string, limit = 60): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit)}…` : flat;
}

/** Render one transcript turn as plain text, a thought, a tool tag or a result. */
function Turn({ turn }: { turn: AgentTurn }) {
  const isUser = turn.role === "user";
  const text = turn.text;
  const trimmed = text.trimStart();
  let body: React.ReactNode;

  if (trimmed.startsWith("[thinking]")) {
    const thought = trimmed.slice("[thinking]".length).trim();
    body = (
      <details className="text-[12px] text-[var(--text-3)]">
        <summary className="cursor-pointer italic">Thinking…</summary>
        <div className="mt-1 whitespace-pre-wrap text-[12.5px] text-[var(--text-2)]">
          {thought}
        </div>
      </details>
    );
  } else if (isUser && trimmed.startsWith("[result]")) {
    const result = trimmed.slice("[result]".length).trim();
    body = (
      <details className="text-[12px] text-[var(--text-2)]">
        <summary className="cursor-pointer">{firstLine(result) || "Result"}</summary>
        <div className="mt-1 whitespace-pre-wrap text-[12.5px] text-[var(--text)]">
          {result}
        </div>
      </details>
    );
  } else {
    const tool = trimmed.match(/^\[([A-Za-z0-9_.:-]+)\]$/);
    if (tool) {
      body = (
        <span className="inline-flex items-center rounded-[5px] border border-border bg-[var(--surface-2)] px-[6px] py-px font-mono text-[11px] text-[var(--text-2)]">
          {tool[1]}
        </span>
      );
    } else {
      body = (
        <div className="whitespace-pre-wrap text-[12.5px] leading-[1.5] text-[var(--text)]">
          {text}
        </div>
      );
    }
  }

  return (
    <div data-testid="agent-turn" data-role={turn.role} className="flex gap-[9px]">
      <span
        aria-hidden
        className={`mt-px flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-[7px] ${
          isUser
            ? "bg-[var(--surface-2)] text-[var(--text-2)]"
            : "bg-[var(--brand-weak)] text-[var(--brand)]"
        }`}
      >
        <Icon name={isUser ? "user" : "bot"} size={13} />
      </span>
      <div className="min-w-0 flex-1 pt-[2px]">{body}</div>
    </div>
  );
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
  const output = useAgentOutput(projectId, agent);
  const [tab, setTab] = React.useState<DetailTab>("conversation");
  const tabRefs = React.useRef<Record<DetailTab, HTMLButtonElement | null>>({
    conversation: null,
    details: null,
  });
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const stickToBottom = React.useRef(true);
  const initialScroll = React.useRef(true);
  const olderScroll = React.useRef<{ height: number; top: number; pages: number } | null>(null);

  const pages = output.data?.pages;
  const first = pages?.[0];
  const turns = React.useMemo(() => flattenTurns(pages), [pages]);
  const tone = agentStateClasses(agent.state);
  const poolName = polecatPoolName(agent.pool, rig);
  const typeLabel = poolName === null ? "System" : `Polecat · ${poolName}`;
  const contextPct = typeof agent.contextPct === "number" ? agent.contextPct : null;
  const contextWindow = typeof agent.contextWindow === "number" ? agent.contextWindow : null;
  const usedTokens =
    contextPct !== null && contextWindow !== null
      ? Math.round((contextWindow * contextPct) / 100)
      : null;

  React.useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const older = olderScroll.current;
    if (older && (pages?.length ?? 0) > older.pages) {
      element.scrollTop = older.top + element.scrollHeight - older.height;
      olderScroll.current = null;
    } else if (initialScroll.current || (!older && stickToBottom.current)) {
      element.scrollTop = element.scrollHeight;
      initialScroll.current = false;
    }
  }, [pages, tab]);

  const loadOlder = async () => {
    const element = scrollRef.current;
    if (element) {
      olderScroll.current = {
        height: element.scrollHeight,
        top: element.scrollTop,
        pages: pages?.length ?? 0,
      };
    }
    const result = await output.fetchNextPage();
    if (result.isError) olderScroll.current = null;
  };

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
        <div
          role="tabpanel"
          id="agent-panel-conversation"
          aria-labelledby="agent-tab-conversation"
          data-testid="agent-conversation"
          className="flex min-h-0 flex-1 flex-col"
        >
          {output.isError ? (
            <div role="alert" className="p-5 text-[13px] text-destructive">
              {(output.error as Error).message}
            </div>
          ) : output.isLoading ? (
            <div className="p-5 text-[13px] text-[var(--text-3)]">Loading transcript…</div>
          ) : first && !first.configured ? (
            <div className="p-5 text-[13px] text-[var(--text-3)]">
              Gas City is not configured.
            </div>
          ) : first && !first.available ? (
            <div className="p-5 text-[13px] text-[var(--text-3)]">
              No transcript for this agent.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-border px-4 py-2 text-[11.5px] text-[var(--text-3)]">
                <span>
                  Last {turns.length} turns · {first?.pagination.total ?? turns.length} messages
                </span>
                {output.hasNextPage && (
                  <button
                    type="button"
                    data-testid="agent-load-older"
                    disabled={output.isFetchingNextPage}
                    onClick={() => void loadOlder()}
                    className="rounded-[6px] border border-border px-2 py-[2px] text-[11.5px] text-[var(--text-2)] hover:border-[var(--brand)] hover:text-[var(--brand)] disabled:opacity-50"
                  >
                    {output.isFetchingNextPage ? "Loading…" : "Load older"}
                  </button>
                )}
              </div>
              <div
                ref={scrollRef}
                onScroll={(event) => {
                  const element = event.currentTarget;
                  stickToBottom.current =
                    element.scrollHeight - element.scrollTop - element.clientHeight < 48;
                }}
                className="flex min-h-0 flex-1 flex-col gap-[11px] overflow-y-auto px-4 py-3"
              >
                {turns.length === 0 ? (
                  <div className="text-[13px] text-[var(--text-3)]">No messages yet.</div>
                ) : first?.format === "text" ? (
                  <pre className="whitespace-pre-wrap break-words font-mono text-[12.5px] leading-[1.5]">
                    {turns.map((turn) => turn.text).join("\n\n")}
                  </pre>
                ) : (
                  turns.map((turn, index) => (
                    <Turn key={turn.id ?? `${turn.role}-${index}`} turn={turn} />
                  ))
                )}
              </div>
            </>
          )}
        </div>
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
            <dt className="text-[var(--text-3)]">Running</dt>
            <dd>{agent.running ? "Yes" : "No"}</dd>
            <dt className="text-[var(--text-3)]">Suspended</dt>
            <dd>{agent.suspended ? "Yes" : "No"}</dd>
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
  const groupMode = searchParams.get("agentsGroup") === "status" ? "status" : "type";
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

  const selectGroup = (mode: "type" | "status") => {
    updateUrl((params) => {
      if (mode === "status") params.set("agentsGroup", "status");
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

  // Split visible agents into system and polecat sections, then by pool.
  const systemAgents: GascityAgent[] = [];
  const polecatGroups = new Map<string, GascityAgent[]>();
  for (const agent of visibleAgents) {
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
  const runningVisible = visibleAgents.filter((agent) => agent.running);
  const stoppedVisible = visibleAgents.filter((agent) => !agent.running);
  const systemRunning = systemAgents.filter((agent) => agent.running);
  const systemStopped = systemAgents.filter((agent) => !agent.running);

  // Reveal the selected row's ancestors whenever selection or grouping changes.
  const visibleKey = visibleAgents.map((agent) => agent.name).join("|");
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
            <div className="min-h-0 flex-1 overflow-y-auto p-2">
              {visibleAgents.length === 0 ? (
                <div className="p-4 text-center text-[12px] text-[var(--text-3)]">
                  No matching agents.
                </div>
              ) : groupMode === "status" ? (
                <div className="flex flex-col gap-2">
                  <Group
                    groupKey="status-running"
                    defaultOpen
                    forcedOpen={narrowing}
                    openGroups={openGroups}
                    onToggle={toggleGroup}
                    label={`Running (${runningVisible.length})`}
                  >
                    <AgentRows
                      agents={runningVisible}
                      selectedName={selectedName}
                      onSelect={selectAgent}
                    />
                  </Group>
                  <Group
                    groupKey="status-stopped"
                    defaultOpen={false}
                    forcedOpen={narrowing}
                    openGroups={openGroups}
                    onToggle={toggleGroup}
                    label={`Stopped & suspended (${stoppedVisible.length})`}
                  >
                    <AgentRows
                      agents={stoppedVisible}
                      selectedName={selectedName}
                      onSelect={selectAgent}
                    />
                  </Group>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {systemAgents.length > 0 && (
                    <Group
                      groupKey="system"
                      defaultOpen
                      forcedOpen={narrowing}
                      openGroups={openGroups}
                      onToggle={toggleGroup}
                      label={groupTitle("System", systemAgents)}
                      data-testid="agents-section-system"
                    >
                      <AgentRows
                        agents={systemRunning}
                        selectedName={selectedName}
                        onSelect={selectAgent}
                      />
                      {systemStopped.length > 0 && (
                        <Group
                          groupKey="system-stopped"
                          defaultOpen={false}
                          forcedOpen={narrowing}
                          openGroups={openGroups}
                          onToggle={toggleGroup}
                          label={`Stopped & suspended (${systemStopped.length})`}
                          className="mt-1 border-x-0 border-b-0"
                        >
                          <AgentRows
                            agents={systemStopped}
                            selectedName={selectedName}
                            onSelect={selectAgent}
                          />
                        </Group>
                      )}
                    </Group>
                  )}
                  {sortedPolecatGroups.length > 0 && (
                    <Group
                      groupKey="polecat"
                      defaultOpen
                      forcedOpen={narrowing}
                      openGroups={openGroups}
                      onToggle={toggleGroup}
                      label={groupTitle("Polecats", polecatAgents)}
                      data-testid="agents-section-polecat"
                    >
                      {sortedPolecatGroups.map(([poolName, groupAgents]) => {
                        const running = groupAgents.filter((agent) => agent.running);
                        const stopped = groupAgents.filter((agent) => !agent.running);
                        return (
                          <Group
                            key={poolName}
                            groupKey={`pool:${poolName}`}
                            defaultOpen={running.length > 0}
                            forcedOpen={narrowing}
                            openGroups={openGroups}
                            onToggle={toggleGroup}
                            label={groupTitle(poolName, groupAgents)}
                            data-agent-pool={poolName}
                            className="mt-1 border-x-0 border-b-0"
                          >
                            <AgentRows
                              agents={running}
                              selectedName={selectedName}
                              onSelect={selectAgent}
                            />
                            {stopped.length > 0 && (
                              <Group
                                groupKey={`pool-stopped:${poolName}`}
                                defaultOpen={false}
                                forcedOpen={narrowing}
                                openGroups={openGroups}
                                onToggle={toggleGroup}
                                label={`Stopped & suspended (${stopped.length})`}
                                className="mt-1 border-x-0 border-b-0"
                              >
                                <AgentRows
                                  agents={stopped}
                                  selectedName={selectedName}
                                  onSelect={selectAgent}
                                />
                              </Group>
                            )}
                          </Group>
                        );
                      })}
                    </Group>
                  )}
                </div>
              )}
            </div>
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

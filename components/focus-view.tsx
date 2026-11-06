"use client";
import * as React from "react";
import { useApp } from "@/components/app-context";
import { Icon, typeIconName } from "@/components/icons";
import { PriorityChip } from "@/components/board/bead-card";
import { isBlocked, blockingDeps, relTime, fmtDateTime, typeColor, catColor } from "@/lib/beads-view";
import type { Bead } from "@/lib/schema";

/**
 * Focus — "what's happening now". Five fixed columns cut by status × priority:
 *
 *   In flight     — in_progress or hooked work, excluding agent working
 *   Queued        — open, routed, unassigned, unblocked, non-epic work
 *   Agent working — open or in_progress work routed for execution
 *   Blocked       — blocked status, or open with an unresolved blocking dep
 *   Next up       — open, unblocked, P0/P1 only, excluding queued and working
 *
 * Gas City internal convoy, workflow and step beads are excluded from Focus.
 * Recently finished work can be shown as an optional sixth column.
 * Everything else (the deep ready pool, P2+ backlog) stays behind
 * the Board/List views — that's the point: an optional screen that answers
 * "what's in flight, what's stuck, what would I pick up next" without scrolling.
 *
 * Lane chips: when SCOTTY_LANE_PREFIX is set (e.g. "ctx:"), one chip per lane
 * label found on the visible beads filters all columns — a one-click
 * "show me this lane's now". Unset → no chips.
 */

const ARCHIVED = "archived";
const RECENT_LIMIT = 7;
type FocusColumn = { id: string; title: string; hint: string; items: Bead[]; agent?: "working" | "queued" };

function agentColors(agent: NonNullable<FocusColumn["agent"]>) {
  return agent === "working"
    ? { accent: "var(--brand)", weak: "var(--brand-weak)" }
    : { accent: "var(--idle)", weak: "var(--idle-weak)" };
}

function completionDate(bead: Bead): string | undefined {
  // Invalid/missing completion dates fall back to the last known update.
  const closed = Date.parse(bead.closed_at || "");
  if (Number.isFinite(closed)) return bead.closed_at || undefined;
  const updated = Date.parse(bead.updated_at || "");
  return Number.isFinite(updated) ? bead.updated_at : undefined;
}

function completionTime(bead: Bead): number {
  return Date.parse(completionDate(bead) || "") || 0;
}

function routedTarget(bead: Bead): string | null {
  const target = bead.metadata?.["gc.routed_to"];
  return typeof target === "string" ? target.trim() || null : null;
}

function executionTarget(bead: Bead): string | null {
  const target = bead.metadata?.["gc.execution_routed_to"];
  return typeof target === "string" ? target.trim() || null : null;
}

function isGascityInternal(bead: Bead): boolean {
  const synthetic = bead.metadata?.["gc.synthetic"];
  const step = bead.metadata?.["gc.step_id"];
  return synthetic === "true" || synthetic === true || bead.metadata?.["gc.kind"] === "workflow" ||
    (typeof step === "string" && step.trim() !== "");
}

function assigneeKey(bead: Bead): string {
  // Prefix real names so no name can collide with the blank-assignee sentinel.
  return bead.assignee?.trim() ? `person:${bead.assignee.trim()}` : "none";
}

function assigneeGroups(columns: FocusColumn[]) {
  const groups = new Map<string, { key: string; label: string; columns: FocusColumn[]; active: boolean }>();
  for (const [columnIndex, column] of columns.entries()) {
    for (const bead of column.items) {
      const key = assigneeKey(bead);
      let group = groups.get(key);
      if (!group) {
        group = { key, label: bead.assignee?.trim() || "No assignee",
          columns: columns.map(c => ({ ...c, items: [] })), active: false };
        groups.set(key, group);
      }
      group.columns[columnIndex].items.push(bead);
      group.active ||= column.id === "flight";
    }
  }
  return [...groups.values()].sort((a, b) =>
    Number(a.key === "none") - Number(b.key === "none") ||
    Number(b.active) - Number(a.active) || a.label.localeCompare(b.label) || a.key.localeCompare(b.key));
}

function laneOf(b: Bead, prefix: string): string | null {
  const l = (b.labels ?? []).find((x) => x.startsWith(prefix));
  return l ? l.slice(prefix.length) : null;
}

export function FocusView() {
  const { beads, index, meta } = useApp();
  const prefix = meta?.lanePrefix ?? null;
  const [groupBy, setGroupBy] = React.useState<"none" | "assignee">("none");
  const [showRecent, setShowRecent] = React.useState(false);
  const [showAllRecent, setShowAllRecent] = React.useState(false);
  const [lane, setLane] = React.useState<string | null>(null); // null = all, "" = unlabeled

  const active = React.useMemo(
    () => beads.filter((b) => !(b.labels ?? []).includes(ARCHIVED) && !isGascityInternal(b)),
    [beads],
  );

  const lanes = React.useMemo(() => {
    if (!prefix) return [];
    const s = new Set<string>();
    for (const b of active) {
      if (!["in_progress", "hooked", "blocked", "open"].includes(b.status) && !(showRecent && b.status === "closed")) continue;
      const l = laneOf(b, prefix);
      if (l) s.add(l);
    }
    return [...s].sort();
  }, [active, prefix, showRecent]);

  // A live update can remove the selected lane. Fall back to All so the
  // hidden filter cannot strand the user on an empty screen.
  const selectedLane = lane && !lanes.includes(lane) ? null : lane;

  const inLane = React.useCallback(
    (b: Bead) => {
      if (!prefix || selectedLane === null) return true;
      const l = laneOf(b, prefix);
      return selectedLane === "" ? l === null : l === selectedLane;
    },
    [prefix, selectedLane],
  );

  const workingDetails = React.useMemo(() => {
    const convoys = new Map<string, string[]>();
    const workflows = new Map<string, string>();
    for (const b of beads) {
      if (b.issue_type === "convoy") {
        convoys.set(b.id, b.dependencies.filter(d => d.type === "tracks").map(d => d.depends_on_id));
      }
      const convoy = b.metadata?.["gc.input_convoy_id"];
      if (b.metadata?.["gc.kind"] === "workflow" && typeof convoy === "string") workflows.set(b.id, convoy);
    }
    const details = new Map<string, { text: string; claimed: number }>();
    for (const b of beads) {
      const root = b.metadata?.["gc.root_bead_id"];
      const stepId = b.metadata?.["gc.step_id"];
      if (b.status !== "in_progress" || typeof root !== "string" || typeof stepId !== "string" || !stepId.trim() || !b.assignee?.trim()) continue;
      const convoy = workflows.get(root);
      const ref = b.metadata?.["gc.step_ref"];
      const step = typeof ref === "string" && ref.trim() ? ref.trim() : stepId.trim();
      const claimedAt = b.metadata?.["gc.claimed_at"];
      const claimed = typeof claimedAt === "string" ? Date.parse(claimedAt) || 0 : 0;
      for (const id of convoys.get(convoy ?? "") ?? []) {
        if (!details.has(id) || claimed > details.get(id)!.claimed) {
          details.set(id, { text: `${b.assignee.trim()} · ${step.split(".").pop()}`, claimed });
        }
      }
    }
    return details;
  }, [beads]);

  const working = React.useMemo(
    () => active.filter(b => (b.status === "open" || b.status === "in_progress") && executionTarget(b) !== null && inLane(b))
      .sort((a, b) => a.priority - b.priority || (a.created_at || "").localeCompare(b.created_at || "") || a.id.localeCompare(b.id)),
    [active, inLane],
  );
  const workingIds = React.useMemo(() => new Set(working.map(b => b.id)), [working]);
  const inFlight = React.useMemo(
    () => active.filter((b) => (b.status === "in_progress" || b.status === "hooked") && inLane(b) && !workingIds.has(b.id)),
    [active, inLane, workingIds],
  );
  const blocked = React.useMemo(
    () => active.filter((b) => isBlocked(b, index) && inLane(b) && !workingIds.has(b.id)),
    [active, index, inLane, workingIds],
  );
  const queued = React.useMemo(
    () => active.filter((b) => b.status === "open" && !b.assignee?.trim() &&
      routedTarget(b) !== null && !isBlocked(b, index) && b.issue_type !== "epic" && inLane(b) && !workingIds.has(b.id))
      .sort((a, b) => a.priority - b.priority || (a.created_at || "").localeCompare(b.created_at || "") || a.id.localeCompare(b.id)),
    [active, index, inLane, workingIds],
  );
  const nextUp = React.useMemo(() => {
    const queuedIds = new Set(queued.map(b => b.id));
    return active.filter(
      (b) => b.status === "open" && b.priority <= 1 && !isBlocked(b, index) && inLane(b) && !queuedIds.has(b.id) && !workingIds.has(b.id),
    );
  }, [active, index, inLane, queued, workingIds]);

  const recentlyFinished = active.filter(b => b.status === "closed" && inLane(b))
    .sort((a, b) => completionTime(b) - completionTime(a) || a.id.localeCompare(b.id));
  const recentItems = showAllRecent ? recentlyFinished : recentlyFinished.slice(0, RECENT_LIMIT);
  const columns: FocusColumn[] = [
    { id: "flight", title: "In flight", hint: "in progress or hooked", items: inFlight },
    { id: "queued", title: "Queued", hint: "routed to a Gas City agent · not yet claimed", items: queued, agent: "queued" },
    { id: "working", title: "Agent working", hint: "Gas City workflow running", items: working, agent: "working" },
    { id: "blocked", title: "Blocked", hint: "waiting on a dependency or marked blocked", items: blocked },
    { id: "next", title: "Next up", hint: "ready · P0/P1", items: nextUp },
    ...(showRecent ? [{ id: "recent", title: "Recently finished", hint: "latest completions", items: recentItems }] : []),
  ];
  const groups = groupBy === "assignee" ? assigneeGroups(columns) : [];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-shrink-0 flex-wrap items-center gap-3 border-b border-border bg-[var(--surface)] p-[14px_22px]">
        <div className="mr-1 flex flex-col gap-px">
          <h1 className="m-0 text-base font-[650] tracking-[-.01em]">Focus</h1>
          <span className="text-[11.5px] text-[var(--text-3)]">
            what&rsquo;s happening now · {inFlight.length} in flight · {queued.length} queued · {working.length} agent working · {blocked.length} blocked ·{" "}
            {nextUp.length} next up
          </span>
        </div>
        <span className="flex-1" />
        <label className="flex items-center gap-2 text-[12px] text-[var(--text-2)]">
          Group by
          <select value={groupBy} onChange={e => setGroupBy(e.target.value === "assignee" ? "assignee" : "none")}
            className="h-8 rounded-[8px] border border-border bg-[var(--surface-2)] px-2 text-[var(--text)]">
            <option value="none">None</option>
            <option value="assignee">Assignee</option>
          </select>
        </label>
        <button aria-pressed={showRecent} onClick={() => { setShowRecent(!showRecent); setShowAllRecent(false); }}
          className="h-8 rounded-[8px] border border-border px-3 text-[12px] aria-pressed:border-[var(--brand)] aria-pressed:bg-[var(--brand-weak)] aria-pressed:text-[var(--brand)]">
          Recently finished
        </button>
        {prefix && lanes.length > 0 && (
          <div className="flex flex-wrap items-center gap-[6px]">
            <LaneChip label="All" selected={selectedLane === null} onClick={() => setLane(null)} />
            {lanes.map((l) => (
              <LaneChip
                key={l}
                label={l}
                selected={selectedLane === l}
                onClick={() => setLane(selectedLane === l ? null : l)}
              />
            ))}
            <LaneChip
              label="unlabeled"
              selected={selectedLane === ""}
              onClick={() => setLane(selectedLane === "" ? null : "")}
            />
          </div>
        )}
      </header>

      {showRecent && (
        <div className="flex flex-shrink-0 flex-wrap items-center gap-3 border-b border-border px-[22px] py-2 text-[12px] text-[var(--text-2)]">
          <span aria-live="polite">Showing {recentItems.length} of {recentlyFinished.length} completed beads</span>
          {recentlyFinished.length > RECENT_LIMIT && (
            <button onClick={() => setShowAllRecent(!showAllRecent)} className="rounded px-2 py-1 font-medium text-[var(--brand)] hover:bg-[var(--brand-weak)]">
              {showAllRecent ? `Show latest ${RECENT_LIMIT}` : `Show all ${recentlyFinished.length} completed`}
            </button>
          )}
          <span className="text-[var(--text-3)]">Current lane filter applies. Active and blocked work is always shown in full.</span>
        </div>
      )}
      {groupBy === "none" ? (
        <div className="bd-scroll min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-[18px_22px]">
          <div className="flex h-full min-h-0 gap-4">
            {columns.map(c => <FocusColumnView key={c.id} column={c} workingDetails={workingDetails} />)}
          </div>
        </div>
      ) : (
        <div className="bd-scroll min-h-0 flex-1 overflow-auto p-[18px_22px]">
          {groups.length === 0 ? <p className="p-4 text-[13px] text-[var(--text-3)]">No matching work. Try another lane or include recently finished work.</p> : (
            <div className="min-w-max">
              <div className="sticky top-0 z-10 mb-2 flex gap-4 bg-[var(--bg)] py-2" aria-hidden="true">
                <div className="w-[160px] shrink-0 text-[12px] font-medium text-[var(--text-3)]">Assignee</div>
                {columns.map(c => <div key={c.id} className="w-[280px] shrink-0 text-[13px] font-semibold">{c.agent && <Icon name="bot" size={14} className="mr-1 align-middle" style={{ color: agentColors(c.agent).accent }} />}{c.title} <span className="font-normal text-[var(--text-3)]">· {c.items.length}</span></div>)}
              </div>
              {groups.map(group => (
                <section key={group.key} aria-label={`Assignee: ${group.label}`} className="flex gap-4 border-t border-border py-4">
                  <div className="w-[160px] shrink-0">
                    <h2 className="break-words text-[13px] font-semibold">{group.label}</h2>
                    <p className="mt-1 text-[11px] text-[var(--text-3)]">{group.key === "none" ? "Not assigned" : "Assigned work"} · {group.columns.reduce((n, c) => n + c.items.length, 0)}</p>
                  </div>
                  {group.columns.map(c => <FocusColumnView key={c.id} column={c} workingDetails={workingDetails} grouped />)}
                </section>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FocusColumnView({ column, workingDetails, grouped = false }: { column: FocusColumn; workingDetails: Map<string, { text: string }>; grouped?: boolean }) {
  const colors = column.agent ? agentColors(column.agent) : undefined;
  return (
    <section data-focus-column={column.id} data-agent-column={column.agent} aria-label={grouped ? column.title : undefined}
      className={grouped ? "w-[280px] shrink-0" : "flex h-full min-h-0 w-[320px] shrink-0 flex-col"}>
      {!grouped && <div className="mb-2 flex flex-wrap items-baseline gap-2 px-1">
        <h2 className="m-0 text-[13px] font-[650] text-[var(--text)]">{colors && <Icon name="bot" size={14} className="mr-1 align-middle" style={{ color: colors.accent }} />}{column.title}</h2>
        <span className="text-[11px] text-[var(--text-3)]">{column.items.length} · {column.hint}</span>
      </div>}
      <div className={`rounded-[12px] border border-border bg-[var(--surface-2)] p-2 ${grouped ? "min-h-[70px]" : "bd-scroll min-h-0 flex-1 overflow-y-auto"}`}
        style={colors ? { borderColor: `color-mix(in srgb, ${colors.accent} 45%, transparent)`, background: `color-mix(in srgb, ${colors.weak} 60%, var(--surface-2))` } : undefined}>
        {column.items.length === 0 ? <div className="p-4 text-center text-[12px] text-[var(--text-3)]">Nothing here.</div> : (
          <div className="flex flex-col gap-2">{column.items.map(b => (
            <FocusCard key={b.id} bead={b} showBlockers={column.id === "blocked"} agent={column.agent}
              meta={column.agent === "queued" ? routedTarget(b) ?? undefined : column.agent === "working" ? workingDetails.get(b.id)?.text ?? executionTarget(b) ?? undefined : undefined} />
          ))}</div>
        )}
      </div>
    </section>
  );
}

function LaneChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={selected}
      onClick={onClick}
      className="rounded-full border px-[10px] py-[3px] text-[11.5px] font-[550] transition-colors"
      style={
        selected
          ? { borderColor: "var(--brand)", background: "var(--brand-weak)", color: "var(--brand)" }
          : { borderColor: "var(--border)", background: "var(--surface)", color: "var(--text-2)" }
      }
    >
      {label}
    </button>
  );
}

function FocusCard({ bead, showBlockers, meta, agent }: { bead: Bead; showBlockers?: boolean; meta?: string; agent?: FocusColumn["agent"] }) {
  const { index, openDetail, selectedBeadId, selectBead } = useApp();
  const colors = agent ? agentColors(agent) : undefined;
  const blockers = showBlockers ? blockingDeps(bead, index) : [];
  const timestamp = bead.status === "closed" ? completionDate(bead) : bead.updated_at;
  return (
    <article
      role="button"
      tabIndex={0}
      aria-label={bead.title}
      data-keyboard-bead-id={bead.id}
      aria-current={selectedBeadId === bead.id ? "true" : undefined}
      onFocus={() => selectBead(bead.id)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openDetail(bead.id);
        }
      }}
      onClick={() => {
        selectBead(bead.id);
        openDetail(bead.id);
      }}
      style={colors ? { borderLeftColor: colors.accent } : undefined}
      className={`cursor-pointer rounded-[11px] border ${colors ? "border-l-[3px]" : ""} bg-[var(--surface)] p-[10px_12px] shadow-[var(--shadow)] hover:border-[var(--border-strong)] hover:shadow-[var(--shadow-lg)] focus-visible:outline-none ${
        selectedBeadId === bead.id
          ? "border-[var(--brand)] ring-2 ring-[var(--brand)]/30"
          : "border-border"
      }`}
    >
      <div className="mb-[5px] flex items-center gap-[7px]">
        <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: catColor(bead.status) }} />
        <span className="font-mono text-[10.5px] text-[var(--text-3)]">{bead.id}</span>
        <span className="flex-1" />
        <PriorityChip p={bead.priority} />
        <Icon
          name={typeIconName(bead.issue_type)}
          size={13}
          style={{ color: typeColor(bead.issue_type) }}
        />
      </div>
      <div className="text-[12.5px] font-[550] leading-[1.35] text-[var(--text)] [text-wrap:pretty]">
        {bead.title}
      </div>
      <div className="mt-[6px] flex min-w-0 items-center gap-[8px] text-[10.5px] text-[var(--text-3)]">
        <span className="shrink-0 whitespace-nowrap" title={fmtDateTime(timestamp)}>{relTime(timestamp)}</span>
        {meta && colors && <span className="flex min-w-0 items-center gap-1 rounded-full px-2 py-0.5 font-mono" style={{ background: colors.weak, color: colors.accent }} title={meta}>
          <Icon name="bot" size={11} className="shrink-0" /><span className="min-w-0 truncate">{meta}</span>
        </span>}
        {blockers.length > 0 && (
          <span className="truncate font-mono" title={`blocked by ${blockers.join(", ")}`}>
            ⛔ {blockers.join(", ")}
          </span>
        )}
      </div>
    </article>
  );
}

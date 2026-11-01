"use client";

import * as React from "react";
import { BrainIcon, WrenchIcon } from "lucide-react";
import { DescriptionContent } from "@/components/description-content";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Message, MessageContent } from "@/components/ui/message";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace";
import { useAgentOutput } from "@/hooks/use-agent-output";
import { toEntries, type Entry } from "@/lib/agent-transcript";
import type { AgentOutputResponse } from "@/lib/api-client";
import type { AgentTurn, GascityAgent } from "@/lib/gascity-agents";

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

type TraceEntry = Exclude<Entry, { kind: "text" }>;
type EntryGroup = { kind: "text"; entry: Extract<Entry, { kind: "text" }> } | { kind: "trace"; entries: TraceEntry[] };

function groupEntries(entries: Entry[]): EntryGroup[] {
  const groups: EntryGroup[] = [];
  for (const entry of entries) {
    if (entry.kind === "text") {
      groups.push({ kind: "text", entry });
    } else {
      const last = groups[groups.length - 1];
      if (last?.kind === "trace") last.entries.push(entry);
      else groups.push({ kind: "trace", entries: [entry] });
    }
  }
  return groups;
}

function TraceEntryView({ entry }: { entry: TraceEntry }) {
  if (entry.kind === "tool" && entry.output === null) {
    return (
      <TraceLine data-testid="agent-turn" data-role="assistant" status="running" className="text-[12px] text-[var(--text-3)]">
        <TraceIcon><WrenchIcon /></TraceIcon>
        <TraceTitle>Running {entry.name}</TraceTitle>
      </TraceLine>
    );
  }

  const thought = entry.kind === "thought";
  const content = thought ? entry.text : entry.output ?? "";
  return (
    <TraceCollapsible data-testid="agent-turn" data-role="assistant">
      <TraceCollapsibleTrigger>
        <TraceLine className="text-[12px] text-[var(--text-3)]">
          <TraceIcon>{thought ? <BrainIcon /> : <WrenchIcon />}</TraceIcon>
          <TraceTitle>{thought ? "Thought" : `Ran ${entry.name}`}</TraceTitle>
          {!thought && <TraceDescription>{content ? content.split("\n").length : 0} lines</TraceDescription>}
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent className="text-[12.5px] text-[var(--text-2)]">
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono">{content}</pre>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
}

export function AgentConversation({ agent, projectId }: { agent: GascityAgent; projectId: string }) {
  const output = useAgentOutput(projectId, agent);
  const pages = output.data?.pages;
  const first = pages?.[0];
  const turns = React.useMemo(() => flattenTurns(pages), [pages]);
  const groups = React.useMemo(() => groupEntries(toEntries(turns)), [turns]);

  return (
    <div role="tabpanel" id="agent-panel-conversation" aria-labelledby="agent-tab-conversation" data-testid="agent-conversation" className="flex min-h-0 flex-1 flex-col">
      {output.isError ? (
        <div role="alert" className="p-5 text-[13px] text-destructive">{(output.error as Error).message}</div>
      ) : output.isLoading ? (
        <div className="p-5 text-[13px] text-[var(--text-3)]">Loading transcript…</div>
      ) : first && !first.configured ? (
        <div className="p-5 text-[13px] text-[var(--text-3)]">Gas City is not configured.</div>
      ) : first && !first.available ? (
        <div className="p-5 text-[13px] text-[var(--text-3)]">No transcript for this agent.</div>
      ) : (
        <>
          <div className="flex items-center gap-3 border-b border-border px-4 py-2 text-[11.5px] text-[var(--text-3)]">
            <span>Last {turns.length} turns · {first?.pagination.total ?? turns.length} messages</span>
            {output.hasNextPage && (
              <button type="button" data-testid="agent-load-older" disabled={output.isFetchingNextPage} onClick={() => void output.fetchNextPage()} className="rounded-[6px] border border-border px-2 py-[2px] text-[11.5px] text-[var(--text-2)] hover:border-[var(--brand)] hover:text-[var(--brand)] disabled:opacity-50">
                {output.isFetchingNextPage ? "Loading…" : "Load older"}
              </button>
            )}
          </div>
          {turns.length === 0 ? (
            <div className="p-4 text-[13px] text-[var(--text-3)]">No messages yet.</div>
          ) : first?.format === "text" ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <pre className="whitespace-pre-wrap break-words font-mono text-[12.5px] leading-[1.5]">{turns.map((turn) => turn.text).join("\n\n")}</pre>
            </div>
          ) : (
            <MessageScrollerProvider autoScroll>
              <MessageScroller className="min-h-0 flex-1">
                <MessageScrollerViewport>
                  <MessageScrollerContent className="gap-[11px] px-4 py-3">
                    {groups.map((group, index) => {
                      const key = group.kind === "text" ? group.entry.id : group.entries[0].id;
                      return (
                        <MessageScrollerItem key={key ?? `group-${index}`}>
                          {group.kind === "trace" ? (
                            <Trace>
                              {group.entries.map((entry, entryIndex) => <TraceEntryView key={entry.id ?? entryIndex} entry={entry} />)}
                            </Trace>
                          ) : (
                            <Message align={group.entry.role === "user" ? "end" : "start"} data-testid="agent-turn" data-role={group.entry.role}>
                              <MessageContent>
                                {group.entry.role === "user" ? (
                                  <Bubble align="end" variant="muted">
                                    <BubbleContent className="whitespace-pre-wrap text-[12.5px]">{group.entry.text}</BubbleContent>
                                  </Bubble>
                                ) : (
                                  <DescriptionContent text={group.entry.text} projectId={projectId} className="min-w-0 text-[12.5px] text-[var(--text-2)]" />
                                )}
                              </MessageContent>
                            </Message>
                          )}
                        </MessageScrollerItem>
                      );
                    })}
                  </MessageScrollerContent>
                </MessageScrollerViewport>
                <MessageScrollerButton />
              </MessageScroller>
            </MessageScrollerProvider>
          )}
        </>
      )}
    </div>
  );
}

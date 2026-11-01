import type { AgentTurn } from "@/lib/gascity-agents";

export type Entry =
  | { kind: "text"; role: string; text: string; id?: string }
  | { kind: "thought"; text: string; id?: string }
  | { kind: "tool"; name: string; output: string | null; id?: string };

/** Pair adjacent tool calls and results so each invocation has one transcript entry. */
export function toEntries(turns: AgentTurn[]): Entry[] {
  const entries: Entry[] = [];
  for (const turn of turns) {
    const trimmed = turn.text.trimStart();
    const tool = trimmed.match(/^\[([A-Za-z0-9_.:-]+)\]$/);
    if (tool && tool[1] !== "thinking" && tool[1] !== "result") {
      entries.push({ kind: "tool", name: tool[1], output: null, id: turn.id });
    } else if (trimmed.startsWith("[result]")) {
      const previous = entries[entries.length - 1];
      if (previous?.kind === "tool" && previous.output === null) {
        previous.output = trimmed.slice("[result]".length).trim();
      } else {
        entries.push({ kind: "text", role: turn.role, text: turn.text, id: turn.id });
      }
    } else if (trimmed.startsWith("[thinking]")) {
      entries.push({ kind: "thought", text: trimmed.slice("[thinking]".length).trim(), id: turn.id });
    } else {
      entries.push({ kind: "text", role: turn.role, text: turn.text, id: turn.id });
    }
  }
  return entries;
}

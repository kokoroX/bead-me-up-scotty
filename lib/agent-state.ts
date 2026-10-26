/**
 * Shared color treatment for an agent state, used by the bead drawer's agent
 * cards/badge and by the Agents view's list rows and detail header.
 */
export interface AgentStateClasses {
  dot: string;
  chip: string;
  pulse: boolean;
}

/**
 * Working agents pulse with the brand accent, waiting and idle get their own
 * amber/blue accents, suspended is a hollow dashed ring, and the rest — stopped
 * or unknown — is a plain grey dot.
 */
export function agentStateClasses(state: string): AgentStateClasses {
  if (state === "working") {
    return {
      dot: "bg-[var(--brand)]",
      chip: "border-[var(--brand)]/40 bg-[var(--brand-weak)] text-[var(--brand)]",
      pulse: true,
    };
  }
  if (state === "waiting") {
    return {
      dot: "bg-[var(--waiting)]",
      chip: "border-[var(--waiting)]/40 bg-[var(--waiting-weak)] text-[var(--waiting)]",
      pulse: false,
    };
  }
  if (state === "idle") {
    return {
      dot: "bg-[var(--idle)]",
      chip: "border-[var(--idle)]/40 bg-[var(--idle-weak)] text-[var(--idle)]",
      pulse: false,
    };
  }
  if (state === "suspended") {
    return {
      dot: "border border-dashed border-[var(--text-3)] bg-transparent",
      chip: "border-border bg-[var(--surface-2)] text-[var(--text-3)]",
      pulse: false,
    };
  }
  return {
    dot: "bg-[var(--text-3)]",
    chip: "border-border bg-[var(--surface-2)] text-[var(--text-3)]",
    pulse: false,
  };
}

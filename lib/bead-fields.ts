/**
 * Every bead field the detail drawer knows how to show, in drawer order. The
 * Settings card and the drawer's "Fields" menu both render from this list, so
 * adding a field here is the only step needed to make it toggleable.
 *
 * `defaultVisible` reproduces the drawer as it looked before fields became
 * configurable; the bd fields it never showed start hidden. Title, id, type and
 * origin are the drawer's identity and are not listed — they always show.
 */
export type DetailFieldGroup = "properties" | "content" | "relations" | "details" | "history";

export interface DetailFieldDef {
  key: string;
  label: string;
  group: DetailFieldGroup;
  defaultVisible: boolean;
}

export const DETAIL_FIELD_GROUPS: { id: DetailFieldGroup; label: string }[] = [
  { id: "properties", label: "Properties" },
  { id: "content", label: "Content" },
  { id: "relations", label: "Relations" },
  { id: "details", label: "Planning & references" },
  { id: "history", label: "History" },
];

export const DETAIL_FIELDS = [
  { key: "status", label: "Status", group: "properties", defaultVisible: true },
  { key: "priority", label: "Priority", group: "properties", defaultVisible: true },
  { key: "assignee", label: "Assignee", group: "properties", defaultVisible: true },
  { key: "parent", label: "Epic / parent", group: "properties", defaultVisible: true },
  { key: "labels", label: "Labels", group: "properties", defaultVisible: true },

  { key: "description", label: "Description", group: "content", defaultVisible: true },
  { key: "design", label: "Design", group: "content", defaultVisible: true },
  { key: "acceptance_criteria", label: "Acceptance criteria", group: "content", defaultVisible: true },
  { key: "notes", label: "Notes", group: "content", defaultVisible: true },
  { key: "close_reason", label: "Close reason", group: "content", defaultVisible: true },
  { key: "links", label: "Links & attachments", group: "content", defaultVisible: true },

  { key: "dependencies", label: "Dependencies", group: "relations", defaultVisible: true },
  { key: "subtasks", label: "Subtasks", group: "relations", defaultVisible: true },
  { key: "comments", label: "Comments", group: "relations", defaultVisible: true },

  { key: "owner", label: "Owner", group: "details", defaultVisible: false },
  { key: "due_at", label: "Due", group: "details", defaultVisible: false },
  { key: "defer_until", label: "Deferred until", group: "details", defaultVisible: false },
  { key: "estimated_minutes", label: "Estimate", group: "details", defaultVisible: false },
  { key: "external_ref", label: "External ref", group: "details", defaultVisible: false },
  { key: "spec_id", label: "Spec", group: "details", defaultVisible: false },
  { key: "metadata", label: "Metadata", group: "details", defaultVisible: false },

  { key: "created_at", label: "Created", group: "history", defaultVisible: false },
  { key: "started_at", label: "Started", group: "history", defaultVisible: false },
  { key: "updated_at", label: "Updated", group: "history", defaultVisible: false },
  { key: "closed_at", label: "Closed", group: "history", defaultVisible: false },
  { key: "activity", label: "Activity", group: "history", defaultVisible: true },
] as const satisfies readonly DetailFieldDef[];

export type DetailFieldKey = (typeof DETAIL_FIELDS)[number]["key"];

/** Resolved visibility for every field. */
export type DetailFieldVisibility = Record<DetailFieldKey, boolean>;

/**
 * Stored prefs are overrides only (`{ due_at: true }`), never a full snapshot,
 * so a field added in a later release still arrives with its own default.
 */
export type DetailFieldOverrides = Partial<Record<DetailFieldKey, boolean>>;

export function resolveDetailFields(overrides: DetailFieldOverrides): DetailFieldVisibility {
  const out = {} as DetailFieldVisibility;
  for (const f of DETAIL_FIELDS) out[f.key] = overrides[f.key] ?? f.defaultVisible;
  return out;
}

/** Drop unknown keys and non-boolean values from whatever localStorage held. */
export function parseDetailFieldOverrides(raw: unknown): DetailFieldOverrides {
  if (!raw || typeof raw !== "object") return {};
  const out: DetailFieldOverrides = {};
  for (const f of DETAIL_FIELDS) {
    const v = (raw as Record<string, unknown>)[f.key];
    if (typeof v === "boolean" && v !== f.defaultVisible) out[f.key] = v;
  }
  return out;
}

/** "90" → "1h 30m"; bd stores estimates in minutes. */
export function fmtEstimate(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** True when `iso` is a valid timestamp earlier than `now` (used for overdue due dates). */
export function isPast(iso: string | null | undefined, now: Date = new Date()): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return !Number.isNaN(t) && t < now.getTime();
}

import type { Bead } from "./schema";
import { checklistProgress } from "./beads-view";

/**
 * Closed beads are the bulk of a project's list payload but the board and list
 * only need their summary line. Strip the heavy body and keep the two derived
 * values those views render; the detail drawer fetches the full bead on demand.
 */
export function slimBeadList(beads: Bead[]): Bead[] {
  return beads.map((bead): Bead => {
    if (bead.status !== "closed") return bead;
    const commentCount = bead.comment_count ?? bead.comments?.length ?? 0;
    const checklist = checklistProgress(bead.description);
    // Partial makes the fields deletable; spreading first keeps the input intact.
    const summary: Partial<Bead> = { ...bead };
    delete summary.description;
    delete summary.notes;
    delete summary.design;
    delete summary.acceptance_criteria;
    delete summary.metadata;
    delete summary.comments;
    return {
      ...summary,
      summary_only: true,
      comment_count: commentCount,
      checklist,
    } as Bead;
  });
}

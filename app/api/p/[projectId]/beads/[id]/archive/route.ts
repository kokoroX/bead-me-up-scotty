import { getStore } from "@/lib/store";
import { closeActor } from "@/lib/config";
import { ok, fail } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ projectId: string; id: string }> }) {
  try {
    const { projectId, id } = await params;
    const store = await getStore(projectId);
    // Archiving closes the bead, so the same assignee rule applies.
    const bead = await store.archive(id, closeActor((await store.get(id))?.assignee));
    return ok(bead);
  } catch (e) {
    return fail(e);
  }
}

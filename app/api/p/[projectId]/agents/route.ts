import { getProject, ConfigError } from "@/lib/config";
import { ok, fail } from "@/lib/api";
import { fetchProjectAgents } from "@/lib/gascity";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string }> };

/** Read-only Gas City agents for a known project's rig. */
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { projectId } = await params;
    if (!getProject(projectId)) {
      throw new ConfigError(`Unknown project: ${projectId}`, "unknown_project");
    }
    try {
      return ok(await fetchProjectAgents(projectId));
    } catch (error) {
      const message = error instanceof Error ? error.message : "gascity agents request failed";
      return ok({ error: message, code: "gascity_unavailable" }, 502);
    }
  } catch (e) {
    return fail(e);
  }
}

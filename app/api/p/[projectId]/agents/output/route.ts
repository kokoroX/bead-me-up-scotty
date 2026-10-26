import { getProject, ConfigError } from "@/lib/config";
import { ok, fail } from "@/lib/api";
import { fetchAgentOutput } from "@/lib/gascity";
import { parseAgentOutputQuery } from "@/lib/gascity-agents";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ projectId: string }> };

/** Read-only transcript for one Gas City agent in a known project's rig. */
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { projectId } = await params;
    if (!getProject(projectId)) {
      throw new ConfigError(`Unknown project: ${projectId}`, "unknown_project");
    }
    const { searchParams } = new URL(req.url);
    let query;
    try {
      query = parseAgentOutputQuery({
        agent: searchParams.get("agent"),
        before: searchParams.get("before"),
        tail: searchParams.get("tail"),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid request";
      return ok({ error: message, code: "invalid_request" }, 400);
    }
    try {
      return ok(await fetchAgentOutput(projectId, query.agent, query.before, query.tail));
    } catch (error) {
      const message = error instanceof Error ? error.message : "gascity agent output request failed";
      return ok({ error: message, code: "gascity_unavailable" }, 502);
    }
  } catch (e) {
    return fail(e);
  }
}

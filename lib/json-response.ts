import { gzipSync } from "node:zlib";

/**
 * JSON response that gzips when the client accepts it. Next compresses rendered
 * pages but not Route Handler responses (echoed by `next start` too), so the
 * large project list compresses itself.
 */
export function okJson(req: Request, data: unknown, status = 200): Response {
  const body = JSON.stringify(data);
  const headers = new Headers({
    "Content-Type": "application/json",
    Vary: "Accept-Encoding",
  });
  if (!(req.headers.get("accept-encoding") ?? "").includes("gzip")) {
    return new Response(body, { status, headers });
  }
  headers.set("Content-Encoding", "gzip");
  return new Response(gzipSync(body), { status, headers });
}

"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { GascityAgent } from "@/lib/gascity-agents";

/**
 * Transcript pages for the selected agent. The first page is the newest; each
 * older page is fetched with the earliest known turn id as its cursor. Running
 * agents refresh the loaded pages every ten seconds; stopped agents never poll.
 */
export function useAgentOutput(projectId: string, agent: GascityAgent | null) {
  const name = agent?.name ?? null;
  return useInfiniteQuery({
    queryKey: ["agent-output", projectId, name],
    queryFn: ({ pageParam }) => api.agentOutput(projectId, agent!.shortName, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage, _pages, lastCursor) => {
      if (!lastPage.pagination.hasOlder) return undefined;
      const cursor = lastPage.turns[0]?.id;
      return cursor && cursor !== lastCursor ? cursor : undefined;
    },
    enabled: name !== null,
    refetchInterval: agent?.running ? 10_000 : false,
  });
}

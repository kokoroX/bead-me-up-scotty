"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

/** Poll read-only Gas City agents independently for each project. */
export function useAgents(projectId: string) {
  return useQuery({
    queryKey: ["agents", projectId],
    queryFn: () => api.agents(projectId),
    refetchInterval: 30000,
  });
}

import { useQuery } from '@tanstack/react-query';

import { flowsApi } from '@/features/flows/api/flows-api';

/**
 * Which flow a build card actually points at.
 *
 * The flow id on a build event is typed out by the model — the tool that
 * publishes the card asks it to "set flowId as soon as ap_create_flow returns
 * it" — so it is a claim, not a fact, and it is wrong often enough to matter:
 * an id from an earlier attempt, or one announced before the flow existed.
 * Following it unchecked lands on "Flow not found", which is the one thing both
 * the panel and the Open button exist to avoid.
 *
 * So the project's own list decides. The claimed id is used when it really is
 * there, and otherwise the newest flow in the project wins, which during a
 * conversation that just built one is that build. Until some flow exists this
 * returns nothing, so callers stay shut rather than offering a dead link.
 */
export function useFlowToShow(
  projectId: string | null,
  claimedFlowId: string | undefined,
): string | undefined {
  const { data } = useQuery({
    queryKey: ['chat-flow-to-show', projectId, claimedFlowId],
    enabled: projectId !== null && claimedFlowId !== undefined,
    refetchInterval: (query) => (query.state.data ? false : 2000),
    queryFn: async () => {
      const page = await flowsApi.list({
        projectId: projectId as string,
        limit: 50,
        cursor: undefined,
      });
      const flows = page.data;
      if (flows.some((flow) => flow.id === claimedFlowId)) {
        return claimedFlowId as string;
      }
      const newest = [...flows].sort((a, b) => (a.created < b.created ? 1 : -1))[0];
      return newest?.id ?? null;
    },
  });
  return data ?? undefined;
}

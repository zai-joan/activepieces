import { useQuery } from '@tanstack/react-query';
import { t } from 'i18next';
import { ExternalLink, X } from 'lucide-react';
import { ReactNode, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { chatStoreSelectors } from '@/features/chat/lib/chat-store';
import { useChatStoreContext } from '@/features/chat/lib/chat-store-context';
import { flowsApi } from '@/features/flows/api/flows-api';
import { authenticationSession } from '@/lib/authentication-session';
import { useNewWindow } from '@/lib/navigation-utils';

/**
 * Which flow to actually put on the canvas.
 *
 * The flow id on a build event is typed out by the model — the tool that
 * publishes the build card asks it to "set flowId as soon as ap_create_flow
 * returns it" — so it is a claim, not a fact, and it is wrong often enough to
 * matter: an id from an earlier attempt, or one announced before the flow was
 * created. Opening it unchecked puts "Flow not found" in front of the prospect,
 * which is the one thing this panel exists to avoid.
 *
 * So the project's own list decides. The claimed id is used when it appears
 * there, and otherwise the newest flow in the project wins, which in a demo is
 * the one being built right now. Until some flow exists we return nothing and
 * the panel stays shut, polling, because the model usually says flowId a moment
 * before there is anything to show.
 */
function useFlowToShow(
  projectId: string | null,
  claimedFlowId: string | undefined,
): string | undefined {
  const { data } = useQuery({
    queryKey: ['chat-flow-stage', projectId, claimedFlowId],
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
      const newest = [...flows].sort((a, b) =>
        a.created < b.created ? 1 : -1,
      )[0];
      return newest?.id ?? null;
    },
  });
  return data ?? undefined;
}

/**
 * The flow, beside the chat, while it is being built.
 *
 * Without this the chat only offers a link that opens the builder in another
 * tab, so the person has to leave the conversation to see what was made — and
 * in a demo that is the whole thing they came to watch. Here the canvas fills
 * in next to the words describing it.
 *
 * The canvas is the real builder, loaded in a frame on our own origin rather
 * than reimplemented. The builder is a route, not a component you can mount
 * twice, and a demo is not worth a second copy of it that drifts from the real
 * one. Same origin, so there is nothing to arrange: no tokens to pass, no
 * storage to share, and it stays in step with the product automatically.
 */
export function FlowStage({
  flowId,
  projectId,
  flowName,
  onClose,
}: {
  flowId: string;
  projectId: string;
  flowName?: string;
  onClose: () => void;
}) {
  const openNewWindow = useNewWindow();
  const path = `/projects/${projectId}/flows/${flowId}`;

  return (
    <div className="flex flex-col h-full min-h-0 border-l bg-background animate-in slide-in-from-right-2 duration-200">
      <div className="shrink-0 flex items-center gap-1.5 px-3 h-12 border-b">
        <span className="truncate text-sm font-medium">
          {flowName ?? t('Your automation')}
        </span>
        <div className="flex-1" />
        <TooltipProvider delayDuration={400}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => openNewWindow(path)}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('Open in a new tab')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('Hide')}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <iframe
        // Keyed on the flow so switching flows remounts rather than leaving the
        // previous canvas on screen while the new one loads.
        key={flowId}
        src={path}
        title={flowName ?? t('Your automation')}
        className="flex-1 min-h-0 w-full border-0"
      />
    </div>
  );
}

/**
 * Puts the chat and the flow side by side once there is a flow to show.
 *
 * Sits inside the chat store provider, because what is being built is held in
 * that store — the page outside it cannot see the build at all.
 *
 * The wrapper is always rendered, even with no flow to show, and only the right
 * hand panel comes and goes. This is not tidiness: children must keep the same
 * position in the tree. Swapping between a fragment and a wrapper div unmounts
 * the whole chat underneath, which restarts the conversation, which clears the
 * builds the panel is watching — so the panel closes, the chat remounts, and it
 * goes round again. It costs an empty flex row to stay still.
 *
 * Below a wide screen the panel drops away and the chat takes the whole width —
 * two panes on a narrow window leaves both unreadable, and the chat still offers
 * a link out to the builder.
 */
export function ChatWithFlowStage({ children }: { children: ReactNode }) {
  const liveFlow = useChatStoreContext(chatStoreSelectors.liveFlow);
  const [hiddenFor, setHiddenFor] = useState<string | null>(null);

  // The build event leaves projectId unset in practice, so fall back to the
  // session. Closing hides this flow, not the feature: if the agent goes on to
  // build another one, that one opens.
  const projectId = liveFlow?.projectId ?? authenticationSession.getProjectId();
  const flowId = useFlowToShow(projectId, liveFlow?.flowId);
  const stage =
    flowId !== undefined && projectId !== null && hiddenFor !== flowId
      ? {
          flowId,
          projectId,
          flowName: liveFlow?.flowName,
        }
      : null;

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      <div className="flex flex-col min-w-0 min-h-0 flex-1 basis-0 overflow-hidden">
        {children}
      </div>
      {stage !== null && (
        <div className="hidden lg:flex flex-col min-w-0 min-h-0 flex-[1.3] basis-0 overflow-hidden">
          <FlowStage
            flowId={stage.flowId}
            projectId={stage.projectId}
            flowName={stage.flowName}
            onClose={() => setHiddenFor(stage.flowId)}
          />
        </div>
      )}
    </div>
  );
}

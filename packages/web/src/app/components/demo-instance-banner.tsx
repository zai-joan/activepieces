import { t } from 'i18next';
import { Info } from 'lucide-react';

import { isFramed } from '@/lib/is-framed';

/**
 * A standing notice that this is a demo.
 *
 * It exists for one sentence in particular: do not connect a real account. A
 * prospect exploring a workspace that looks exactly like the product will try
 * to sign in to their own Gmail sooner or later, and on a shared demo box that
 * is somebody's live mailbox attached to an instance several people can open.
 *
 * The two links are the point of the demo, so they sit in the same line rather
 * than waiting at the end of a call.
 *
 * Shown on every page of the workspace, because this build only ever runs as a
 * demo — except inside a frame, where the workspace is the flow panel beside
 * the chat and the banner is already on screen directly above it.
 */
export function DemoInstanceBanner() {
  if (isFramed()) {
    return null;
  }

  return (
    <div className="shrink-0 flex flex-wrap items-center gap-x-1.5 gap-y-1 border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
      <Info className="h-3.5 w-3.5 shrink-0" />
      <span className="font-medium text-foreground">
        {t('This is a demo instance.')}
      </span>
      <span>{t('Please do not connect your own accounts.')}</span>
      <span className="ml-auto flex items-center gap-3">
        <a
          href="https://cloud.activepieces.com"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          {t('Start now')}
        </a>
        <a
          href="https://activepieces.com/sales"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          {t('Talk to sales')}
        </a>
      </span>
    </div>
  );
}

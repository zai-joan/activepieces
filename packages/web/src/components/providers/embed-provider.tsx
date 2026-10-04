import React, { createContext, useContext, useState } from 'react';

import { isFramed } from '@/lib/is-framed';
import { cn } from '@/lib/utils';

type EmbeddingState = {
  isEmbedded: boolean;
  hideSideNav: boolean;
  hideFlowsPageNavbar: boolean;
  disableNavigationInBuilder: boolean;
  hideFolders: boolean;
  hideTables: boolean;
  hideFlowNameInBuilder: boolean;
  hideExportAndImportFlow: boolean;
  sdkVersion?: string;
  predefinedConnectionName?: string;
  fontUrl?: string;
  fontFamily?: string;
  useDarkBackground: boolean;
  hideHomeButtonInBuilder: boolean;
  emitHomeButtonClickedEvent: boolean;
  homeButtonIcon: 'back' | 'logo';
  hideDuplicateFlow: boolean;
  hidePageHeader: boolean;
  hideActiveUsers: boolean;
  hideGlobalSearch: boolean;
  formulasDocsUrl?: string;
};

const defaultState: EmbeddingState = {
  isEmbedded: false,
  hideSideNav: false,
  hideFlowsPageNavbar: false,
  disableNavigationInBuilder: false,
  hideFolders: false,
  hideTables: false,
  hideFlowNameInBuilder: false,
  hideExportAndImportFlow: false,
  useDarkBackground: window.opener !== null,
  hideHomeButtonInBuilder: false,
  emitHomeButtonClickedEvent: false,
  homeButtonIcon: 'logo',
  hideDuplicateFlow: false,
  hidePageHeader: false,
  hideActiveUsers: false,
  hideGlobalSearch: false,
};

const EmbeddingContext = createContext<{
  embedState: EmbeddingState;
  setEmbedState: React.Dispatch<React.SetStateAction<EmbeddingState>>;
}>({
  embedState: defaultState,
  setEmbedState: () => {},
});

export const useEmbedding = () => useContext(EmbeddingContext);

type EmbeddingProviderProps = {
  children: React.ReactNode;
};

/**
 * The dashboard rendered inside a frame is never the whole product.
 *
 * The demo chat puts the flow builder in a panel beside the conversation, and
 * the builder is a route rather than a component, so the frame loads the real
 * app — rail, sidebar, header, demo banner and all. Nested inside a half-width
 * panel that reads as a broken copy of the page it is already sitting on.
 *
 * Every flag below is honoured by the real components, which is why this reuses
 * them rather than inventing a second stripped-down builder that would drift
 * from the first.
 *
 * isEmbedded is deliberately NOT set. It means more than "chrome off": it swaps
 * the browser router for a memory router, which is right for an SDK host that
 * drives navigation by postMessage and wrong here, where the whole point is for
 * the frame's URL to choose the flow. With it set, every framed route rendered
 * the default page while the address bar still read the flow. hideSideNav alone
 * takes the rail away, which is what was actually wanted.
 *
 * Read once, before the first render, so no one watches the sidebar appear and
 * then vanish. A frame cannot stop being a frame, so there is nothing to watch
 * for afterwards.
 */
function initialEmbeddingState(): EmbeddingState {
  if (!isFramed()) {
    return defaultState;
  }
  return {
    ...defaultState,
    hideSideNav: true,
    hidePageHeader: true,
    hideFlowsPageNavbar: true,
    disableNavigationInBuilder: true,
    hideHomeButtonInBuilder: true,
    hideGlobalSearch: true,
    hideActiveUsers: true,
    hideFolders: true,
    hideExportAndImportFlow: true,
    hideDuplicateFlow: true,
    // The dimming overlay is for a pop-out over the page, not a panel beside it.
    useDarkBackground: false,
  };
}

const EmbeddingProvider = ({ children }: EmbeddingProviderProps) => {
  const [state, setState] = useState<EmbeddingState>(initialEmbeddingState);

  return (
    <EmbeddingContext.Provider
      value={{ embedState: state, setEmbedState: setState }}
    >
      <div
        className={cn({
          'bg-black/80 h-screen w-screen':
            state.useDarkBackground && state.isEmbedded,
        })}
      >
        {children}
      </div>
    </EmbeddingContext.Provider>
  );
};

EmbeddingProvider.displayName = 'EmbeddingProvider';

export { EmbeddingProvider };

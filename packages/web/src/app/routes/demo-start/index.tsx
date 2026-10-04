import { t } from 'i18next';
import { ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';

type Tool = {
  name: string;
  logoUrl: string;
};

type UseCase = {
  id: string;
  title: string;
  blurb: string;
  tools: Tool[];
};

type DemoOptions = {
  company: string | null;
  logoUrl: string | null;
  useCases: UseCase[];
};

/**
 * What a prospect sees before the chat: the three things we think hurt at their
 * company, and nothing else to do but pick one.
 *
 * Choosing matters more than it looks. A demo that starts on its own is
 * something being shown to you; one you picked is your own problem being
 * solved, and people watch those differently.
 *
 * The options come from the server by token. The instructions behind each one
 * never leave the server — the browser only ever learns a title and an id.
 */
export function DemoStartPage() {
  const token = new URLSearchParams(window.location.search).get('k') ?? '';
  const [options, setOptions] = useState<DemoOptions | null>(null);
  const [failed, setFailed] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setFailed(true);
      return;
    }
    fetch(`/api/v1/demo-link/options?k=${encodeURIComponent(token)}`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(String(response.status));
        }
        return response.json();
      })
      .then(setOptions)
      .catch(() => setFailed(true));
  }, [token]);

  function choose(id: string) {
    setChosen(id);
    // A full page load, not a route change: the server mints the session and
    // seeds the conversation, then redirects into it.
    window.location.href = `/api/v1/demo-link/enter?k=${encodeURIComponent(
      token,
    )}&use=${encodeURIComponent(id)}`;
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center px-6 py-16 bg-gradient-to-b from-primary-100/40 via-background to-background">
      <div className="w-full max-w-3xl flex flex-col items-center">
        {/* Both marks, theirs first. It reads as a meeting rather than a
            pitch, and it quietly answers the question a prospect has on an
            unfamiliar page: whose software am I looking at. */}
        <div className="flex items-center gap-5 mb-10">
          {options?.logoUrl && (
            <img src={options.logoUrl} alt="" className="h-8 w-auto opacity-90" />
          )}
          {options?.logoUrl && (
            <span className="h-6 w-px bg-border" aria-hidden="true" />
          )}
          <img
            src={ACTIVEPIECES_LOGO}
            alt="Activepieces"
            className="h-7 w-auto opacity-90"
          />
        </div>

        {failed ? (
          <p className="text-muted-foreground text-center">
            {t('This link has expired. Ask for a fresh one and we will send it over.')}
          </p>
        ) : (
          <>
            <h1 className="text-center text-4xl sm:text-5xl font-semibold tracking-tight text-foreground">
              {t('What should we automate first?')}
            </h1>
            <p className="mt-4 mb-12 text-center text-base sm:text-lg text-muted-foreground max-w-xl">
              {options?.company
                ? `${t('A demo instance, set up to show what Activepieces can do for')} ${options.company}. ${t('Pick one and watch it get built.')}`
                : t('A demo instance. Pick one and watch it get built.')}
            </p>

            <div className="w-full grid gap-4">
              {(options?.useCases ?? PLACEHOLDERS).map((useCase, index) =>
                options === null ? (
                  <div
                    key={index}
                    className="h-24 rounded-2xl border bg-card animate-pulse"
                  />
                ) : (
                  <button
                    key={useCase.id}
                    type="button"
                    disabled={chosen !== null}
                    onClick={() => choose(useCase.id)}
                    className="group text-left rounded-2xl border bg-card px-6 py-5 transition
                               hover:border-primary hover:shadow-md
                               disabled:opacity-60 disabled:pointer-events-none
                               focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <div className="flex items-center gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="text-base font-medium text-foreground">
                          {useCase.title}
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {useCase.blurb}
                        </div>
                        {useCase.tools.length > 0 && (
                          <div className="mt-3 flex items-center gap-1.5">
                            {useCase.tools.map((tool) => (
                              <img
                                key={tool.name}
                                src={tool.logoUrl}
                                alt={tool.name}
                                title={tool.name}
                                loading="lazy"
                                className="h-5 w-5 rounded-[4px] object-contain"
                              />
                            ))}
                          </div>
                        )}
                      </div>
                      <ArrowRight
                        className="h-5 w-5 shrink-0 text-muted-foreground transition
                                   group-hover:translate-x-0.5 group-hover:text-primary"
                      />
                    </div>
                  </button>
                ),
              )}
            </div>

            {chosen && (
              <p className="mt-10 text-center text-sm text-muted-foreground">
                {t('Setting it up…')}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Three, because that is what every demo offers — so the page holds its shape
// while the real ones load instead of jumping when they arrive.
const PLACEHOLDERS: UseCase[] = [
  { id: '1', title: '', blurb: '', tools: [] },
  { id: '2', title: '', blurb: '', tools: [] },
  { id: '3', title: '', blurb: '', tools: [] },
];

// Ours, not the platform's: the instance is branded for the prospect, so the
// platform logo is already theirs.
const ACTIVEPIECES_LOGO = 'https://cdn.activepieces.com/brand/full-logo.png';

export default DemoStartPage;

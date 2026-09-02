/**
 * Build-time entry for the prerendered welcome panel. Bundled for Node by
 * scripts/build-home-intro-html.mjs and called once per build; its output is
 * injected into index.html by prerenderHomeIntroPlugin (vite.config.ts).
 *
 * StaticRouter gives the panel's <Link>s a router; slide 0 with no-op handlers
 * is HomeIntro's initial state, so the markup React commits on mount is the
 * same markup the browser already painted.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { HomeIntroPanel } from './HomeIntroPanel';

const noop = () => {};

export function renderHomeIntroStatic(): string {
  return renderToStaticMarkup(
    <StaticRouter location="/">
      <HomeIntroPanel active={0} runId={0} onDismiss={noop} onGoTo={noop} onJoin={noop} />
    </StaticRouter>,
  );
}

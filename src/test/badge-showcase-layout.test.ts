import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(resolve(__dirname, '../components/app/badge-showcase', p), 'utf8');
const shell = read('ShowcaseShell.tsx');
const holder = read('BadgeShowcase.tsx');
const streamer = read('StreamerShowcase.tsx');

// On phones the badge dock sits between the details and the action buttons,
// one even gap apart, with the buttons as the last row above the inset.
describe('badge showcase layout', () => {
  it('draws the phone footer after the dock, and under the details on desktop', () => {
    expect(shell.indexOf('{!isDesktop && footer ? (')).toBeGreaterThan(shell.indexOf('>{dock}</div>'));
    expect(shell).toContain('{isDesktop && footer ? <div className="mt-2">{footer(api)}</div> : null}');
    expect(shell).toContain('mb-[calc(env(safe-area-inset-bottom)+12px)] mt-3');
  });

  it("puts both showcases' buttons in the footer", () => {
    expect(holder).toContain('footer={(api) => <HolderActions api={api} />}');
    expect(streamer).toContain('footer={(api) => <StreamerActions ');
  });

  it('opens the badges chapter of the docs for the full breakdown', () => {
    expect(holder).toContain("navigate('/docs/dapps#badges')");
    expect(holder).not.toContain('/app/glossary#badges');
  });
});

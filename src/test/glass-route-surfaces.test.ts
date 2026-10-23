import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const glass = read('src/styles/glass.css');

describe('Glass route surfaces', () => {
  it('covers scheduled, ended and live Stage branches', () => {
    const stage = read('src/pages/app/StageDeepLinkPage.tsx');
    expect(stage.match(/data-stage-surface/g)).toHaveLength(3);
    expect(stage.match(/data-stage-body/g)).toHaveLength(3);
    expect(glass).toContain('[data-stage-surface]');
    expect(glass).toContain('[data-stage-body]');
  });

  it('keeps Shorts side panels and both comment layouts on the same material', () => {
    const shorts = read('src/components/app/cards/ShortsViewer.tsx');
    expect(shorts.match(/data-shorts-panel/g)).toHaveLength(4);
    expect(shorts).toContain("theme === 'glass' && !isMobile && <GlassBackground />");
    expect(glass).toContain('[data-shorts-panel]');
    expect(glass).toContain('[data-shorts-viewer] { backdrop-filter:none; }');
    expect(shorts).toContain('data-keep-dark');
  });
});

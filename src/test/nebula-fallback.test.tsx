import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { NebulaParticlesBg } from '../components/ui/nebula-particles-bg';

vi.mock('three', async importOriginal => {
  const actual = await importOriginal<typeof import('three')>();
  return { ...actual, WebGLRenderer: vi.fn(() => { throw new Error('WebGL unavailable'); }) };
});

it('keeps the page available when a browser cannot allocate WebGL', () => {
  const page = render(<main><NebulaParticlesBg /><h1>Page not found</h1></main>);
  expect(page.getByRole('heading')).toHaveTextContent('Page not found');
  expect(page.container.querySelector('canvas')).toBeNull();
  page.unmount();
});

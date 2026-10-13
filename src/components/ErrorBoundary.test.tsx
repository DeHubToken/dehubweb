import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@/i18n/copy', () => ({ translateCopy: () => '' }));
vi.mock('@/components/TranslationText', () => ({ TranslationText: () => null }));
vi.mock('lucide-react', () => ({ AlertTriangle: () => null }));
vi.mock('@/components/ui/cut-icons/refresh', () => ({ default: () => null }));
vi.mock('@/components/ui/cut-icons/home', () => ({ default: () => null }));
vi.mock('@/components/ui/button', () => ({ Button: () => null }));
vi.mock('@/lib/assistant', () => ({ ASSISTANT_AVATAR: '' }));
vi.mock('@/lib/lazy-with-retry', () => ({
  isChunkLoadError: () => true,
  recoverFromChunkError: () => 'reloading',
}));

import { ErrorBoundary } from './ErrorBoundary';

afterEach(() => vi.restoreAllMocks());

it('keeps a recovery action visible if a chunk reload never navigates', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  function BrokenPage(): React.ReactNode {
    throw new Error('Failed to fetch dynamically imported module');
  }
  render(
    <ErrorBoundary fallback={<button>Reload page</button>}>
      <BrokenPage />
    </ErrorBoundary>,
  );
  expect(screen.getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
});

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MarketingWorkspace } from './MarketingWorkspace';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('./MarketingProductImport', () => ({ MarketingProductImport: () => null }));
vi.mock('@/hooks/use-surface-draft', async () => {
  const { useState } = await import('react');
  return { useSurfaceDraft: (_field: string, initial: object) => {
    const [value, setValue] = useState(initial);
    return [value, Object.assign(setValue, { clear: () => {} })];
  } };
});
afterEach(cleanup);

describe('campaign workspace handoff', () => {
  it('reviews formats without submitting generation and opens the selected draft', () => {
    const prepare = vi.fn();
    render(<MarketingWorkspace onPrepare={prepare} />);
    const button = screen.getByRole('button', { name: 'creator.marketing.preview' });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByLabelText('creator.marketing.fields.product'), { target: { value: 'Loose tea' } });
    fireEvent.change(screen.getByLabelText('creator.marketing.fields.description'), { target: { value: 'Whole leaf tea in a reusable tin' } });
    fireEvent.change(screen.getByLabelText('creator.marketing.fields.headline'), { target: { value: 'Slow down' } });
    fireEvent.click(button);
    expect(screen.getAllByRole('article')).toHaveLength(4);
    expect(prepare).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button', { name: 'creator.marketing.open' })[3]);
    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ kind: 'video', aspect: '9:16', prompt: expect.stringContaining('Approved headline: "Slow down"') }));
    fireEvent.click(screen.getByRole('button', { name: 'creator.marketing.clear' }));
    expect(screen.queryAllByRole('article')).toHaveLength(0);
    expect(screen.getByLabelText('creator.marketing.fields.product')).toHaveValue('');
  });
});

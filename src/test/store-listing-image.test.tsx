import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { StoreListingCard } from '@/components/app/stores/StoreListingCard';

vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/hooks/use-token-prices', () => ({ useTokenPrices: () => ({ data: { DHB: 1 } }) }));
vi.mock('@/components/app/war/WarHudIcon', () => ({ ThemedIcon: () => <span data-testid="thumbnail-fallback" /> }));

it('replaces a failed listing image and tries a replacement URL', () => {
  const listing = { title: 'Coaster', images: ['/missing.png'], price: 1, stock_quantity: 2 };
  const { rerender } = render(<StoreListingCard listing={listing} onClick={() => {}} />);
  fireEvent.error(screen.getByAltText('Coaster'));
  expect(screen.queryByAltText('Coaster')).toBeNull();
  expect(screen.getByTestId('thumbnail-fallback')).toBeTruthy();
  rerender(<StoreListingCard listing={{ ...listing, images: ['/replacement.png'] }} onClick={() => {}} />);
  expect(screen.getByAltText('Coaster').getAttribute('src')).toBe('/replacement.png');
  expect(screen.queryByTestId('thumbnail-fallback')).toBeNull();
});

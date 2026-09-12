import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppSidebar } from '@/components/app/AppSidebar';
import { NAV_ITEMS } from '@/constants/app.constants';
import { NAV_LABEL_KEYS } from '@/components/app/navigation/SidebarNavItem';

const { openStage, disconnect } = vi.hoisted(() => ({ openStage: vi.fn(), disconnect: vi.fn() }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ isAuthenticated: true, disconnect }) }));
vi.mock('@/contexts/StageContext', () => ({ openStageModal: openStage }));
vi.mock('@/contexts/ThemeContext', () => ({ useAppTheme: () => ({ theme: 'dark' }) }));
vi.mock('@/hooks/use-is-desktop', () => ({ useIsDesktopViewport: () => false }));
vi.mock('@/hooks/use-search-history', () => ({ useSearchHistory: () => ({ addToHistory: vi.fn() }) }));
vi.mock('@/lib/route-preload', () => ({ preloadRoute: vi.fn() }));
vi.mock('@/lib/document-scroll', () => ({ scrollDocumentToSmooth: vi.fn() }));
vi.mock('@/components/app/war/WarHudIcon', () => ({ ThemedIcon: () => null }));
vi.mock('@/components/app/navigation/DesktopSidebar', () => ({ DesktopSidebar: () => null }));
vi.mock('@/components/app/navigation/SidebarProfileSwitcher', () => ({ SidebarProfileSwitcher: () => null }));
vi.mock('@/components/ui/liquid-glass-bubble', () => ({ LiquidGlassBubble: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button> }));
vi.mock('@/features/post/PostModal', () => ({ PostModal: ({ isOpen }: any) => isOpen ? <div>Composer open</div> : null }));
vi.mock('@/components/app/navigation/MobileHeader', () => ({
  MobileHeader: ({ isOpen, onOpenChange, children }: any) => <>
    <button onClick={() => onOpenChange(true)}>Open menu</button>
    {isOpen && <div data-testid="menu"><button onClick={() => { onOpenChange(false); onOpenChange(false); }}>Dismiss twice</button>{children}</div>}
  </>,
}));

function Harness() {
  const [open, setOpen] = useState(true);
  const location = useLocation();
  return <><output data-testid="path">{location.pathname}</output><AppSidebar isOpen={open} onOpenChange={setOpen} /></>;
}

beforeEach(() => vi.clearAllMocks());
const mount = () => render(<MemoryRouter initialEntries={['/app']}><Harness /></MemoryRouter>);

describe('mobile menu dismissal', () => {
  it.each(NAV_ITEMS.filter(item => !item.external && !item.action).map(item => [NAV_LABEL_KEYS[item.label] || item.label, item.path]))('opens %s and closes the menu', (label, path) => {
    mount();
    fireEvent.click(screen.getByText(label));
    expect(screen.getByTestId('path').textContent).toBe(path);
    expect(screen.queryByTestId('menu')).toBeNull();
  });

  it('keeps repeated close requests closed', () => {
    mount();
    fireEvent.click(screen.getByText('Dismiss twice'));
    expect(screen.queryByTestId('menu')).toBeNull();
  });

  it('closes the menu when opening the composer', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'sidebar.post' }));
    expect(screen.queryByTestId('menu')).toBeNull();
    expect(await screen.findByText('Composer open')).toBeTruthy();
  });
});

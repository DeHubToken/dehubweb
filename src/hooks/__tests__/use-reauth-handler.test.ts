import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { AuthenticationError } from '@/lib/api/dehub/core';

// Mock dependencies
const mockOpenLoginModal = vi.fn();
const mockRefreshSession = vi.fn();

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    openLoginModal: mockOpenLoginModal,
    refreshSession: mockRefreshSession,
  }),
}));

// Mock sonner toast
const mockToast = {
  error: vi.fn(),
  success: vi.fn(),
  loading: vi.fn(() => 'toast-id'),
  dismiss: vi.fn(),
};
vi.mock('sonner', () => ({ toast: mockToast }));

// Import after mocks
import { useReauthHandler } from '@/hooks/use-reauth-handler';

describe('useReauthHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns handleApiError function', () => {
    const { result } = renderHook(() => useReauthHandler());
    expect(typeof result.current.handleApiError).toBe('function');
  });

  it('shows fallback toast for non-auth errors', async () => {
    const { result } = renderHook(() => useReauthHandler());
    const handled = await result.current.handleApiError(new Error('Network fail'), 'Something went wrong');
    
    expect(handled).toBe(false);
    expect(mockToast.error).toHaveBeenCalledWith('Something went wrong');
    expect(mockRefreshSession).not.toHaveBeenCalled();
  });

  it('attempts seamless refresh on AuthenticationError', async () => {
    mockRefreshSession.mockResolvedValue(true);
    const { result } = renderHook(() => useReauthHandler());
    
    const handled = await result.current.handleApiError(
      new AuthenticationError(), 'fallback'
    );
    
    expect(handled).toBe(true);
    expect(mockRefreshSession).toHaveBeenCalledOnce();
    expect(mockToast.loading).toHaveBeenCalledWith('Refreshing session...');
    expect(mockToast.dismiss).toHaveBeenCalledWith('toast-id');
    expect(mockToast.success).toHaveBeenCalledWith('Session refreshed! Please try again.');
  });

  it('falls back to login modal when refresh fails', async () => {
    mockRefreshSession.mockResolvedValue(false);
    const { result } = renderHook(() => useReauthHandler());
    
    const handled = await result.current.handleApiError(
      new AuthenticationError(), 'fallback'
    );
    
    expect(handled).toBe(true);
    expect(mockToast.error).toHaveBeenCalledWith(
      'Session expired',
      expect.objectContaining({
        description: 'Please sign in again to continue',
        duration: 8000,
      })
    );
  });

  it('provides sign-in action in expired toast', async () => {
    mockRefreshSession.mockResolvedValue(false);
    const { result } = renderHook(() => useReauthHandler());
    
    await result.current.handleApiError(new AuthenticationError(), 'fallback');
    
    const toastCall = mockToast.error.mock.calls[0][1];
    expect(toastCall.action.label).toBe('Sign in');
    toastCall.action.onClick();
    expect(mockOpenLoginModal).toHaveBeenCalledOnce();
  });
});

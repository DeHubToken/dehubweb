import { useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AuthContext } from '@/contexts/AuthContext';
import { getAppTokensConfig, getMyAppTokens } from '@/lib/api/dehub/app-tokens';

export const APP_TOKENS_QUERY_KEY = 'app-tokens-me';

/** Whether app tokens are switched on. The server decides, for web and the app at once. */
export function useAppTokensEnabled(): boolean {
  const { data } = useQuery({
    queryKey: ['app-tokens-config'],
    queryFn: getAppTokensConfig,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return data?.enabled === true;
}

/** The signed-in account's app-token balance and latest movements. */
export function useAppTokens(enabled = true) {
  // Read without useAuth so the state gallery (no AuthProvider) can render the wallet rows.
  const auth = useContext(AuthContext);
  const isAuthenticated = !!auth?.isAuthenticated;
  const walletAddress = auth?.walletAddress;
  return useQuery({
    queryKey: [APP_TOKENS_QUERY_KEY, walletAddress?.toLowerCase()],
    queryFn: getMyAppTokens,
    enabled: enabled && isAuthenticated,
    staleTime: 15_000,
    retry: false,
  });
}

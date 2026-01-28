/**
 * Auth Context
 * ============
 * Provides Web3Auth authentication integrated with DeHub API.
 * Smart accounts are handled automatically by Web3Auth's AccountAbstractionProvider.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { 
  authenticateWallet, 
  getAccountInfo,
  getAuthToken, 
  clearAuthSession,
  isTokenExpired,
  type DeHubUser 
} from '@/lib/api/dehub';
import { initWeb3Auth, disconnectWeb3Auth, hasRedirectResult } from '@/lib/web3auth';
import { deploySmartAccount } from '@/lib/smart-account';
import type { Web3Auth } from '@web3auth/modal';
import { createWalletClient, custom } from 'viem';
import { base } from 'viem/chains';

interface AuthContextType {
  user: DeHubUser | null;
  walletAddress: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isConnecting: boolean;
  requiresUsername: boolean;
  web3auth: Web3Auth | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setRequiresUsername: (value: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function normalizeUser(userData: Partial<DeHubUser>, fallbackAddress: string): DeHubUser {
  return {
    address: userData.address || fallbackAddress,
    username: userData.username || null,
    displayName: userData.displayName || null,
    avatarImageUrl: userData.avatarImageUrl || null,
    coverImageUrl: userData.coverImageUrl || null,
    aboutMe: userData.aboutMe || null,
    followers: typeof userData.followers === 'number' ? userData.followers : 0,
    likes: typeof userData.likes === 'number' ? userData.likes : 0,
    uploads: userData.uploads ?? 0,
    sentTips: userData.sentTips ?? 0,
    receivedTips: userData.receivedTips ?? 0,
    customs: userData.customs || {},
    online: userData.online ?? true,
    createdAt: userData.createdAt,
    lastLoginTimestamp: userData.lastLoginTimestamp,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<DeHubUser | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [requiresUsername, setRequiresUsername] = useState(false);
  const [web3auth, setWeb3auth] = useState<Web3Auth | null>(null);

  const isAuthenticated = !!user && !!walletAddress && !!getAuthToken() && !isTokenExpired();

  // Check for existing session on mount and handle redirect callback
  useEffect(() => {
    const init = async () => {
      try {
        const hasRedirect = hasRedirectResult();
        const token = getAuthToken();
        const savedWallet = localStorage.getItem('dehub_wallet');

        // If we have a redirect result, we need to complete the auth flow
        if (hasRedirect) {
          console.log('[Auth] Detected redirect result, completing auth flow...');
          setIsConnecting(true);
          try {
            const web3authInstance = await initWeb3Auth();
            setWeb3auth(web3authInstance);
            
            if (web3authInstance.connected && web3authInstance.provider) {
              console.log('[Auth] Web3Auth connected after redirect, completing DeHub auth...');
              // Complete the DeHub authentication
              await completeDeHubAuth(web3authInstance);
            } else {
              console.log('[Auth] Redirect detected but not connected');
            }
          } catch (error) {
            console.error('[Auth] Redirect auth completion failed:', error);
          } finally {
            setIsConnecting(false);
          }
        } else if (token && savedWallet && !isTokenExpired()) {
          // Normal session restoration
          try {
            console.log('Restoring session, fetching account info...');
            const userData = await getAccountInfo(savedWallet);
            const normalizedUser = normalizeUser(userData, savedWallet);
            
            setUser(normalizedUser);
            setWalletAddress(savedWallet);
            localStorage.setItem('dehub_user', JSON.stringify(normalizedUser));
            
            if (!normalizedUser.username) {
              setRequiresUsername(true);
            }
          } catch (error) {
            console.error('Session restoration failed:', error);
            clearAuthSession();
            localStorage.removeItem('dehub_user');
          }
        } else if (token && isTokenExpired()) {
          console.log('Token expired, clearing session');
          clearAuthSession();
          localStorage.removeItem('dehub_user');
        }
      } catch (error) {
        console.error('Auth initialization failed:', error);
      } finally {
        setIsLoading(false);
      }

      // Pre-initialize Web3Auth in background (if not already done by redirect handling)
      if (!hasRedirectResult()) {
        initWeb3Auth()
          .then((instance) => setWeb3auth(instance))
          .catch((err) => console.warn('Web3Auth pre-init failed:', err));
      }
    };

    init();
  }, []);

  // Helper function to complete DeHub authentication after Web3Auth connects
  const completeDeHubAuth = async (web3authInstance: Web3Auth) => {
    if (!web3authInstance.provider) {
      throw new Error('No provider available');
    }

    const walletClient = createWalletClient({
      chain: base,
      transport: custom(web3authInstance.provider),
    });
    
    const [address] = await walletClient.getAddresses();
    const normalizedAddress = address.toLowerCase();
    
    console.log('[Auth] Wallet address:', normalizedAddress);

    // Create sign message for DeHub auth
    const timestamp = Math.floor(Date.now() / 1000);
    const displayedDate = new Date(timestamp * 1000);
    const message = `Welcome to DeHub!\n\nClick to log in for authentication.\nSignatures are valid for 24 hours.\nYour wallet address is ${normalizedAddress}.\nIt is ${displayedDate.toUTCString()}.`;

    const signature = await walletClient.signMessage({
      account: address,
      message,
    });

    const BASE_CHAIN_ID = 8453;

    const authResponse = await authenticateWallet(
      normalizedAddress,
      signature,
      timestamp,
      BASE_CHAIN_ID
    );

    const normalizedUser = normalizeUser(authResponse.user, normalizedAddress);

    localStorage.setItem('dehub_wallet', normalizedAddress);
    localStorage.setItem('dehub_user', JSON.stringify(normalizedUser));

    setWalletAddress(normalizedAddress);
    setUser(normalizedUser);

    if (!normalizedUser.username) {
      setRequiresUsername(true);
    }
    
    console.log('[Auth] ✓ DeHub authentication complete');
  };

  const connect = useCallback(async () => {
    console.log('[Auth] connect() called');
    console.log('[Auth] Current web3auth state:', web3auth?.status || 'null');
    setIsConnecting(true);

    try {
      // Ensure Web3Auth is initialized and ready
      let web3authInstance = web3auth;
      console.log('[Auth] Checking if web3auth needs initialization...');
      
      if (!web3authInstance || (web3authInstance.status !== "ready" && web3authInstance.status !== "connected")) {
        console.log('[Auth] Web3Auth not ready, calling initWeb3Auth()...');
        web3authInstance = await initWeb3Auth();
        console.log('[Auth] initWeb3Auth() returned, status:', web3authInstance.status);
        setWeb3auth(web3authInstance);
      } else {
        console.log('[Auth] Web3Auth already ready, status:', web3authInstance.status);
      }

      // In redirect mode, connect() will redirect to the auth provider
      // The user will be redirected back and the auth will complete in the useEffect
      console.log('[Auth] Calling web3authInstance.connect()...');
      console.log('[Auth] Instance status before connect:', web3authInstance.status);
      
      const web3authProvider = await web3authInstance.connect();
      
      // If we get here (popup mode or already connected), complete auth
      console.log('[Auth] connect() returned');
      console.log('[Auth] Provider:', web3authProvider ? 'exists' : 'null');
      
      if (!web3authProvider) {
        throw new Error('Failed to connect wallet - no provider returned');
      }

      console.log('[Auth] Web3Auth connected successfully');

      // For embedded wallets (social/email login), ensure the smart account is deployed
      let isEmbedded = false;
      try {
        const userInfo = await web3authInstance.getUserInfo();
        isEmbedded = !!userInfo?.email || !!userInfo?.name;
      } catch {
        isEmbedded = false;
      }

      if (isEmbedded) {
        console.log('[Auth] Embedded wallet detected, ensuring smart account is deployed...');
        try {
          const walletClient = createWalletClient({
            chain: base,
            transport: custom(web3authProvider),
          });
          const [address] = await walletClient.getAddresses();
          await deploySmartAccount(address);
          console.log('[Auth] Smart account ready');
        } catch (deployError) {
          console.error('[Auth] Smart account deployment failed:', deployError);
        }
      }

      // Complete DeHub authentication
      await completeDeHubAuth(web3authInstance);
      
      console.log('[Auth] ✓ Connection complete!');
    } catch (error: unknown) {
      console.error('[Auth] Connection failed:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Connection failed';
      if (errorMessage.includes('user rejected') || errorMessage.includes('User rejected')) {
        throw new Error('Log in was cancelled');
      } else if (errorMessage.includes('network') || errorMessage.includes('chain')) {
        throw new Error('Please switch to Base network and try again');
      }
      throw error;
    } finally {
      console.log('[Auth] connect() finished, setting isConnecting=false');
      setIsConnecting(false);
    }
  }, [web3auth]);

  const disconnect = useCallback(async () => {
    try {
      await disconnectWeb3Auth();
    } catch (error) {
      console.error('Web3Auth disconnect error:', error);
    }
    
    clearAuthSession();
    localStorage.removeItem('dehub_user');
    setUser(null);
    setWalletAddress(null);
    setRequiresUsername(false);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!walletAddress) return;

    if (isTokenExpired()) {
      console.log('Token expired during refresh, clearing session');
      await disconnect();
      return;
    }

    try {
      const userData = await getAccountInfo(walletAddress);
      const normalizedUser = normalizeUser(userData, walletAddress);
      
      setUser(normalizedUser);
      localStorage.setItem('dehub_user', JSON.stringify(normalizedUser));
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  }, [walletAddress, disconnect]);

  return (
    <AuthContext.Provider
      value={{
        user,
        walletAddress,
        isAuthenticated,
        isLoading,
        isConnecting,
        requiresUsername,
        web3auth,
        connect,
        disconnect,
        refreshUser,
        setRequiresUsername,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

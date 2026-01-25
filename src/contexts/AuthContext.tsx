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
import { initWeb3Auth, getWeb3Auth, disconnectWeb3Auth } from '@/lib/web3auth';
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

  // Check for existing session on mount and pre-initialize Web3Auth
  useEffect(() => {
    const init = async () => {
      try {
        const token = getAuthToken();
        const savedWallet = localStorage.getItem('dehub_wallet');

        if (token && savedWallet && !isTokenExpired()) {
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

      // Pre-initialize Web3Auth in background
      initWeb3Auth()
        .then((instance) => setWeb3auth(instance))
        .catch((err) => console.warn('Web3Auth pre-init failed:', err));
    };

    init();
  }, []);

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

      console.log('[Auth] Calling web3authInstance.connect()...');
      console.log('[Auth] Instance status before connect:', web3authInstance.status);
      console.log('[Auth] Instance connected before connect:', web3authInstance.connected);
      
      const web3authProvider = await web3authInstance.connect();
      
      console.log('[Auth] connect() returned');
      console.log('[Auth] Provider:', web3authProvider ? 'exists' : 'null');
      
      if (!web3authProvider) {
        throw new Error('Failed to connect wallet - no provider returned');
      }

      console.log('[Auth] Web3Auth connected successfully');
      console.log('[Auth] Instance status after connect:', web3authInstance.status);

      // Get the wallet address - this will be the smart account address for embedded wallets
      // or the EOA for external wallets (handled automatically by Web3Auth)
      console.log('[Auth] Creating wallet client...');
      const walletClient = createWalletClient({
        chain: base,
        transport: custom(web3authProvider),
      });
      
      console.log('[Auth] Getting addresses...');
      const [address] = await walletClient.getAddresses();
      const normalizedAddress = address.toLowerCase();
      
      console.log('[Auth] Wallet address:', normalizedAddress);

      // For embedded wallets (social/email login), ensure the smart account is deployed
      // We detect embedded wallets by checking if userInfo is available (external wallets don't have it)
      let isEmbedded = false;
      try {
        console.log('[Auth] Checking if embedded wallet (getUserInfo)...');
        const userInfo = await web3authInstance.getUserInfo();
        console.log('[Auth] UserInfo:', userInfo);
        isEmbedded = !!userInfo?.email || !!userInfo?.name;
      } catch (e) {
        // getUserInfo throws for external wallets
        console.log('[Auth] getUserInfo threw (external wallet):', e);
        isEmbedded = false;
      }

      console.log('[Auth] Is embedded wallet:', isEmbedded);

      if (isEmbedded) {
        console.log('[Auth] Embedded wallet detected, ensuring smart account is deployed...');
        try {
          await deploySmartAccount(address);
          console.log('[Auth] Smart account ready');
        } catch (deployError) {
          console.error('[Auth] Smart account deployment failed:', deployError);
          // Continue with auth - the account might deploy on first real transaction
        }
      }

      // Create sign message for DeHub auth
      console.log('[Auth] Creating sign message...');
      const timestamp = Math.floor(Date.now() / 1000);
      const displayedDate = new Date(timestamp * 1000);
      const message = `Welcome to DeHub!\n\nClick to sign in for authentication.\nSignatures are valid for 24 hours.\nYour wallet address is ${normalizedAddress}.\nIt is ${displayedDate.toUTCString()}.`;

      console.log('[Auth] Requesting signature...');
      const signature = await walletClient.signMessage({
        account: address,
        message,
      });
      console.log('[Auth] Signature obtained');

      const BASE_CHAIN_ID = 8453;

      // Authenticate with DeHub API
      console.log('[Auth] Authenticating with DeHub API...');
      const authResponse = await authenticateWallet(
        normalizedAddress,
        signature,
        timestamp,
        BASE_CHAIN_ID
      );
      console.log('[Auth] DeHub API response received');

      const normalizedUser = normalizeUser(authResponse.user, normalizedAddress);
      console.log('[Auth] User normalized:', normalizedUser.address);

      localStorage.setItem('dehub_wallet', normalizedAddress);
      localStorage.setItem('dehub_user', JSON.stringify(normalizedUser));

      setWalletAddress(normalizedAddress);
      setUser(normalizedUser);

      if (!normalizedUser.username) {
        console.log('[Auth] User has no username, setting requiresUsername');
        setRequiresUsername(true);
      }
      
      console.log('[Auth] ✓ Connection complete!');
    } catch (error: unknown) {
      console.error('[Auth] Connection failed:', error);
      console.error('[Auth] Error type:', typeof error);
      console.error('[Auth] Error name:', error instanceof Error ? error.name : 'unknown');
      console.error('[Auth] Error message:', error instanceof Error ? error.message : String(error));
      console.error('[Auth] Error stack:', error instanceof Error ? error.stack : 'no stack');
      
      const errorMessage = error instanceof Error ? error.message : 'Connection failed';
      if (errorMessage.includes('user rejected') || errorMessage.includes('User rejected')) {
        throw new Error('Sign-in was cancelled');
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

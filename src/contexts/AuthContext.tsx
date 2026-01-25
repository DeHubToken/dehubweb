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
    setIsConnecting(true);

    try {
      // Ensure Web3Auth is initialized and ready
      let web3authInstance = web3auth;
      if (!web3authInstance || (web3authInstance.status !== "ready" && web3authInstance.status !== "connected")) {
        web3authInstance = await initWeb3Auth();
        setWeb3auth(web3authInstance);
      }

      const web3authProvider = await web3authInstance.connect();
      
      if (!web3authProvider) {
        throw new Error('Failed to connect wallet');
      }

      console.log('[Auth] Web3Auth connected');

      // Get the wallet address - this will be the smart account address for embedded wallets
      // or the EOA for external wallets (handled automatically by Web3Auth)
      const walletClient = createWalletClient({
        chain: base,
        transport: custom(web3authProvider),
      });
      
      const [address] = await walletClient.getAddresses();
      const normalizedAddress = address.toLowerCase();
      
      console.log('[Auth] Wallet address:', normalizedAddress);

      // For embedded wallets (social/email login), ensure the smart account is deployed
      // We detect embedded wallets by checking if userInfo is available (external wallets don't have it)
      let isEmbedded = false;
      try {
        const userInfo = await web3authInstance.getUserInfo();
        isEmbedded = !!userInfo?.email || !!userInfo?.name;
      } catch {
        // getUserInfo throws for external wallets
        isEmbedded = false;
      }

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
      const timestamp = Math.floor(Date.now() / 1000);
      const displayedDate = new Date(timestamp * 1000);
      const message = `Welcome to DeHub!\n\nClick to sign in for authentication.\nSignatures are valid for 24 hours.\nYour wallet address is ${normalizedAddress}.\nIt is ${displayedDate.toUTCString()}.`;

      const signature = await walletClient.signMessage({
        account: address,
        message,
      });

      const BASE_CHAIN_ID = 8453;

      // Authenticate with DeHub API
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
    } catch (error: unknown) {
      console.error('Connection failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Connection failed';
      if (errorMessage.includes('user rejected') || errorMessage.includes('User rejected')) {
        throw new Error('Sign-in was cancelled');
      } else if (errorMessage.includes('network') || errorMessage.includes('chain')) {
        throw new Error('Please switch to Base network and try again');
      }
      throw error;
    } finally {
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

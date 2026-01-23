/**
 * Auth Context
 * ============
 * Provides Web3Auth authentication with Smart Accounts integrated with DeHub API.
 * Uses Pimlico paymaster for gasless transactions.
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
import { getWeb3Auth, disconnectWeb3Auth, createSmartAccount, type SmartAccountResult } from '@/lib/web3auth';
import type { Web3Auth } from '@web3auth/modal';
import { createWalletClient, custom } from 'viem';
import { base } from 'viem/chains';

interface AuthContextType {
  user: DeHubUser | null;
  walletAddress: string | null;
  smartAccountAddress: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isConnecting: boolean;
  requiresUsername: boolean;
  web3auth: Web3Auth | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  smartAccountClient: any;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setRequiresUsername: (value: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<DeHubUser | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [smartAccountAddress, setSmartAccountAddress] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [smartAccountClient, setSmartAccountClient] = useState<any>(null);
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
        const savedSmartAccount = localStorage.getItem('dehub_smart_account');

        if (token && savedWallet && !isTokenExpired()) {
          // Fetch fresh user data from API
          try {
            console.log('Restoring session, fetching account info...');
            const userData = await getAccountInfo(savedWallet);
            
            // Normalize the user data
            const normalizedUser: DeHubUser = {
              address: userData.address || savedWallet,
              username: userData.username || null,
              displayName: userData.displayName || null,
              avatarImageUrl: userData.avatarImageUrl || null,
              coverImageUrl: userData.coverImageUrl || null,
              aboutMe: userData.aboutMe || null,
              followers: typeof userData.followers === 'number' ? userData.followers : userData.followers?.length ?? 0,
              likes: typeof userData.likes === 'number' ? userData.likes : 0,
              uploads: userData.uploads ?? 0,
              sentTips: userData.sentTips ?? 0,
              receivedTips: userData.receivedTips ?? 0,
              customs: userData.customs || {},
              online: userData.online ?? true,
              createdAt: userData.createdAt,
              lastLoginTimestamp: userData.lastLoginTimestamp,
            };
            
            setUser(normalizedUser);
            setWalletAddress(savedWallet);
            if (savedSmartAccount) {
              setSmartAccountAddress(savedSmartAccount);
            }
            localStorage.setItem('dehub_user', JSON.stringify(normalizedUser));
            
            // Check if username is required
            if (!normalizedUser.username) {
              setRequiresUsername(true);
            }
          } catch (error) {
            console.error('Session restoration failed:', error);
            clearAuthSession();
            localStorage.removeItem('dehub_user');
            localStorage.removeItem('dehub_smart_account');
          }
        } else if (token && isTokenExpired()) {
          // Token expired, clear session - user will need to sign again
          console.log('Token expired, clearing session');
          clearAuthSession();
          localStorage.removeItem('dehub_user');
          localStorage.removeItem('dehub_smart_account');
        }
      } catch (error) {
        console.error('Auth initialization failed:', error);
      } finally {
        setIsLoading(false);
      }

      // Pre-initialize Web3Auth in background (non-blocking)
      getWeb3Auth()
        .then((instance) => setWeb3auth(instance))
        .catch((err) => console.warn('Web3Auth pre-init failed:', err));
    };

    init();
  }, []);

  const connect = useCallback(async () => {
    setIsConnecting(true);

    try {
      // Lazily initialize Web3Auth on first connect
      let web3authInstance = web3auth;
      if (!web3authInstance) {
        web3authInstance = await getWeb3Auth();
        setWeb3auth(web3authInstance);
      }
      // Connect via Web3Auth modal
      const web3authProvider = await web3authInstance.connect();
      
      if (!web3authProvider) {
        throw new Error('Failed to connect wallet');
      }

      console.log('[Auth] Web3Auth connected, creating smart account...');

      // Create smart account with Pimlico paymaster
      let smartAccountResult: SmartAccountResult;
      try {
        smartAccountResult = await createSmartAccount(web3authProvider);
        console.log('[Auth] Smart account created:', smartAccountResult.smartAccountAddress);
        setSmartAccountClient(smartAccountResult.smartAccountClient);
        setSmartAccountAddress(smartAccountResult.smartAccountAddress);
        localStorage.setItem('dehub_smart_account', smartAccountResult.smartAccountAddress);
      } catch (smartAccountError) {
        console.error('[Auth] Smart account creation failed, falling back to EOA:', smartAccountError);
        // Fall back to EOA if smart account creation fails
        const walletClient = createWalletClient({
          chain: base,
          transport: custom(web3authProvider),
        });
        const [eoaAddress] = await walletClient.getAddresses();
        smartAccountResult = {
          smartAccountClient: null,
          smartAccountAddress: eoaAddress.toLowerCase(),
          eoaAddress: eoaAddress.toLowerCase(),
        };
      }

      const address = smartAccountResult.eoaAddress;

      // Create sign message for DeHub auth using EOA (timestamp in epoch seconds)
      // Note: We sign with EOA but can use smart account for transactions
      const walletClient = createWalletClient({
        chain: base,
        transport: custom(web3authProvider),
      });
      
      const timestamp = Math.floor(Date.now() / 1000);
      const displayedDate = new Date(timestamp * 1000);
      const message = `Welcome to DeHub!\n\nClick to sign in for authentication.\nSignatures are valid for 24 hours.\nYour wallet address is ${address}.\nIt is ${displayedDate.toUTCString()}.`;

      // Request signature using viem
      const signature = await walletClient.signMessage({
        account: address as `0x${string}`,
        message,
      });

      const BASE_CHAIN_ID = 8453;

      // Authenticate with DeHub API
      const authResponse = await authenticateWallet(
        address,
        signature,
        timestamp,
        BASE_CHAIN_ID
      );

      // Normalize the user data from auth response
      const userData = authResponse.user;
      const normalizedUser: DeHubUser = {
        address: userData.address || address,
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

      // Save wallet address and user data
      localStorage.setItem('dehub_wallet', address);
      localStorage.setItem('dehub_user', JSON.stringify(normalizedUser));

      setWalletAddress(address);
      setUser(normalizedUser);

      // Check if username is required
      if (!normalizedUser.username) {
        setRequiresUsername(true);
      }
    } catch (error: unknown) {
      console.error('Connection failed:', error);
      // Provide user-friendly error messages
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
    localStorage.removeItem('dehub_smart_account');
    setUser(null);
    setWalletAddress(null);
    setSmartAccountAddress(null);
    setSmartAccountClient(null);
    setRequiresUsername(false);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!walletAddress) return;

    // If token is expired, user needs to re-authenticate
    if (isTokenExpired()) {
      console.log('Token expired during refresh, clearing session');
      await disconnect();
      return;
    }

    try {
      // Fetch fresh user data from API
      const userData = await getAccountInfo(walletAddress);
      
      const normalizedUser: DeHubUser = {
        address: userData.address || walletAddress,
        username: userData.username || null,
        displayName: userData.displayName || null,
        avatarImageUrl: userData.avatarImageUrl || null,
        coverImageUrl: userData.coverImageUrl || null,
        aboutMe: userData.aboutMe || null,
        followers: typeof userData.followers === 'number' ? userData.followers : userData.followers?.length ?? 0,
        likes: typeof userData.likes === 'number' ? userData.likes : 0,
        uploads: userData.uploads ?? 0,
        sentTips: userData.sentTips ?? 0,
        receivedTips: userData.receivedTips ?? 0,
        customs: userData.customs || {},
        online: userData.online ?? true,
        createdAt: userData.createdAt,
        lastLoginTimestamp: userData.lastLoginTimestamp,
      };
      
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
        smartAccountAddress,
        isAuthenticated,
        isLoading,
        isConnecting,
        requiresUsername,
        web3auth,
        smartAccountClient,
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

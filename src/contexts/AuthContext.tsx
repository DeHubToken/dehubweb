/**
 * Auth Context
 * ============
 * Provides Web3Auth authentication integrated with DeHub API.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { BrowserProvider } from 'ethers';
import { 
  authenticateWallet, 
  getAccountInfo,
  getAuthToken, 
  setAuthToken, 
  clearAuthSession,
  isTokenExpired,
  type DeHubUser 
} from '@/lib/api/dehub';
import { getWeb3Auth, disconnectWeb3Auth } from '@/lib/web3auth';
import type { Web3Auth } from '@web3auth/modal';

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
            localStorage.setItem('dehub_user', JSON.stringify(normalizedUser));
            
            // Check if username is required
            if (!normalizedUser.username) {
              setRequiresUsername(true);
            }
          } catch (error) {
            console.error('Session restoration failed:', error);
            clearAuthSession();
            localStorage.removeItem('dehub_user');
          }
        } else if (token && isTokenExpired()) {
          // Token expired, clear session - user will need to sign again
          console.log('Token expired, clearing session');
          clearAuthSession();
          localStorage.removeItem('dehub_user');
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

      // Get wallet address and signer
      const provider = new BrowserProvider(web3authProvider);
      const signer = await provider.getSigner();
      const address = (await signer.getAddress()).toLowerCase();

      // Ensure user is on Base network (chainId 8453)
      const network = await provider.getNetwork();
      const currentChainId = Number(network.chainId);
      const BASE_CHAIN_ID = 8453;

      if (currentChainId !== BASE_CHAIN_ID) {
        try {
          // Request network switch to Base
          await web3authProvider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: '0x2105' }], // 8453 in hex
          });
        } catch (switchError: unknown) {
          // If the chain hasn't been added, add it
          if ((switchError as { code?: number })?.code === 4902) {
            await web3authProvider.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: '0x2105',
                chainName: 'Base Mainnet',
                nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
                rpcUrls: ['https://mainnet.base.org'],
                blockExplorerUrls: ['https://basescan.org'],
              }],
            });
          } else {
            throw new Error('Please switch to Base network to continue');
          }
        }
      }

      // Create sign message for DeHub auth (timestamp in epoch seconds)
      const timestamp = Math.floor(Date.now() / 1000);
      const displayedDate = new Date(timestamp * 1000);
      const message = `Welcome to DeHub!\n\nClick to sign in for authentication.\nSignatures are valid for 24 hours.\nYour wallet address is ${address}.\nIt is ${displayedDate.toUTCString()}.`;

      // Request signature
      const signature = await signer.signMessage(message);

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
    setUser(null);
    setWalletAddress(null);
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

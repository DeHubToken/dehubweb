/**
 * Auth Context
 * ============
 * Provides Web3Auth authentication integrated with DeHub API.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { BrowserProvider } from 'ethers';
import { authenticateWallet, getAuthToken, setAuthToken, DeHubUser, getAccountInfo } from '@/lib/api/dehub';
import { getWeb3Auth, disconnectWeb3Auth } from '@/lib/web3auth';
import type { Web3Auth } from '@web3auth/modal';

interface AuthContextType {
  user: DeHubUser | null;
  walletAddress: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isConnecting: boolean;
  web3auth: Web3Auth | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<DeHubUser | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [web3auth, setWeb3auth] = useState<Web3Auth | null>(null);

  const isAuthenticated = !!user && !!walletAddress && !!getAuthToken();

  // Initialize Web3Auth and check for existing session
  useEffect(() => {
    const init = async () => {
      try {
        // Initialize Web3Auth
        const web3authInstance = await getWeb3Auth();
        setWeb3auth(web3authInstance);

        // Check for existing session
        const token = getAuthToken();
        const savedWallet = localStorage.getItem('dehub_wallet');

        if (token && savedWallet) {
          try {
            const userData = await getAccountInfo(savedWallet);
            setUser(userData);
            setWalletAddress(savedWallet);
          } catch (error) {
            console.error('Session restoration failed:', error);
            setAuthToken(null);
            localStorage.removeItem('dehub_wallet');
          }
        } else if (web3authInstance.connected && web3authInstance.provider) {
          // Web3Auth session exists but no DeHub token - re-authenticate
          try {
            const provider = new BrowserProvider(web3authInstance.provider);
            const signer = await provider.getSigner();
            const address = (await signer.getAddress()).toLowerCase();
            
            // Check if we have a valid DeHub token for this address
            if (!token) {
              // Need to authenticate with DeHub
              const timestamp = Date.now();
              const message = `Sign this message to authenticate with DeHub.\n\nWallet: ${address}\nTimestamp: ${timestamp}`;
              const signature = await signer.signMessage(message);
              
              const network = await provider.getNetwork();
              const chainId = Number(network.chainId);

              const { user: userData } = await authenticateWallet(
                address,
                signature,
                message,
                chainId
              );

              localStorage.setItem('dehub_wallet', address);
              setWalletAddress(address);
              setUser(userData);
            }
          } catch (error) {
            console.error('Auto-authentication failed:', error);
          }
        }
      } catch (error) {
        console.error('Web3Auth initialization failed:', error);
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, []);

  const connect = useCallback(async () => {
    if (!web3auth) {
      throw new Error('Web3Auth not initialized');
    }

    setIsConnecting(true);

    try {
      // Connect via Web3Auth modal
      const web3authProvider = await web3auth.connect();
      
      if (!web3authProvider) {
        throw new Error('Failed to connect wallet');
      }

      // Get wallet address and signer
      const provider = new BrowserProvider(web3authProvider);
      const signer = await provider.getSigner();
      const address = (await signer.getAddress()).toLowerCase();

      // Create sign message for DeHub auth
      const timestamp = Date.now();
      const message = `Sign this message to authenticate with DeHub.\n\nWallet: ${address}\nTimestamp: ${timestamp}`;

      // Request signature
      const signature = await signer.signMessage(message);

      // Get chain ID
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);

      // Authenticate with DeHub API
      const { user: userData } = await authenticateWallet(
        address,
        signature,
        message,
        chainId
      );

      // Save wallet address
      localStorage.setItem('dehub_wallet', address);

      setWalletAddress(address);
      setUser(userData);
    } catch (error) {
      console.error('Connection failed:', error);
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
    
    setAuthToken(null);
    localStorage.removeItem('dehub_wallet');
    setUser(null);
    setWalletAddress(null);
  }, []);

  const refreshUser = useCallback(async () => {
    if (!walletAddress) return;

    try {
      const userData = await getAccountInfo(walletAddress);
      setUser(userData);
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  }, [walletAddress]);

  return (
    <AuthContext.Provider
      value={{
        user,
        walletAddress,
        isAuthenticated,
        isLoading,
        isConnecting,
        web3auth,
        connect,
        disconnect,
        refreshUser,
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

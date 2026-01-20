import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { BrowserProvider } from 'ethers';
import { authenticateWallet, getAuthToken, setAuthToken, DeHubUser, getAccountInfo } from '@/lib/api/dehub';

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, callback: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, callback: (...args: unknown[]) => void) => void;
}

interface AuthContextType {
  user: DeHubUser | null;
  walletAddress: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isConnecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Check if MetaMask is available
const getEthereum = (): EthereumProvider | null => {
  if (typeof window !== 'undefined' && (window as unknown as { ethereum?: EthereumProvider }).ethereum) {
    return (window as unknown as { ethereum: EthereumProvider }).ethereum;
  }
  return null;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<DeHubUser | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);

  const isAuthenticated = !!user && !!walletAddress && !!getAuthToken();

  // Check for existing session on mount
  useEffect(() => {
    const checkExistingSession = async () => {
      const token = getAuthToken();
      const savedWallet = localStorage.getItem('dehub_wallet');
      
      if (token && savedWallet) {
        try {
          // Try to get user info with existing token
          const userData = await getAccountInfo(savedWallet);
          setUser(userData);
          setWalletAddress(savedWallet);
        } catch (error) {
          console.error('Session restoration failed:', error);
          // Clear invalid session
          setAuthToken(null);
          localStorage.removeItem('dehub_wallet');
        }
      }
      
      setIsLoading(false);
    };

    checkExistingSession();
  }, []);

  // Listen for account changes
  useEffect(() => {
    const ethereum = getEthereum();
    if (!ethereum) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        // User disconnected wallet
        disconnect();
      } else if (accounts[0] !== walletAddress) {
        // User switched accounts - re-authenticate
        disconnect();
      }
    };

    const handleChainChanged = () => {
      // Reload the page on chain change as recommended by MetaMask
      window.location.reload();
    };

    ethereum.on?.('accountsChanged', handleAccountsChanged);
    ethereum.on?.('chainChanged', handleChainChanged);

    return () => {
      ethereum.removeListener?.('accountsChanged', handleAccountsChanged);
      ethereum.removeListener?.('chainChanged', handleChainChanged);
    };
  }, [walletAddress]);

  const connect = useCallback(async () => {
    const ethereum = getEthereum();
    
    if (!ethereum) {
      throw new Error('Please install MetaMask or another Web3 wallet');
    }

    setIsConnecting(true);

    try {
      // Request accounts
      const provider = new BrowserProvider(ethereum);
      const accounts = await provider.send('eth_requestAccounts', []);
      
      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts found');
      }

      const address = accounts[0].toLowerCase();
      const signer = await provider.getSigner();
      
      // Create sign message
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
  }, []);

  const disconnect = useCallback(() => {
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

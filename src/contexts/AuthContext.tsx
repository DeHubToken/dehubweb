/**
 * Auth Context
 * ============
 * Provides Web3Auth authentication integrated with DeHub API.
 * Smart accounts are handled automatically by Web3Auth's AccountAbstractionProvider
 * with Pimlico paymaster for gasless transactions.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { 
  authenticateWallet, 
  getAccountInfo,
  getAuthToken, 
  clearAuthSession,
  isTokenExpired,
  type DeHubUser 
} from '@/lib/api/dehub';
import { initWeb3Auth, disconnectWeb3Auth } from '@/lib/web3auth';
import type { Web3Auth } from '@web3auth/modal';
import type { IProvider } from '@web3auth/modal';

interface AuthContextType {
  user: DeHubUser | null;
  walletAddress: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isConnecting: boolean;
  requiresUsername: boolean;
  needsSignature: boolean; // Web3Auth connected but signature pending
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
  const [needsSignature, setNeedsSignature] = useState(false);
  const [web3auth, setWeb3auth] = useState<Web3Auth | null>(null);

  const isAuthenticated = !!user && !!walletAddress && !!getAuthToken() && !isTokenExpired();

  // Check for existing session on mount
  useEffect(() => {
    const init = async () => {
      try {
        const token = getAuthToken();
        const savedWallet = localStorage.getItem('dehub_wallet');

        if (token && savedWallet && !isTokenExpired()) {
          // Session restoration
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

  // Helper function to complete DeHub authentication after Web3Auth connects
  // Detects EOA vs smart account and uses appropriate signing method
  const completeDeHubAuth = async (web3authInstance: Web3Auth) => {
    if (!web3authInstance.provider) {
      throw new Error('No provider available');
    }

    const provider = web3authInstance.provider as IProvider;
    
    // Get address using eth_accounts
    const accounts = await provider.request({ method: 'eth_accounts' }) as string[];
    if (!accounts || accounts.length === 0) {
      throw new Error('No accounts available');
    }
    
    const address = accounts[0];
    const normalizedAddress = address.toLowerCase();
    
    // Detect if this is social login (embedded wallet) or external wallet (EOA)
    // getUserInfo returns user data for social logins, null/empty for external wallets
    let isEmbeddedWallet = false;
    try {
      const userInfo = await web3authInstance.getUserInfo();
      // If we have user info with a verifier, it's a social/embedded login
      isEmbeddedWallet = !!(userInfo && (userInfo as Record<string, unknown>).typeOfLogin);
      console.log('[Auth] User info:', (userInfo as Record<string, unknown>)?.typeOfLogin || 'external wallet');
    } catch {
      // getUserInfo throws for external wallets
      isEmbeddedWallet = false;
    }
    
    console.log('[Auth] Wallet address:', normalizedAddress);
    console.log('[Auth] Is embedded wallet (social login):', isEmbeddedWallet);

    // Create sign message for DeHub auth
    const timestamp = Math.floor(Date.now() / 1000);
    const displayedDate = new Date(timestamp * 1000);
    const message = `Welcome to DeHub!\n\nClick to log in for authentication.\nSignatures are valid for 24 hours.\nYour wallet address is ${normalizedAddress}.\nIt is ${displayedDate.toUTCString()}.`;

    let signature: string;
    
    if (!isEmbeddedWallet) {
      // EOA path: use personal_sign with injected provider
      console.log('[Auth] Using EOA signing path');
      try {
        // Try standard param order: [message, address]
        signature = await provider.request({
          method: 'personal_sign',
          params: [message, address],
        }) as string;
      } catch {
        // Fallback: some providers expect [address, message]
        signature = await provider.request({
          method: 'personal_sign',
          params: [address, message],
        }) as string;
      }
    } else {
      // Smart account path (social login): use Web3Auth provider directly
      console.log('[Auth] Using smart account signing path');
      signature = await provider.request({
        method: 'personal_sign',
        params: [message, normalizedAddress],
      }) as string;
    }
    
    console.log('[Auth] Signature obtained, length:', signature?.length);

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
    console.log('[Auth] needsSignature:', needsSignature);
    setIsConnecting(true);

    try {
      let web3authInstance = web3auth;
      
      // If we already have a connected instance and just need signature, skip Web3Auth connect
      if (needsSignature && web3authInstance?.connected && web3authInstance?.provider) {
        console.log('[Auth] Retrying signature with existing connection...');
        await completeDeHubAuth(web3authInstance);
        setNeedsSignature(false);
        console.log('[Auth] ✓ Signature retry successful!');
        return;
      }

      // Ensure Web3Auth is initialized and ready
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
      
      const web3authProvider = await web3authInstance.connect();
      
      console.log('[Auth] connect() returned');
      console.log('[Auth] Provider:', web3authProvider ? 'exists' : 'null');
      
      if (!web3authProvider) {
        throw new Error('Failed to connect wallet - no provider returned');
      }

      console.log('[Auth] Web3Auth connected successfully');
      
      // Note: Smart account deployment is now handled automatically by
      // Web3Auth's AccountAbstractionProvider with Pimlico paymaster.
      // The first transaction will trigger deployment if needed.

      // Complete DeHub authentication (signature)
      try {
        await completeDeHubAuth(web3authInstance);
        setNeedsSignature(false);
      } catch (signError) {
        console.error('[Auth] Signature failed:', signError);
        const signErrorMessage = signError instanceof Error ? signError.message : 'Signature failed';
        
        // Check if user rejected the signature
        if (signErrorMessage.includes('user rejected') || signErrorMessage.includes('User rejected') || signErrorMessage.includes('User denied')) {
          // Keep Web3Auth connected, allow retry
          setNeedsSignature(true);
          toast.error('Please sign the message to complete login');
          return;
        }
        
        // For other errors, disconnect and fail
        await web3authInstance.logout();
        throw signError;
      }
      
      console.log('[Auth] ✓ Connection complete!');
    } catch (error: unknown) {
      console.error('[Auth] Connection failed:', error);
      
      const errorMessage = error instanceof Error ? error.message : 'Connection failed';
      let userFriendlyMessage = 'Connection failed. Please try again.';
      
      if (errorMessage.includes('user rejected') || errorMessage.includes('User rejected') || errorMessage.includes('User closed')) {
        userFriendlyMessage = 'Log in was cancelled';
      } else if (errorMessage.includes('network') || errorMessage.includes('chain')) {
        userFriendlyMessage = 'Please switch to Base network and try again';
      } else if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
        userFriendlyMessage = 'Connection timed out. Please try again.';
      } else if (errorMessage.includes('popup') || errorMessage.includes('blocked')) {
        userFriendlyMessage = 'Popup was blocked. Please allow popups and try again.';
      } else if (errorMessage.includes('bundler') || errorMessage.includes('paymaster')) {
        userFriendlyMessage = 'Account setup failed. Please try again.';
      }
      
      toast.error(userFriendlyMessage);
      throw new Error(userFriendlyMessage);
    } finally {
      console.log('[Auth] connect() finished, setting isConnecting=false');
      setIsConnecting(false);
    }
  }, [web3auth, needsSignature]);

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
    setNeedsSignature(false);
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
        needsSignature,
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

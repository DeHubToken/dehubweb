/**
 * Custom Login Modal Component
 * ============================
 * Fully branded login experience.
 * Social logins via Web3Auth, wallet connections via standard Wagmi.
 * Removed Reown AppKit to stabilize the connection experience.
 */

import React, { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useTranslation } from 'react-i18next';
import { Mail, Wallet, Loader2, ChevronRight, Smartphone } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { getWalletDeepLink, isMobileDevice, isWalletInAppBrowser } from '@/lib/web3auth';
import { WalletButton } from '@rainbow-me/rainbowkit';
import dehubLogo from '@/assets/dehub-logo-white.png';
import phantomLogo from '@/assets/phantom-logo.png';

// Social provider icons
// Social provider icons
const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.47 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
  </svg>
);

const XIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" className="fill-white">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

// Official wallet logos (same as RainbowKit uses - MetaMask, Trust)
const METAMASK_LOGO = "data:image/svg+xml,%3Csvg%20width%3D%2228%22%20height%3D%2228%22%20viewBox%3D%220%200%2028%2028%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%2228%22%20height%3D%2228%22%20fill%3D%22white%22%2F%3E%3Cpath%20d%3D%22M24.0891%203.1199L15.3446%209.61456L16.9617%205.7828L24.0891%203.1199Z%22%20fill%3D%22%23E2761B%22%20stroke%3D%22%23E2761B%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M3.90207%203.1199L12.5763%209.67608L11.0383%205.7828L3.90207%203.1199Z%22%20fill%3D%22%23E4761B%22%20stroke%3D%22%23E4761B%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M20.9429%2018.1745L18.6139%2021.7426L23.597%2023.1136L25.0295%2018.2536L20.9429%2018.1745Z%22%20fill%3D%22%23E4761B%22%20stroke%3D%22%23E4761B%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M2.97929%2018.2536L4.40301%2023.1136L9.38607%2021.7426L7.05713%2018.1745L2.97929%2018.2536Z%22%20fill%3D%22%23E4761B%22%20stroke%3D%22%23E4761B%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M9.10483%2012.1456L7.71626%2014.2461L12.6642%2014.4658L12.4884%209.14877L9.10483%2012.1456Z%22%20fill%3D%22%23E4761B%22%20stroke%3D%22%23E4761B%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M18.8864%2012.1456L15.4589%209.08725L15.3446%2014.4658L20.2837%2014.2461L18.8864%2012.1456Z%22%20fill%3D%22%23E4761B%22%20stroke%3D%22%23E4761B%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M9.38606%2021.7426L12.3566%2020.2925L9.79033%2018.2888L9.38606%2021.7426Z%22%20fill%3D%22%23E4761B%22%20stroke%3D%22%23E4761B%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M15.6347%2020.2925L18.6139%2021.7426L18.2009%2018.2888L15.6347%2020.2925Z%22%20fill%3D%22%23E4761B%22%20stroke%3D%22%23E4761B%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M18.6139%2021.7426L15.6347%2020.2925L15.8719%2022.2348L15.8456%2023.0521L18.6139%2021.7426Z%22%20fill%3D%22%23D7C1B3%22%20stroke%3D%22%23D7C1B3%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M9.38606%2021.7426L12.1544%2023.0521L12.1368%2022.2348L12.3566%2020.2925L9.38606%2021.7426Z%22%20fill%3D%22%23D7C1B3%22%20stroke%3D%22%23D7C1B3%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M12.1984%2017.0056L9.72002%2016.2762L11.4689%2015.4765L12.1984%2017.0056Z%22%20fill%3D%22%23233447%22%20stroke%3D%22%23233447%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M15.7928%2017.0056L16.5223%2015.4765L18.28%2016.2762L15.7928%2017.0056Z%22%20fill%3D%22%23233447%22%20stroke%3D%22%23233447%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M9.38606%2021.7426L9.80791%2018.1745L7.05712%2018.2536L9.38606%2021.7426Z%22%20fill%3D%22%23CD6116%22%20stroke%3D%22%23CD6116%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M18.1921%2018.1745L18.6139%2021.7426L20.9429%2018.2536L18.1921%2018.1745Z%22%20fill%3D%22%23CD6116%22%20stroke%3D%22%23CD6116%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M20.2837%2014.2461L15.3446%2014.4658L15.8016%2017.0057L16.5311%2015.4765L18.2888%2016.2762L20.2837%2014.2461Z%22%20fill%3D%22%23CD6116%22%20stroke%3D%22%23CD6116%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M9.72002%2016.2762L11.4777%2015.4765L12.1984%2017.0057L12.6642%2014.4658L7.71626%2014.2461L9.72002%2016.2762Z%22%20fill%3D%22%23CD6116%22%20stroke%3D%22%23CD6116%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M7.71626%2014.2461L9.79033%2018.2888L9.72002%2016.2762L7.71626%2014.2461Z%22%20fill%3D%22%23E4751F%22%20stroke%3D%22%23E4751F%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M18.2888%2016.2762L18.2009%2018.2888L20.2837%2014.2461L18.2888%2016.2762Z%22%20fill%3D%22%23E4751F%22%20stroke%3D%22%23E4751F%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M12.6642%2014.4658L12.1984%2017.0057L12.7784%2020.0025L12.9102%2016.0565L12.6642%2014.4658Z%22%20fill%3D%22%23E4751F%22%20stroke%3D%22%23E4751F%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M15.3446%2014.4658L15.1073%2016.0477L15.2128%2020.0025L15.8016%2017.0057L15.3446%2014.4658Z%22%20fill%3D%22%23E4751F%22%20stroke%3D%22%23E4751F%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M15.8016%2017.0056L15.2128%2020.0025L15.6347%2020.2925L18.2009%2018.2888L18.2888%2016.2762L15.8016%2017.0056Z%22%20fill%3D%22%23F6851B%22%20stroke%3D%22%23F6851B%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M9.72002%2016.2762L9.79033%2018.2888L12.3566%2020.2925L12.7784%2020.0025L12.1984%2017.0056L9.72002%2016.2762Z%22%20fill%3D%22%23F6851B%22%20stroke%3D%22%23F6851B%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M15.8456%2023.0521L15.8719%2022.2348L15.6522%2022.0414H12.339L12.1368%2022.2348L12.1544%2023.0521L9.38606%2021.7426L10.3528%2022.5336L12.3126%2023.8958H15.6786L17.6472%2022.5336L18.6139%2021.7426L15.8456%2023.0521Z%22%20fill%3D%22%23C0AD9E%22%20stroke%3D%22%23C0AD9E%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M15.6347%2020.2925L15.2128%2020.0025H12.7784L12.3566%2020.2925L12.1368%2022.2348L12.339%2022.0414H15.6522L15.8719%2022.2348L15.6347%2020.2925Z%22%20fill%3D%22%23161616%22%20stroke%3D%22%23161616%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M24.4583%2010.0364L25.2053%206.45072L24.0891%203.1199L15.6347%209.39485L18.8864%2012.1456L23.4827%2013.4903L24.5022%2012.3038L24.0628%2011.9874L24.7658%2011.3459L24.221%2010.924L24.924%2010.3879L24.4583%2010.0364Z%22%20fill%3D%22%23763D16%22%20stroke%3D%22%23763D16%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M2.79472%206.45072L3.54174%2010.0364L3.06717%2010.3879L3.77024%2010.924L3.23415%2011.3459L3.93722%2011.9874L3.4978%2012.3038L4.50847%2013.4903L9.10483%2012.1456L12.3566%209.39485L3.90207%203.1199L2.79472%206.45072Z%22%20fill%3D%22%23763D16%22%20stroke%3D%22%23763D16%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M23.4827%2013.4903L18.8864%2012.1456L20.2837%2014.2461L18.2009%2018.2888L20.9429%2018.2536H25.0295L23.4827%2013.4903Z%22%20fill%3D%22%23F6851B%22%20stroke%3D%22%23F6851B%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M9.10484%2012.1456L4.50848%2013.4903L2.97929%2018.2536H7.05713L9.79033%2018.2888L7.71626%2014.2461L9.10484%2012.1456Z%22%20fill%3D%22%23F6851B%22%20stroke%3D%22%23F6851B%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M15.3446%2014.4658L15.6347%209.39485L16.9705%205.7828H11.0383L12.3566%209.39485L12.6642%2014.4658L12.7696%2016.0653L12.7784%2020.0025H15.2128L15.2304%2016.0653L15.3446%2014.4658Z%22%20fill%3D%22%23F6851B%22%20stroke%3D%22%23F6851B%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E";
const TRUST_LOGO = "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20width%3D%2228%22%20height%3D%2228%22%20viewBox%3D%220%200%2028%2028%22%3E%3Cpath%20fill%3D%22%23fff%22%20d%3D%22M0%200h28v28H0z%22%2F%3E%3Cpath%20fill%3D%22%230500FF%22%20d%3D%22M6%207.583%2013.53%205v17.882C8.15%2020.498%206%2015.928%206%2013.345V7.583Z%22%2F%3E%3Cpath%20fill%3D%22url(%23a)%22%20d%3D%22M22%207.583%2013.53%205v17.882c6.05-2.384%208.47-6.954%208.47-9.537V7.583Z%22%2F%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22a%22%20x1%3D%2219.768%22%20x2%3D%2214.072%22%20y1%3D%223.753%22%20y2%3D%2222.853%22%20gradientUnits%3D%22userSpaceOnUse%22%3E%3Cstop%20offset%3D%22.02%22%20stop-color%3D%22%2300F%22%2F%3E%3Cstop%20offset%3D%22.08%22%20stop-color%3D%22%230094FF%22%2F%3E%3Cstop%20offset%3D%22.16%22%20stop-color%3D%22%2348FF91%22%2F%3E%3Cstop%20offset%3D%22.42%22%20stop-color%3D%22%230094FF%22%2F%3E%3Cstop%20offset%3D%22.68%22%20stop-color%3D%22%230038FF%22%2F%3E%3Cstop%20offset%3D%22.9%22%20stop-color%3D%22%230500FF%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3C%2Fsvg%3E";

const MetaMaskIcon = () => (
  <img src={METAMASK_LOGO} width="20" height="20" alt="MetaMask" className="rounded-full object-contain" />
);


interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type LoginStep = 'main' | 'email' | 'sms' | 'wallets';

export function LoginModal({ open, onOpenChange }: LoginModalProps) {
  const { connectWithProvider, connectWithEmail, connectWithSMS, connectWithWallet, setWagmiAuthIntent, isConnecting } = useAuth();
  const { isConnected: isWagmiAlreadyConnected, address: wagmiCurrentAddress } = useAccount();
  const { t } = useTranslation();
  const [step, setStep] = useState<LoginStep>('main');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [emailError, setEmailError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const handleClose = () => {
    setStep('main');
    setEmail('');
    setPhone('');
    setEmailError('');
    setPhoneError('');
    setActiveProvider(null);
    onOpenChange(false);
  };

  const handleSocialLogin = async (provider: 'google' | 'twitter' | 'discord') => {
    setActiveProvider(provider);
    try {
      await connectWithProvider(provider);
      handleClose();
    } catch (error) {
      console.error(`${provider} login failed:`, error);
      setActiveProvider(null);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError('');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setEmailError(t('loginModal.invalidEmail'));
      return;
    }

    setActiveProvider('email');
    try {
      await connectWithEmail(email);
      handleClose();
    } catch (error) {
      console.error('Email login failed:', error);
      setActiveProvider(null);
    }
  };

  const handleSMSSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneError('');

    const phoneRegex = /^\+?[1-9]\d{6,14}$/;
    const cleanedPhone = phone.replace(/[\s\-()]/g, '');
    if (!phoneRegex.test(cleanedPhone)) {
      setPhoneError(t('loginModal.invalidPhone'));
      return;
    }

    setActiveProvider('sms');
    try {
      await connectWithSMS(cleanedPhone);
      handleClose();
    } catch (error) {
      console.error('SMS login failed:', error);
      setActiveProvider(null);
    }
  };

  type WalletId = 'metamask' | 'phantom' | 'trust';
  const handleWalletConnect = (wallet: WalletId, connect: () => void) => {
    setActiveProvider(wallet);
    setWagmiAuthIntent(true);

    // If wagmi is already connected (kept alive from a previous session with an expired token),
    // don't call connect() again — the wagmiAuthIntentState change causes handleWagmiConnect
    // to re-fire and pick up the existing connection to complete DeHub auth.
    if (isWagmiAlreadyConnected && wagmiCurrentAddress) {
      return;
    }

    // Mobile: Use deep link to open wallet app and load dapp in its in-app browser.
    if (isMobileDevice() && !isWalletInAppBrowser()) {
      const deepLink = getWalletDeepLink(wallet);
      if (deepLink) {
        window.location.href = deepLink;
        return;
      }
    }

    // Use connectWithWallet (wagmi connectAsync) instead of RainbowKit's connect()
    // because RainbowKit's connect can become stale after a disconnect cycle.
    connectWithWallet(wallet as any);
  };

  const renderMainStep = () => (
    <div className="space-y-4">
      <div className="space-y-3">
        <Button
          onClick={() => setStep('email')}
          disabled={isConnecting}
          className="w-full h-12 bg-white/10 hover:bg-white/15 text-white rounded-xl flex items-center justify-center gap-3 border border-white/10"
        >
          <Mail className="w-5 h-5" />
          <span>{t('loginModal.continueEmail')}</span>
        </Button>

        <Button
          onClick={() => setStep('sms')}
          disabled={isConnecting}
          className="w-full h-12 bg-white/10 hover:bg-white/15 text-white rounded-xl flex items-center justify-center gap-3 border border-white/10"
        >
          <Smartphone className="w-5 h-5" />
          <span>{t('loginModal.continueSMS')}</span>
        </Button>

        <Button
          onClick={() => handleSocialLogin('google')}
          disabled={isConnecting}
          className="w-full h-12 bg-white/10 hover:bg-white/15 text-white rounded-xl flex items-center justify-center gap-3 border border-white/10"
        >
          {activeProvider === 'google' ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <GoogleIcon />
          )}
          <span>{t('loginModal.continueGoogle')}</span>
        </Button>

        <Button
          onClick={() => handleSocialLogin('twitter')}
          disabled={isConnecting}
          className="w-full h-12 bg-white/10 hover:bg-white/15 text-white rounded-xl flex items-center justify-center gap-3 border border-white/10"
        >
          {activeProvider === 'twitter' ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <XIcon />
          )}
          <span>{t('loginModal.continueX')}</span>
        </Button>

        <Button
          onClick={() => handleSocialLogin('discord')}
          disabled={isConnecting}
          className="w-full h-12 bg-white/10 hover:bg-white/15 text-white rounded-xl flex items-center justify-center gap-3 border border-white/10"
        >
          {activeProvider === 'discord' ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" className="fill-[#5865F2]">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
            </svg>
          )}
          <span>{t('loginModal.continueDiscord', 'Continue with Discord')}</span>
        </Button>
      </div>

      <div className="flex items-center gap-3 py-2">
        <Separator className="flex-1 bg-white/10" />
        <span className="text-white/40 text-sm">{t('loginModal.or')}</span>
        <Separator className="flex-1 bg-white/10" />
      </div>

      <Button
        onClick={() => setStep('wallets')}
        disabled={isConnecting}
        variant="outline"
        className="w-full h-12 bg-transparent hover:bg-white/5 text-white rounded-xl flex items-center justify-center gap-3 border-white/10"
      >
        <Wallet className="w-5 h-5" />
        <span>{t('loginModal.connectWallet')}</span>
      </Button>
    </div>
  );
  
  const PhantomIcon = () => (
    <img src={phantomLogo} width="20" height="20" alt="Phantom" className="rounded-full object-cover" />
  );

  const TrustIcon = () => (
    <img src={TRUST_LOGO} width="20" height="20" alt="Trust Wallet" className="rounded-full object-contain" />
  );

  const WalletConnectIcon = () => (
    <svg width="20" height="20" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="28" height="28" rx="14" fill="#3B99FC"/>
      <path d="M8.18 11.3C11.4 8.1 16.6 8.1 19.82 11.3l.4.39c.16.16.16.42 0 .58l-1.26 1.24a.21.21 0 01-.29 0l-.55-.54a5.58 5.58 0 00-7.8 0l-.59.58a.21.21 0 01-.29 0L8.2 11.88a.41.41 0 010-.58zm11.8 2.54 1.12 1.1c.16.16.16.42 0 .58l-5.08 4.98a.42.42 0 01-.58 0L12 17.06a.1.1 0 00-.15 0l-3.46 3.44a.42.42 0 01-.58 0L2.74 15.52a.41.41 0 010-.58l1.12-1.1c.16-.16.42-.16.58 0l3.46 3.44c.04.04.11.04.15 0l3.46-3.44c.16-.16.42-.16.58 0l3.46 3.44c.04.04.11.04.15 0l3.46-3.44c.16-.16.42-.16.58 0z" fill="white"/>
    </svg>
  );

  const walletButtonClass = "w-full h-12 bg-white/10 hover:bg-white/15 text-white rounded-xl flex items-center justify-start gap-3 border border-white/10 px-4";

  const renderWalletsStep = () => (
    <div className="space-y-3">
      <WalletButton.Custom wallet="metamask">
        {({ ready, connect }) => (
          <Button
            disabled={isConnecting}
            onClick={() => handleWalletConnect('metamask', connect)}
            className={walletButtonClass}
          >
            {activeProvider === 'metamask' && isConnecting ? (
              <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
            ) : (
              <div className="flex-shrink-0"><MetaMaskIcon /></div>
            )}
            <span className="flex-1 text-left">MetaMask</span>
            <ChevronRight className="w-4 h-4 text-white/40" />
          </Button>
        )}
      </WalletButton.Custom>

      <WalletButton.Custom wallet="phantom">
        {({ ready, connect }) => (
          <Button
            disabled={isConnecting}
            onClick={() => handleWalletConnect('phantom', connect)}
            className={walletButtonClass}
          >
            {activeProvider === 'phantom' && isConnecting ? (
              <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
            ) : (
              <div className="flex-shrink-0"><PhantomIcon /></div>
            )}
            <span className="flex-1 text-left">Phantom</span>
            <ChevronRight className="w-4 h-4 text-white/40" />
          </Button>
        )}
      </WalletButton.Custom>

      <WalletButton.Custom wallet={isMobileDevice() && !isWalletInAppBrowser() ? "walletconnect" : "trust"}>
        {({ ready, connect }) => (
          <Button
            disabled={isConnecting}
            onClick={() => handleWalletConnect('trust', connect)}
            className={walletButtonClass}
          >
            {activeProvider === 'trust' && isConnecting ? (
              <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
            ) : (
              <div className="flex-shrink-0"><TrustIcon /></div>
            )}
            <span className="flex-1 text-left">Trust Wallet</span>
            <ChevronRight className="w-4 h-4 text-white/40" />
          </Button>
        )}
      </WalletButton.Custom>

      <WalletButton.Custom wallet="walletconnect">
        {({ connect }) => (
          <Button
            disabled={isConnecting}
            onClick={() => {
              setActiveProvider('walletconnect');
              setWagmiAuthIntent(true);
              connect();
            }}
            className={walletButtonClass}
          >
            {activeProvider === 'walletconnect' && isConnecting ? (
              <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
            ) : (
              <div className="flex-shrink-0"><WalletConnectIcon /></div>
            )}
            <span className="flex-1 text-left">WalletConnect</span>
            <ChevronRight className="w-4 h-4 text-white/40" />
          </Button>
        )}
      </WalletButton.Custom>

      <p className="text-white/40 text-[10px] text-center mt-2 px-2">
        {isMobileDevice()
          ? t('loginModal.walletInfoMobile')
          : t('loginModal.walletInfoDesktop')}
      </p>
    </div>
  );


  const renderEmailStep = () => (
    <div className="space-y-4">
      <form onSubmit={handleEmailSubmit} className="space-y-4">
        <div className="space-y-2">
          <Input
            type="email"
            placeholder={t('loginModal.emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isConnecting}
            className="h-12 bg-white/10 border-white/10 text-white placeholder:text-white/40 rounded-xl"
            autoFocus
          />
          {emailError && (
            <p className="text-red-400 text-sm">{emailError}</p>
          )}
        </div>

        <Button
          type="submit"
          disabled={isConnecting || !email}
          className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
        >
          {activeProvider === 'email' ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('loginModal.sendingLink')}
            </span>
          ) : (
            t('loginModal.continue')
          )}
        </Button>

        <p className="text-white/40 text-xs text-center">
          {t('loginModal.magicLinkInfo')}
        </p>
      </form>
    </div>
  );

  const renderSMSStep = () => (
    <div className="space-y-4">
      <form onSubmit={handleSMSSubmit} className="space-y-4">
        <div className="space-y-2">
          <Input
            type="tel"
            placeholder="+1 234 567 8900"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={isConnecting}
            className="h-12 bg-white/10 border-white/10 text-white placeholder:text-white/40 rounded-xl"
            autoFocus
          />
          {phoneError && (
            <p className="text-red-400 text-sm">{phoneError}</p>
          )}
        </div>

        <Button
          type="submit"
          disabled={isConnecting || !phone}
          className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
        >
          {activeProvider === 'sms' ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('loginModal.sendingCode')}
            </span>
          ) : (
            t('loginModal.continue')
          )}
        </Button>

        <p className="text-white/40 text-xs text-center">
          {t('loginModal.smsInfo')}
        </p>
      </form>
    </div>
  );

  const headerContent = (
    <>
      <div className="flex items-center justify-center relative">
        {step !== 'main' && (
          <button
            onClick={() => setStep('main')}
            className="absolute left-0 p-2 rounded-xl hover:bg-white/10 transition-colors text-white/60 hover:text-white"
          >
            <ChevronRight className="w-5 h-5 rotate-180" />
          </button>
        )}
        <img src={dehubLogo} alt="DeHub" className="h-8" />
      </div>
    </>
  );

  const titleText = step === 'main' ? t('loginModal.title')
    : step === 'email' ? t('loginModal.continueEmail')
    : step === 'sms' ? t('loginModal.continueSMS')
    : t('loginModal.connectWallet');

  const bodyContent = (
    <>
      <div className="px-6 pb-6">
        {step === 'main' && renderMainStep()}
        {step === 'email' && renderEmailStep()}
        {step === 'sms' && renderSMSStep()}
        {step === 'wallets' && renderWalletsStep()}
      </div>
      <div className="px-6 py-4 bg-black/20 border-t border-white/10">
        <p className="text-xs text-white/40 text-center">
          By continuing, you agree to our{' '}
          <a href="https://dehub.io/terms" target="_blank" rel="noopener noreferrer" className="underline hover:text-white/60 transition-colors">
            Terms
          </a>
          {' and '}
          <a href="https://dehub.io/privacy" target="_blank" rel="noopener noreferrer" className="underline hover:text-white/60 transition-colors">
            Privacy Policy
          </a>
        </p>
      </div>
    </>
  );

  // Both mobile and desktop use the same bottom-sheet Drawer. On desktop the
  // overlay and sheet are clipped to the middle panel's live bounds
  // (--app-main-left/--app-main-width, measured in AppLayout) so it opens as
  // a drawer in the gap between the sidebars instead of spanning the full
  // viewport. Falls back to full-viewport when those vars are unset (e.g.
  // routes without the app shell/sidebars).
  return (
    <Drawer open={open} onOpenChange={handleClose}>
      <DrawerContent
        data-login-modal
        hideHandle
        className={cn(
          "bg-black/60 backdrop-blur-2xl saturate-[180%] border border-white/10 border-b-0 p-0 gap-0 rounded-t-2xl overflow-hidden z-[200]",
          !isMobile && "left-[var(--app-main-left,0px)] right-auto w-[var(--app-main-width,100vw)]",
        )}
        overlayClassName={cn(
          "z-[200] login-modal-overlay",
          !isMobile && "bg-black/40 backdrop-blur-xl inset-y-0 left-[var(--app-main-left,0px)] w-[var(--app-main-width,100vw)] right-auto",
        )}
      >
        <DrawerHeader className="px-6 pt-6 pb-4">
          {headerContent}
          <DrawerTitle className="text-base font-medium text-white mt-4 text-center">
            {titleText}
          </DrawerTitle>
        </DrawerHeader>
        {bodyContent}
      </DrawerContent>
    </Drawer>
  );
}

export default LoginModal;

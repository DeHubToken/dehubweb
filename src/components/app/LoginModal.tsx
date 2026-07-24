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
import { Mail, Phone, Wallet, Loader2, ChevronRight } from 'lucide-react';
import { WalletCreateStep } from '@/components/app/wallet-setup/WalletCreateStep';
import { WalletUnlockStep } from '@/components/app/wallet-setup/WalletUnlockStep';
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

const AppleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" className="fill-white">
    <path d="M17.05 12.536c-.03-2.087 1.706-3.087 1.783-3.14-.972-1.42-2.484-1.615-3.025-1.638-1.372-.14-2.635.797-3.318.797-.699 0-1.767-.777-2.9-.757-1.49.023-2.865.866-3.626 2.2-1.548 2.685-.397 6.86.98 9.11.677 1.106 1.487 2.346 2.55 2.3.994-.038 1.386-.647 2.6-.647 1.21 0 1.567.647 2.62.63 1.08-.018 1.766-.976 2.44-2.083.775-1.253 1.09-2.487 1.109-2.552-.024-.01-2.19-.844-2.213-3.22zM14.85 5.865c.564-.68.945-1.63.842-2.573-.812.033-1.798.542-2.383 1.222-.522.6-.98 1.567-.857 2.492.902.07 1.827-.457 2.398-1.14z"/>
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

type LoginStep = 'main' | 'email' | 'email-waiting' | 'phone' | 'phone-code' | 'wallets' | 'wallet-create' | 'wallet-unlock';

export function LoginModal({ open, onOpenChange }: LoginModalProps) {
  const {
    connectWithProvider, connectWithEmail, cancelEmailMagicLink, connectWithSMS, verifyPhoneOtp,
    connectWithWallet, completeSmartWalletLogin, setWagmiAuthIntent, isConnecting,
    walletPhase, supabaseUserId,
  } = useAuth();
  const { isConnected: isWagmiAlreadyConnected, address: wagmiCurrentAddress } = useAccount();
  const { t } = useTranslation();
  const [step, setStep] = useState<LoginStep>('main');
  const [email, setEmail] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [emailError, setEmailError] = useState('');
  const [phone, setPhone] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Route to the wallet create/unlock step once the Supabase identity exists
  // (after email OTP verification or an OAuth redirect return).
  useEffect(() => {
    if (!open) return;
    if (walletPhase === 'create') setStep('wallet-create');
    else if (walletPhase === 'unlock') setStep('wallet-unlock');
  }, [open, walletPhase]);

  const handleClose = () => {
    setStep('main');
    setEmail('');
    setEmailCode('');
    setEmailError('');
    setPhone('');
    setPhoneCode('');
    setPhoneError('');
    setActiveProvider(null);
    onOpenChange(false);
  };

  const handleSocialLogin = async (provider: 'google' | 'apple') => {
    setActiveProvider(provider);
    try {
      // Full-page OAuth redirect — the modal reopens at the wallet step on return.
      await connectWithProvider(provider);
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
      setStep('email-waiting');
    } catch (error) {
      console.error('Email login failed:', error);
    } finally {
      setActiveProvider(null);
    }
  };


  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneError('');

    const e164Regex = /^\+[1-9]\d{6,14}$/;
    if (!e164Regex.test(phone.trim())) {
      setPhoneError(t('loginModal.invalidPhone', 'Enter your number with country code, e.g. +14155552671'));
      return;
    }

    setActiveProvider('phone');
    try {
      await connectWithSMS(phone.trim());
      setStep('phone-code');
    } catch (error) {
      console.error('Phone login failed:', error);
    } finally {
      setActiveProvider(null);
    }
  };

  const handlePhoneCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhoneError('');
    if (!/^\d{6}$/.test(phoneCode.trim())) {
      setPhoneError(t('loginModal.invalidCode', 'Enter the 6-digit code from your email'));
      return;
    }
    setActiveProvider('phone');
    try {
      await verifyPhoneOtp(phone.trim(), phoneCode);
    } catch (error: any) {
      console.error('Phone OTP verification failed:', error);
      setPhoneError(error?.message || 'Invalid code. Please try again.');
    } finally {
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
    // connectWithWallet resolves to false (never rejects — it catches its own
    // errors and shows its own toast) on failure, so reset our local spinner
    // state here — without this, activeProvider stays stuck on this wallet
    // until the next click, since nothing else in this component learns the
    // attempt failed.
    connectWithWallet(wallet as any).then((success) => {
      if (!success) setActiveProvider(null);
    });
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
          disabled
          className="w-full h-12 bg-white/5 text-white/40 rounded-xl flex items-center justify-center gap-3 border border-white/10 cursor-not-allowed"
        >
          <Phone className="w-5 h-5" />
          <span>{t('loginModal.continuePhone', 'Continue with phone')}</span>
          <span className="text-[10px] uppercase tracking-wide bg-white/10 text-white/50 rounded-full px-2 py-0.5">
            {t('loginModal.comingSoon', 'Coming soon')}
          </span>
        </Button>

        <Button
          disabled
          className="w-full h-12 bg-white/5 text-white/40 rounded-xl flex items-center justify-center gap-3 border border-white/10 cursor-not-allowed"
        >
          <AppleIcon />
          <span>{t('loginModal.continueApple', 'Continue with Apple')}</span>
          <span className="text-[10px] uppercase tracking-wide bg-white/10 text-white/50 rounded-full px-2 py-0.5">
            {t('loginModal.comingSoon', 'Coming soon')}
          </span>
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
        {({ mounted, connect }) => (
          <Button
            disabled={isConnecting || !mounted}
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
        {({ mounted, connect }) => (
          <Button
            disabled={isConnecting || !mounted}
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
        {({ mounted, connect }) => (
          <Button
            disabled={isConnecting || !mounted}
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

  const renderEmailWaitingStep = () => (
    <div className="space-y-5">
      <div className="mx-auto w-14 h-14 rounded-full bg-white/10 border border-white/10 flex items-center justify-center">
        <Mail className="w-6 h-6 text-white" />
      </div>
      <div className="space-y-2 text-center">
        <p className="text-white text-sm">
          {t('loginModal.magicLinkSentTo', 'We sent a magic link to')}{' '}
          <span className="font-medium">{email}</span>
        </p>
        <p className="text-white/50 text-xs leading-relaxed">
          {t(
            'loginModal.magicLinkWaiting',
            'Open the email on any device and tap the button — you\'ll be signed in here automatically, plus on the device where you opened the link.'
          )}
        </p>
      </div>

      <div className="flex items-center justify-center gap-2 text-white/50 text-xs">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        {t('loginModal.waitingForLink', 'Waiting for you to confirm…')}
      </div>

      <button
        type="button"
        onClick={() => { cancelEmailMagicLink(); setStep('email'); }}
        className="w-full text-center text-xs text-white/40 hover:text-white/70 transition-colors"
      >
        {t('loginModal.wrongEmailGoBack', 'Wrong email? Go back')}
      </button>
    </div>
  );



  const renderPhoneStep = () => (
    <div className="space-y-4">
      <form onSubmit={handlePhoneSubmit} className="space-y-4">
        <div className="space-y-2">
          <Input
            type="tel"
            placeholder={t('loginModal.phonePlaceholder', '+1 415 555 2671')}
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
          {activeProvider === 'phone' ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('loginModal.sendingLink')}
            </span>
          ) : (
            t('loginModal.continue')
          )}
        </Button>

        <p className="text-white/40 text-xs text-center">
          {t('loginModal.phoneCodeInfo', "We'll text you a 6-digit verification code.")}
        </p>
      </form>
    </div>
  );

  const renderPhoneCodeStep = () => (
    <div className="space-y-4">
      <form onSubmit={handlePhoneCodeSubmit} className="space-y-4">
        <p className="text-white/60 text-sm text-center">
          {t('loginModal.codeSentTo', 'Enter the 6-digit code sent to')}{' '}
          <span className="text-white">{phone}</span>
        </p>
        <div className="space-y-2">
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            value={phoneCode}
            onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, ''))}
            disabled={isConnecting}
            className="h-12 bg-white/10 border-white/10 text-white placeholder:text-white/40 rounded-xl text-center text-lg tracking-[0.5em]"
            autoFocus
          />
          {phoneError && (
            <p className="text-red-400 text-sm">{phoneError}</p>
          )}
        </div>

        <Button
          type="submit"
          disabled={isConnecting || phoneCode.length !== 6}
          className="w-full h-12 bg-white hover:bg-white/90 text-black font-semibold rounded-xl"
        >
          {activeProvider === 'phone' ? (
            <span className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('loginModal.verifying', 'Verifying…')}
            </span>
          ) : (
            t('loginModal.continue')
          )}
        </Button>

        <button
          type="button"
          onClick={() => { setPhoneCode(''); setStep('phone'); }}
          className="w-full text-center text-xs text-white/40 hover:text-white/70 transition-colors"
        >
          {t('loginModal.resendCodePhone', 'Wrong number or no code? Go back')}
        </button>
      </form>
    </div>
  );

  const headerContent = (
    <>
      <div className="flex items-center justify-center relative">
        {step !== 'main' && !step.startsWith('wallet-') && (
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
    : step === 'email-code' ? t('loginModal.enterCode', 'Enter verification code')
    : step === 'phone' ? t('loginModal.continuePhone', 'Continue with phone')
    : step === 'phone-code' ? t('loginModal.enterCode', 'Enter verification code')
    : step === 'wallet-create' ? t('loginModal.createWallet', 'Create your wallet')
    : step === 'wallet-unlock' ? t('loginModal.unlockWallet', 'Unlock your wallet')
    : t('loginModal.connectWallet');

  const bodyContent = (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 pb-6">
        {step === 'main' && renderMainStep()}
        {step === 'email' && renderEmailStep()}
        {step === 'email-code' && renderEmailCodeStep()}
        {step === 'phone' && renderPhoneStep()}
        {step === 'phone-code' && renderPhoneCodeStep()}
        {step === 'wallets' && renderWalletsStep()}
        {step === 'wallet-create' && supabaseUserId && (
          <WalletCreateStep userId={supabaseUserId} onComplete={completeSmartWalletLogin} />
        )}
        {step === 'wallet-unlock' && supabaseUserId && (
          <WalletUnlockStep userId={supabaseUserId} onComplete={completeSmartWalletLogin} />
        )}
      </div>
      <div className="shrink-0 px-6 py-4 bg-black/20 border-t border-white/10 pb-[calc(1rem+env(safe-area-inset-bottom))]">
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
          "bg-black/60 backdrop-blur-2xl saturate-[180%] border border-white/10 border-b-0 p-0 gap-0 rounded-t-2xl overflow-hidden z-[200] flex flex-col max-h-[90dvh]",
          !isMobile && "left-[var(--app-main-left,0px)] right-auto w-[var(--app-main-width,100vw)]",
        )}
        overlayClassName={cn(
          // Unlike the drawer sheet itself (clipped to the middle panel
          // above), the backdrop spans the full viewport — including both
          // sidebars — and blurs everything outside the login flow to pull
          // full attention onto it (mobile keeps its darker bg-black/80
          // dim from DrawerOverlay's base classes).
          "z-[200] login-modal-overlay backdrop-blur-xl",
          !isMobile && "bg-black/40",
        )}
      >
        <DrawerHeader className="px-6 pt-6 pb-4 shrink-0">
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

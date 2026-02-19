/**
 * Custom Login Modal Component
 * ============================
 * Fully branded login experience.
 * Social logins via Web3Auth, wallet connections via standard Wagmi.
 * Removed Reown AppKit to stabilize the connection experience.
 */

import React, { useState, useEffect } from 'react';
import { Mail, Wallet, Loader2, ChevronRight, Smartphone } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { getWalletDeepLink, isMobileDevice, isWalletInAppBrowser } from '@/lib/web3auth';
import { WalletButton } from '@rainbow-me/rainbowkit';
import dehubLogo from '@/assets/dehub-logo-white.png';

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
  
// Official wallet logos (same as RainbowKit uses - MetaMask, Trust, Rabby)
const METAMASK_LOGO = "data:image/svg+xml,%3Csvg%20width%3D%2228%22%20height%3D%2228%22%20viewBox%3D%220%200%2028%2028%22%20fill%3D%22none%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Crect%20width%3D%2228%22%20height%3D%2228%22%20fill%3D%22white%22%2F%3E%3Cpath%20d%3D%22M24.0891%203.1199L15.3446%209.61456L16.9617%205.7828L24.0891%203.1199Z%22%20fill%3D%22%23E2761B%22%20stroke%3D%22%23E2761B%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M3.90207%203.1199L12.5763%209.67608L11.0383%205.7828L3.90207%203.1199Z%22%20fill%3D%22%23E4761B%22%20stroke%3D%22%23E4761B%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M20.9429%2018.1745L18.6139%2021.7426L23.597%2023.1136L25.0295%2018.2536L20.9429%2018.1745Z%22%20fill%3D%22%23E4761B%22%20stroke%3D%22%23E4761B%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M2.97929%2018.2536L4.40301%2023.1136L9.38607%2021.7426L7.05713%2018.1745L2.97929%2018.2536Z%22%20fill%3D%22%23E4761B%22%20stroke%3D%22%23E4761B%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M9.10483%2012.1456L7.71626%2014.2461L12.6642%2014.4658L12.4884%209.14877L9.10483%2012.1456Z%22%20fill%3D%22%23E4761B%22%20stroke%3D%22%23E4761B%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M18.8864%2012.1456L15.4589%209.08725L15.3446%2014.4658L20.2837%2014.2461L18.8864%2012.1456Z%22%20fill%3D%22%23E4761B%22%20stroke%3D%22%23E4761B%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M9.38606%2021.7426L12.3566%2020.2925L9.79033%2018.2888L9.38606%2021.7426Z%22%20fill%3D%22%23E4761B%22%20stroke%3D%22%23E4761B%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M15.6347%2020.2925L18.6139%2021.7426L18.2009%2018.2888L15.6347%2020.2925Z%22%20fill%3D%22%23E4761B%22%20stroke%3D%22%23E4761B%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M18.6139%2021.7426L15.6347%2020.2925L15.8719%2022.2348L15.8456%2023.0521L18.6139%2021.7426Z%22%20fill%3D%22%23D7C1B3%22%20stroke%3D%22%23D7C1B3%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M9.38606%2021.7426L12.1544%2023.0521L12.1368%2022.2348L12.3566%2020.2925L9.38606%2021.7426Z%22%20fill%3D%22%23D7C1B3%22%20stroke%3D%22%23D7C1B3%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M12.1984%2017.0056L9.72002%2016.2762L11.4689%2015.4765L12.1984%2017.0056Z%22%20fill%3D%22%23233447%22%20stroke%3D%22%23233447%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M15.7928%2017.0056L16.5223%2015.4765L18.28%2016.2762L15.7928%2017.0056Z%22%20fill%3D%22%23233447%22%20stroke%3D%22%23233447%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M9.38606%2021.7426L9.80791%2018.1745L7.05712%2018.2536L9.38606%2021.7426Z%22%20fill%3D%22%23CD6116%22%20stroke%3D%22%23CD6116%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M18.1921%2018.1745L18.6139%2021.7426L20.9429%2018.2536L18.1921%2018.1745Z%22%20fill%3D%22%23CD6116%22%20stroke%3D%22%23CD6116%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M20.2837%2014.2461L15.3446%2014.4658L15.8016%2017.0057L16.5311%2015.4765L18.2888%2016.2762L20.2837%2014.2461Z%22%20fill%3D%22%23CD6116%22%20stroke%3D%22%23CD6116%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M9.72002%2016.2762L11.4777%2015.4765L12.1984%2017.0057L12.6642%2014.4658L7.71626%2014.2461L9.72002%2016.2762Z%22%20fill%3D%22%23CD6116%22%20stroke%3D%22%23CD6116%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M7.71626%2014.2461L9.79033%2018.2888L9.72002%2016.2762L7.71626%2014.2461Z%22%20fill%3D%22%23E4751F%22%20stroke%3D%22%23E4751F%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M18.2888%2016.2762L18.2009%2018.2888L20.2837%2014.2461L18.2888%2016.2762Z%22%20fill%3D%22%23E4751F%22%20stroke%3D%22%23E4751F%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M12.6642%2014.4658L12.1984%2017.0057L12.7784%2020.0025L12.9102%2016.0565L12.6642%2014.4658Z%22%20fill%3D%22%23E4751F%22%20stroke%3D%22%23E4751F%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M15.3446%2014.4658L15.1073%2016.0477L15.2128%2020.0025L15.8016%2017.0057L15.3446%2014.4658Z%22%20fill%3D%22%23E4751F%22%20stroke%3D%22%23E4751F%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M15.8016%2017.0056L15.2128%2020.0025L15.6347%2020.2925L18.2009%2018.2888L18.2888%2016.2762L15.8016%2017.0056Z%22%20fill%3D%22%23F6851B%22%20stroke%3D%22%23F6851B%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M9.72002%2016.2762L9.79033%2018.2888L12.3566%2020.2925L12.7784%2020.0025L12.1984%2017.0056L9.72002%2016.2762Z%22%20fill%3D%22%23F6851B%22%20stroke%3D%22%23F6851B%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M15.8456%2023.0521L15.8719%2022.2348L15.6522%2022.0414H12.339L12.1368%2022.2348L12.1544%2023.0521L9.38606%2021.7426L10.3528%2022.5336L12.3126%2023.8958H15.6786L17.6472%2022.5336L18.6139%2021.7426L15.8456%2023.0521Z%22%20fill%3D%22%23C0AD9E%22%20stroke%3D%22%23C0AD9E%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M15.6347%2020.2925L15.2128%2020.0025H12.7784L12.3566%2020.2925L12.1368%2022.2348L12.339%2022.0414H15.6522L15.8719%2022.2348L15.6347%2020.2925Z%22%20fill%3D%22%23161616%22%20stroke%3D%22%23161616%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M24.4583%2010.0364L25.2053%206.45072L24.0891%203.1199L15.6347%209.39485L18.8864%2012.1456L23.4827%2013.4903L24.5022%2012.3038L24.0628%2011.9874L24.7658%2011.3459L24.221%2010.924L24.924%2010.3879L24.4583%2010.0364Z%22%20fill%3D%22%23763D16%22%20stroke%3D%22%23763D16%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M2.79472%206.45072L3.54174%2010.0364L3.06717%2010.3879L3.77024%2010.924L3.23415%2011.3459L3.93722%2011.9874L3.4978%2012.3038L4.50847%2013.4903L9.10483%2012.1456L12.3566%209.39485L3.90207%203.1199L2.79472%206.45072Z%22%20fill%3D%22%23763D16%22%20stroke%3D%22%23763D16%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M23.4827%2013.4903L18.8864%2012.1456L20.2837%2014.2461L18.2009%2018.2888L20.9429%2018.2536H25.0295L23.4827%2013.4903Z%22%20fill%3D%22%23F6851B%22%20stroke%3D%22%23F6851B%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M9.10484%2012.1456L4.50848%2013.4903L2.97929%2018.2536H7.05713L9.79033%2018.2888L7.71626%2014.2461L9.10484%2012.1456Z%22%20fill%3D%22%23F6851B%22%20stroke%3D%22%23F6851B%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3Cpath%20d%3D%22M15.3446%2014.4658L15.6347%209.39485L16.9705%205.7828H11.0383L12.3566%209.39485L12.6642%2014.4658L12.7696%2016.0653L12.7784%2020.0025H15.2128L15.2304%2016.0653L15.3446%2014.4658Z%22%20fill%3D%22%23F6851B%22%20stroke%3D%22%23F6851B%22%20stroke-width%3D%220.0878845%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%2F%3E%3C%2Fsvg%3E";
const TRUST_LOGO = "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20width%3D%2228%22%20height%3D%2228%22%20viewBox%3D%220%200%2028%2028%22%3E%3Cpath%20fill%3D%22%23fff%22%20d%3D%22M0%200h28v28H0z%22%2F%3E%3Cpath%20fill%3D%22%230500FF%22%20d%3D%22M6%207.583%2013.53%205v17.882C8.15%2020.498%206%2015.928%206%2013.345V7.583Z%22%2F%3E%3Cpath%20fill%3D%22url(%23a)%22%20d%3D%22M22%207.583%2013.53%205v17.882c6.05-2.384%208.47-6.954%208.47-9.537V7.583Z%22%2F%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22a%22%20x1%3D%2219.768%22%20x2%3D%2214.072%22%20y1%3D%223.753%22%20y2%3D%2222.853%22%20gradientUnits%3D%22userSpaceOnUse%22%3E%3Cstop%20offset%3D%22.02%22%20stop-color%3D%22%2300F%22%2F%3E%3Cstop%20offset%3D%22.08%22%20stop-color%3D%22%230094FF%22%2F%3E%3Cstop%20offset%3D%22.16%22%20stop-color%3D%22%2348FF91%22%2F%3E%3Cstop%20offset%3D%22.42%22%20stop-color%3D%22%230094FF%22%2F%3E%3Cstop%20offset%3D%22.68%22%20stop-color%3D%22%230038FF%22%2F%3E%3Cstop%20offset%3D%22.9%22%20stop-color%3D%22%230500FF%22%2F%3E%3C%2FlinearGradient%3E%3C%2Fdefs%3E%3C%2Fsvg%3E";
const RABBY_LOGO = "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2028%2028%22%3E%3Cg%20clip-path%3D%22url(%23a)%22%3E%3Cpath%20fill%3D%22%238697FF%22%20d%3D%22M28%200H0v28h28V0Z%22%2F%3E%3Cpath%20fill%3D%22url(%23b)%22%20d%3D%22M22.54%2015.078c.677-1.514-2.673-5.744-5.874-7.506-2.017-1.365-4.12-1.178-4.545-.579-.935%201.316%203.094%202.43%205.788%203.731-.58.252-1.125.703-1.446%201.28-1.004-1.096-3.209-2.04-5.796-1.28-1.743.513-3.191%201.721-3.751%203.546a1.097%201.097%200%201%200-.445%202.1c.112%200%20.463-.075.463-.075l5.612.041c-2.244%203.56-4.018%204.081-4.018%204.698s1.697.45%202.335.22c3.05-1.1%206.327-4.531%206.89-5.519%202.36.295%204.345.33%204.786-.657Z%22%2F%3E%3Cpath%20fill%3D%22url(%23c)%22%20fill-rule%3D%22evenodd%22%20d%3D%22m17.885%2010.713.025.01c.125-.049.105-.233.07-.378-.078-.333-1.438-1.676-2.715-2.277-1.743-.82-3.025-.777-3.212-.398.356.726%201.998%201.408%203.714%202.12.723.3%201.46.606%202.118.923Z%22%20clip-rule%3D%22evenodd%22%2F%3E%3Cpath%20fill%3D%22url(%23d)%22%20fill-rule%3D%22evenodd%22%20d%3D%22M15.701%2018.036a10.296%2010.296%200%200%200-1.2-.37c.482-.862.583-2.138.128-2.945-.639-1.133-1.44-1.736-3.304-1.736-1.024%200-3.783.346-3.832%202.648-.005.242%200%20.464.017.667l5.036.037a17.264%2017.264%200%200%201-1.871%202.483c.669.172%201.221.316%201.728.448.48.125.92.24%201.38.357a21.003%2021.003%200%200%200%201.918-1.59Z%22%20clip-rule%3D%22evenodd%22%2F%3E%3Cpath%20fill%3D%22url(%23e)%22%20d%3D%22M6.848%2016.063c.206%201.75%201.2%202.435%203.232%202.638%202.032.203%203.197.067%204.749.208%201.296.118%202.453.778%202.882.55.386-.205.17-.947-.347-1.423-.67-.617-1.597-1.046-3.229-1.199.325-.89.234-2.138-.27-2.817-.731-.982-2.079-1.426-3.785-1.232-1.782.202-3.49%201.08-3.232%203.275Z%22%2F%3E%3C%2Fg%3E%3Cdefs%3E%3ClinearGradient%20id%3D%22b%22%20x1%3D%2210.464%22%20x2%3D%2222.394%22%20y1%3D%2213.737%22%20y2%3D%2217.12%22%20gradientUnits%3D%22userSpaceOnUse%22%3E%3Cstop%20stop-color%3D%22%23fff%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23fff%22%2F%3E%3C%2FlinearGradient%3E%3ClinearGradient%20id%3D%22c%22%20x1%3D%2220.386%22%20x2%3D%2211.779%22%20y1%3D%2213.509%22%20y2%3D%224.879%22%20gradientUnits%3D%22userSpaceOnUse%22%3E%3Cstop%20stop-color%3D%22%237258DC%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23797DEA%22%20stop-opacity%3D%220%22%2F%3E%3C%2FlinearGradient%3E%3ClinearGradient%20id%3D%22d%22%20x1%3D%2215.94%22%20x2%3D%227.673%22%20y1%3D%2218.337%22%20y2%3D%2213.584%22%20gradientUnits%3D%22userSpaceOnUse%22%3E%3Cstop%20stop-color%3D%22%237461EA%22%2F%3E%3Cstop%20offset%3D%221%22%20stop-color%3D%22%23BFC2FF%22%20stop-opacity%3D%220%22%2F%3E%3C%2FlinearGradient%3E%3ClinearGradient%20id%3D%22e%22%20x1%3D%2211.177%22%20x2%3D%2216.765%22%20y1%3D%2213.648%22%20y2%3D%2220.749%22%20gradientUnits%3D%22userSpaceOnUse%22%3E%3Cstop%20stop-color%3D%22%23fff%22%2F%3E%3Cstop%20offset%3D%22.984%22%20stop-color%3D%22%23D5CEFF%22%2F%3E%3C%2FlinearGradient%3E%3CclipPath%20id%3D%22a%22%3E%3Cpath%20fill%3D%22%23fff%22%20d%3D%22M0%200h28v28H0z%22%2F%3E%3C%2FclipPath%3E%3C%2Fdefs%3E%3C%2Fsvg%3E";

const MetaMaskIcon = () => (
  <img src={METAMASK_LOGO} width="20" height="20" alt="MetaMask" className="rounded-full object-contain" />
);


interface LoginModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type LoginStep = 'main' | 'email' | 'sms' | 'wallets';

export function LoginModal({ open, onOpenChange }: LoginModalProps) {
  const { connectWithProvider, connectWithEmail, connectWithSMS, setWagmiAuthIntent, isConnecting } = useAuth();
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

  const handleSocialLogin = async (provider: 'google' | 'twitter') => {
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
      setEmailError('Please enter a valid email address');
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
      setPhoneError('Please enter a valid phone number with country code');
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

  type WalletId = 'metamask' | 'phantom' | 'trust' | 'rabby';
  const handleWalletConnect = (wallet: WalletId, connect: () => void) => {
    setActiveProvider(wallet);
    setWagmiAuthIntent(true);

    // Mobile: Use deep link to open wallet app and load dapp in its in-app browser.
    // Only redirect when NOT already in a wallet's in-app browser (where ethereum is injected).
    // When in Phantom/Trust/MetaMask browser, call connect() directly so user can sign.
    if (isMobileDevice() && !isWalletInAppBrowser()) {
      const deepLink = getWalletDeepLink(wallet);
      if (deepLink) {
        window.location.href = deepLink;
        return;
      }
    }
    connect();
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
          <span>Continue with Email</span>
        </Button>

        <Button
          onClick={() => setStep('sms')}
          disabled={isConnecting}
          className="w-full h-12 bg-white/10 hover:bg-white/15 text-white rounded-xl flex items-center justify-center gap-3 border border-white/10"
        >
          <Smartphone className="w-5 h-5" />
          <span>Continue with SMS</span>
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
          <span>Continue with Google</span>
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
          <span>Continue with X</span>
        </Button>
      </div>

      <div className="flex items-center gap-3 py-2">
        <Separator className="flex-1 bg-white/10" />
        <span className="text-white/40 text-sm">or</span>
        <Separator className="flex-1 bg-white/10" />
      </div>

      <Button
        onClick={() => setStep('wallets')}
        disabled={isConnecting}
        variant="outline"
        className="w-full h-12 bg-transparent hover:bg-white/5 text-white rounded-xl flex items-center justify-center gap-3 border-white/10"
      >
        <Wallet className="w-5 h-5" />
        <span>Connect Wallet</span>
      </Button>
    </div>
  );
  
  const PhantomIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="20" height="20">
      <path fill="#AB9FF2" d="M109.8 15.6C102.3 8.3 92.7 4.5 82.2 4.5h-5.7l-4.2 1.1C64 12.8 45.6 28.6 34.6 47.9c-4.9 8.5-8.4 17.6-10.4 27.2l-.3 1.5c-2.7-.3-5.5-.6-8.3-.9-2.7-.3-5.5-.4-8.2-.4-7.4 0-14.1.9-20.2 2.7l-1.1.3-.3 1.1C-3.3 92.7-5.1 106.3-5 119.9c0 4.1 3.4 7.5 7.5 7.6h.2c1.9 0 3.8-.7 5.1-2l.7-.7c4.3-4.2 9.8-6.9 15.8-7.6 13.4-1.8 15.2 1.3 16.2 3 2.4 4 6.3 7.6 10.2 7.6h.2c1.9 0 3.7-.7 5.1-2l.7-.7c4.3-4.1 9.8-6.8 15.7-7.6 13.6-1.8 15.2 1.5 16.2 3.2 2.3 4 6.4 7.5 9.9 7.1h.2c1.9 0 3.7-.7 5.1-2l.7-.7c4.3-4.1 9.8-6.8 15.7-7.6 9.9-1.3 14.1-.9 16.5 1.9l1 1.1 1.4-.5c6.7-2.4 11.4-8.2 12.5-15.2 1.2-8.3-3.1-16.4-10.6-20.3l-1.3-.7v-1.5c0-23.9-7.5-46-21.7-64l-.9-1.1z"/>
      <path fill="#FFF" d="M98.4 54.3c-4.4 0-8.1 3.7-8.1 8.1s3.7 8.1 8.1 8.1 8.1-3.7 8.1-8.1-3.7-8.1-8.1-8.1zM64.2 54.3c-4.4 0-8.1 3.7-8.1 8.1s3.7 8.1 8.1 8.1 8.1-3.7 8.1-8.1-3.7-8.1-8.1-8.1z"/>
    </svg>
  );

  const TrustIcon = () => (
    <img src={TRUST_LOGO} width="20" height="20" alt="Trust Wallet" className="rounded-full object-contain" />
  );

  const RabbyIcon = () => (
    <img src={RABBY_LOGO} width="20" height="20" alt="Rabby" className="rounded-full object-contain" />
  );

  const walletButtonClass = "w-full h-12 bg-white/10 hover:bg-white/15 text-white rounded-xl flex items-center justify-start gap-3 border border-white/10 px-4";

  const renderWalletsStep = () => (
    <div className="space-y-3">
      <WalletButton.Custom wallet="metamask">
        {({ ready, connect }) => (
          <Button
            disabled={!ready || isConnecting}
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
            disabled={!ready || isConnecting}
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

      <WalletButton.Custom wallet="trust">
        {({ ready, connect }) => (
          <Button
            disabled={!ready || isConnecting}
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

      {!isMobile && (
        <WalletButton.Custom wallet="rabby">
          {({ ready, connect }) => (
            <Button
              disabled={!ready || isConnecting}
              onClick={() => handleWalletConnect('rabby', connect)}
              className={walletButtonClass}
            >
              {activeProvider === 'rabby' && isConnecting ? (
                <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
              ) : (
                <div className="flex-shrink-0"><RabbyIcon /></div>
              )}
              <span className="flex-1 text-left">Rabby</span>
              <ChevronRight className="w-4 h-4 text-white/40" />
            </Button>
          )}
        </WalletButton.Custom>
      )}

      <p className="text-white/40 text-[10px] text-center mt-2 px-2">
        On mobile, your wallet app will open to sign in and return here automatically
      </p>
    </div>
  );


  const renderEmailStep = () => (
    <div className="space-y-4">
      <form onSubmit={handleEmailSubmit} className="space-y-4">
        <div className="space-y-2">
          <Input
            type="email"
            placeholder="Enter your email"
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
              Sending link...
            </span>
          ) : (
            'Continue'
          )}
        </Button>

        <p className="text-white/40 text-xs text-center">
          We'll send you a magic link to sign in
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
              Sending code...
            </span>
          ) : (
            'Continue'
          )}
        </Button>

        <p className="text-white/40 text-xs text-center">
          We'll send you a verification code via SMS
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

  const titleText = step === 'main' ? 'Log in'
    : step === 'email' ? 'Continue with Email'
    : step === 'sms' ? 'Continue with SMS'
    : 'Connect Wallet';

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
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleClose}>
        <DrawerContent className="bg-black/60 backdrop-blur-2xl saturate-[180%] border border-white/10 border-b-0 p-0 gap-0 rounded-t-2xl overflow-hidden">
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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-black/40 backdrop-blur-2xl saturate-[180%] border border-white/10 max-w-sm p-0 gap-0 rounded-2xl overflow-hidden [&>button]:hidden">
        <DialogHeader className="px-6 pt-6 pb-4">
          {headerContent}
          <DialogTitle className="text-base font-medium text-white mt-4 text-center">
            {titleText}
          </DialogTitle>
        </DialogHeader>
        {bodyContent}
      </DialogContent>
    </Dialog>
  );
}

export default LoginModal;

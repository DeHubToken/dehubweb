/**
 * NewConversationModal Component
 * ==============================
 * Modal for searching and selecting a user to start a new DM conversation.
 * If the recipient has a perMessageFee, shows a payment step first:
 *   1. Check sender's DHB balance
 *   2. Show fee confirmation with option to tip more
 *   3. Process on-chain DHB transfer
 *   4. Only then create the conversation
 */

/**
 * NewConversationModal Component
 * ==============================
 * Modal for searching and selecting a user to start a new DM conversation.
 * If the recipient has a perMessageFee, shows a payment step first:
 *   1. Check sender's DHB balance
 *   2. Show fee confirmation with option to tip more
 *   3. Process on-chain DHB transfer
 *   4. Only then create the conversation
 */

import { useState, useCallback, useEffect } from 'react';
import { Search, Loader2, ArrowLeft, AlertCircle } from 'lucide-react';
import dehubCoin from '@/assets/dehub-coin.png';
import padlockImg from '@/assets/padlock.png';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useUserSearchForDM, useCreateConversation } from '@/hooks/use-messages';
import { getAccountInfo, type DeHubUser, type DeHubConversation } from '@/lib/api/dehub';
import { buildAvatarUrl, extractAvatarPath } from '@/lib/media-url';
import { toast } from 'sonner';
import { dhbText } from '@/lib/dhb-toast';
import { VerifiedBadge } from '../VerifiedBadge';
import { BadgeIcon } from '@/components/app/BadgeIcon';
import {
  getWalletAddress,
  getERC20Balance,
  switchChain,
  parseTxError,
} from '@/lib/contracts/aa-utils';
import { DHB_TOKEN, toWei, getChainConfig, BASE_CHAIN_ID } from '@/lib/contracts/dhb-token';
import { sendTip } from '@/lib/contracts/stream-controller';
import { emitSendMessage } from '@/lib/api/dehub/dm-socket';

interface NewConversationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConversationCreated: (conversation: DeHubConversation) => void;
  /** Pre-select a fee user so the modal opens directly to the payment step */
  initialFeeUser?: DeHubUser | null;
  /** Optional message body to send automatically once the recipient is picked */
  initialMessage?: string;
  /** Override modal title (e.g. "Invite to Community") */
  title?: string;
}

/** Extract dmSettings from either array or object shape */
function getDmSettings(user: DeHubUser) {
  const raw = (user as any).dmSettings || (user as any).dmSetting;
  return Array.isArray(raw) ? raw[0] : raw;
}

function UserSearchResult({ 
  user, 
  onSelect, 
  isLoading,
}: { 
  user: DeHubUser; 
  onSelect: () => void;
  isLoading: boolean;
}) {
  const avatarPath = extractAvatarPath(user);
  const avatarUrl = user.address ? buildAvatarUrl(user.address, avatarPath) : undefined;
  const rawDisplayName = user.displayName || user.display_name;
  const displayName = rawDisplayName || user.username || 'User';
  const showHandle = !!user.username && !!rawDisplayName; // only show @handle when distinct from top line
  const isVerified = user.isVerified || user.is_verified;
  const badgeBalance = (user as any).badgeBalance ?? (user as any).balance ?? undefined;

  const dmSettingsObj = getDmSettings(user);
  const dmDisabled = dmSettingsObj?.disables?.includes('NEW_DM') || dmSettingsObj?.disables?.includes('all');
  const perMessageFee = dmSettingsObj?.perMessageFee;
  
  return (
    <button
      onClick={onSelect}
      disabled={isLoading || dmDisabled}
      className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors text-left ${
        dmDisabled
          ? 'opacity-50 cursor-not-allowed'
          : isLoading
            ? 'opacity-60 cursor-wait'
            : 'hover:bg-zinc-800'
      }`}
    >
      <Avatar className="w-12 h-12">
        {avatarUrl && <AvatarImage src={avatarUrl} />}
        <AvatarFallback className="bg-zinc-700 text-white font-medium">
          {displayName.charAt(0).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="relative inline-flex items-baseline shrink min-w-0 pr-3">
            <span className="font-semibold text-white text-sm truncate leading-tight">{displayName}</span>
            <BadgeIcon badgeBalance={badgeBalance} username={user.username || displayName} className="w-[9px] h-[9px] absolute -top-0.5 right-0" />
          </span>
          {isVerified && <VerifiedBadge className="w-3.5 h-3.5 shrink-0" />}
        </div>
        {showHandle && (
          <p className="text-xs text-zinc-500 truncate">@{user.username}</p>
        )}
        {dmDisabled && (
          <p className="text-xs text-red-400 mt-1">DMs disabled</p>
        )}
        {!dmDisabled && !isLoading && perMessageFee && perMessageFee > 0 && (
          <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
            <img src={dehubCoin} alt="DHB" className="w-3 h-3" />
            {perMessageFee.toLocaleString()} DHB to message
          </p>
        )}
        {isLoading && (
          <p className="text-xs text-zinc-400 mt-1 flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Sending invite...
          </p>
        )}
      </div>
    </button>
  );
}

/** Fee payment step shown before creating a conversation */
function FeePaymentStep({
  user,
  fee,
  onPaid,
  onBack,
}: {
  user: DeHubUser;
  fee: number;
  onPaid: (firstMessage?: string, feeTxHash?: string) => void;
  onBack: () => void;
}) {
  const [messageText, setMessageText] = useState('');
  const [customAmount, setCustomAmount] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [balanceInfo, setBalanceInfo] = useState<{ checked: boolean; balance: number; sufficient: boolean }>({
    checked: false, balance: 0, sufficient: false,
  });
  const [isCheckingBalance, setIsCheckingBalance] = useState(false);

  const avatarPath = extractAvatarPath(user);
  const avatarUrl = user.address ? buildAvatarUrl(user.address, avatarPath) : undefined;
  const displayName = user.displayName || user.display_name || user.username || 'User';

  const tipAmount = customAmount ? parseFloat(customAmount) : fee;
  const isValidAmount = !Number.isNaN(tipAmount) && tipAmount >= fee;

  // Check balance on mount
  const checkBalance = useCallback(async () => {
    setIsCheckingBalance(true);
    try {
      const chainId = BASE_CHAIN_ID;
      const chainConfig = getChainConfig(chainId);
      await switchChain(chainId);
      const signerAddress = await getWalletAddress();
      const balanceWei = await getERC20Balance(chainConfig.dhbToken, signerAddress);
      const balanceHuman = Number(balanceWei) / 1e18;
      setBalanceInfo({
        checked: true,
        balance: balanceHuman,
        sufficient: balanceHuman >= fee,
      });
    } catch (err) {
      console.error('[NewConversationModal] Balance check failed:', err);
      // Allow proceeding anyway — the transfer will fail if insufficient
      setBalanceInfo({ checked: true, balance: 0, sufficient: true });
    } finally {
      setIsCheckingBalance(false);
    }
  }, [fee]);

  // Auto-check on render
  useState(() => { checkBalance(); });

  const handlePay = async (amount: number) => {
    if (Number.isNaN(amount) || amount < fee) {
      toast.error(dhbText(`Minimum tip is ${fee.toLocaleString()} DHB`));
      return;
    }
    if (!messageText.trim()) {
      toast.error('Please enter a message');
      return;
    }

    setIsSending(true);
    try {
      const chainId = BASE_CHAIN_ID;
      const chainConfig = getChainConfig(chainId);
      await switchChain(chainId);
      const signerAddress = await getWalletAddress();
      const amountWei = toWei(amount, DHB_TOKEN.decimals);
      const balance = await getERC20Balance(chainConfig.dhbToken, signerAddress);

      if (balance < amountWei) {
        const balanceHuman = Number(balance) / 1e18;
        toast.error(dhbText(`Insufficient DHB. Need ${amount.toLocaleString()} but have ${balanceHuman.toFixed(2)}`));
        setBalanceInfo({ checked: true, balance: balanceHuman, sufficient: false });
        setIsSending(false);
        return;
      }

      toast.loading('Sending tip to unlock DMs...', { id: 'dm-fee-gate' });

      const tipResult = await sendTip({
        tokenId: 0,
        amount,
        to: user.address!,
        chainId,
      });
      const txHash = tipResult.hash;

      toast.success(dhbText(`Paid ${amount.toLocaleString()} DHB — opening chat! 🎉`), { id: 'dm-fee-gate' });
      onPaid(messageText.trim(), txHash);
    } catch (error: unknown) {
      console.error('[NewConversationModal] Payment failed:', error);
      const message = parseTxError(error as Error);
      toast.error(message || 'Payment failed', { id: 'dm-fee-gate' });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Back button */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to search
      </button>

      {/* User info */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-800/50">
        <Avatar className="w-12 h-12">
          {avatarUrl && <AvatarImage src={avatarUrl} />}
          <AvatarFallback className="bg-zinc-700 text-white font-medium">
            {displayName.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div>
          <p className="font-semibold text-white">{displayName}</p>
          {user.username && <p className="text-sm text-zinc-500">@{user.username}</p>}
        </div>
      </div>

      {/* Fee info */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0">
          <img src={padlockImg} alt="Lock" className="w-8 h-8 object-contain" />
        </div>
        <div>
          <h3 className="text-white font-semibold text-sm">Tip to Message</h3>
          <p className="text-zinc-400 text-xs leading-relaxed">
            {displayName} requires a minimum tip of{' '}
            <span className="text-amber-400 font-medium">{fee.toLocaleString()} DHB</span> to start a conversation.
          </p>
        </div>
      </div>

      {/* Balance check */}
      {isCheckingBalance ? (
        <div className="flex items-center gap-2 text-sm text-zinc-400 justify-center py-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Checking your DHB balance...
        </div>
      ) : balanceInfo.checked && !balanceInfo.sufficient ? (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <p className="text-xs text-red-400">
            Insufficient balance. You have {Math.floor(balanceInfo.balance).toLocaleString()} DHB but need {fee.toLocaleString()} DHB.
          </p>
        </div>
      ) : balanceInfo.checked ? (
        <p className="text-xs text-zinc-500 text-center">
          Your balance: {Math.floor(balanceInfo.balance).toLocaleString()} DHB
        </p>
      ) : null}

      {/* Message input */}
      <div>
        <p className="text-white/60 text-xs mb-1.5">Your message</p>
        <Input
          type="text"
          placeholder="Type your first message..."
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          disabled={isSending}
          className="bg-white/5 border-white/10 text-white placeholder:text-white/30 h-11 text-sm"
        />
      </div>

      {/* Pay minimum */}
      <Button
        variant="glass"
        className="w-full bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/30 h-11"
        onClick={() => handlePay(fee)}
        disabled={isSending || !messageText.trim() || (balanceInfo.checked && !balanceInfo.sufficient)}
      >
        {isSending && !customAmount ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Processing...
          </>
        ) : (
          <>
            <img src={dehubCoin} alt="DHB" className="w-4 h-4 mr-2" />
            Pay {fee.toLocaleString()} DHB & Start Chat
          </>
        )}
      </Button>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-white/10" />
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">or tip more to rank higher</span>
        <div className="flex-1 h-px bg-white/10" />
      </div>

      {/* Custom higher tip */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <img src={dehubCoin} alt="DHB" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 z-10" />
          <Input
            type="number"
            min={fee}
            step={1}
            placeholder={`Enter amount (min ${fee.toLocaleString()})`}
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            disabled={isSending}
            className="pl-10 bg-white/5 border-white/10 text-white placeholder:text-white/30 h-11 text-sm"
          />
        </div>
        <Button
          variant="glass"
          className="bg-amber-500/20 hover:bg-amber-500/30 border-amber-500/30 h-11 px-4"
          onClick={() => handlePay(tipAmount)}
          disabled={isSending || !isValidAmount || !messageText.trim() || (balanceInfo.checked && !balanceInfo.sufficient)}
        >
          {isSending && customAmount ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            'Send'
          )}
        </Button>
      </div>

      {customAmount && isValidAmount && tipAmount > fee && (
        <p className="text-[10px] text-amber-400/70 text-center">
          🔥 Tipping {tipAmount.toLocaleString()} DHB will rank you higher in {displayName}'s inbox
        </p>
      )}
    </div>
  );
}

export function NewConversationModal({ 
  open, 
  onOpenChange, 
  onConversationCreated,
  initialFeeUser,
  initialMessage,
  title,
}: NewConversationModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [feeUser, setFeeUser] = useState<DeHubUser | null>(null);

  // When modal opens with an initialFeeUser, jump straight to fee step
  useEffect(() => {
    if (open && initialFeeUser) {
      setFeeUser(initialFeeUser);
    }
  }, [open, initialFeeUser]);
  
  const { data: searchResults, isLoading: isSearching } = useUserSearchForDM(searchQuery);
  const createConversation = useCreateConversation();

  const startConversation = async (user: DeHubUser, firstMessage?: string, feeTxHash?: string) => {
    const userAddress = user.address || user._id;
    const userSocketId = user._id || user.id;
    if (!userAddress) {
      toast.error('Unable to start conversation with this user');
      return;
    }

    setSelectedUserId(userAddress);

    try {
      if (firstMessage && !feeTxHash) {
        const conversation = await createConversation.mutateAsync({
          recipientAddress: userAddress,
          recipientUser: user,
        });
        if (conversation.id) {
          emitSendMessage({ dmId: conversation.id, content: firstMessage, type: 'msg' });
        }
        onConversationCreated(conversation);
        onOpenChange(false);
        setSearchQuery('');
        setFeeUser(null);
        return;
      }

      const conversation = await createConversation.mutateAsync({
        recipientAddress: userAddress,
        recipientUser: user,
      });

      // Fee-paid first message goes through the socket immediately (fee tx already settled)
      if (firstMessage && conversation.id && feeTxHash) {
        emitSendMessage({
          dmId: conversation.id,
          content: firstMessage,
          type: 'msg',
          txHash: feeTxHash,
        });
      }

      onConversationCreated(conversation);
      onOpenChange(false);
      setSearchQuery('');
      setFeeUser(null);
    } catch (error: any) {
      toast.error(error.message || 'Failed to start conversation');
    } finally {
      setSelectedUserId(null);
    }
  };

  const handleSelectUser = (user: DeHubUser) => {
    const dmSettingsObj = getDmSettings(user);
    const perMessageFee = dmSettingsObj?.perMessageFee;
    if (perMessageFee && perMessageFee > 0) {
      setFeeUser(user);
      return;
    }
    startConversation(user, initialMessage);
  };

  const handleClose = () => {
    onOpenChange(false);
    setSearchQuery('');
    setSelectedUserId(null);
    setFeeUser(null);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="bg-black/60 backdrop-blur-[24px] border border-white/10 shadow-2xl max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white">{title || 'New Message'}</DialogTitle>
        </DialogHeader>

        {feeUser ? (
          <FeePaymentStep
            user={feeUser}
            fee={getDmSettings(feeUser)?.perMessageFee ?? 0}
            onPaid={(firstMessage, feeTxHash) => startConversation(feeUser, firstMessage, feeTxHash)}
            onBack={() => setFeeUser(null)}
          />
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <Input
                placeholder="Search by username..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 rounded-xl"
                autoFocus
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 text-[10px] font-medium text-white/70 bg-white/10 hover:bg-white/20 border border-white/10 rounded-md transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto -mx-2">
              {searchQuery.length < 2 ? (
                <div className="text-center py-8 text-zinc-500">
                  <Search className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p>Enter at least 2 characters to search</p>
                </div>
              ) : isSearching ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-zinc-500" />
                </div>
              ) : searchResults?.items?.length === 0 ? (
                <div className="text-center py-8 text-zinc-500">
                  <p>No users found</p>
                  <p className="text-sm mt-1">Try a different search term</p>
                </div>
              ) : (
                <div className="space-y-1 px-2">
                  {searchResults?.items?.map((user) => (
                    <UserSearchResult
                      key={user._id || user.address}
                      user={user}
                      onSelect={() => handleSelectUser(user)}
                      isLoading={selectedUserId === (user.address || user._id)}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

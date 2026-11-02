/**
 * New group / New channel
 * =======================
 * Opened from the + in Messages. A group is a chat everyone in it talks in;
 * a channel is one only you (and your admins) post to. Both are communities
 * underneath, so invites, roles, pins and polls all come with them.
 *
 * After Create it lands in the new chat with the invite picker open.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import Users from '@/components/ui/cut-icons/communities';
import Megaphone from '@/components/ui/cut-icons/advertising';
import Image from '@/components/ui/cut-icons/images';
import World from '@/components/ui/cut-icons/world';
import Lock from '@/components/ui/cut-icons/privacy';
import X from '@/components/ui/cut-icons/close';
import Check from '@/components/ui/cut-icons/check';
import { Button } from '@/components/ui/button';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { useCreateCommunity, uploadCommunityMedia } from '@/hooks/use-communities';
import { resolveUniqueSlug } from '@/components/app/communities/CreateCommunityModal';
import dehubCoin from '@/assets/dehub-coin.png';
import { cn } from '@/lib/utils';

export type NewChatKind = 'group' | 'channel';

const QUICK_PRICES = [100, 1000, 10000];

function Choice({ active, onClick, icon, title, detail }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; detail: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-new-chat-choice
      className={cn(
        'flex-1 min-w-0 rounded-xl border px-3 py-2.5 text-left transition-colors',
        active ? 'border-white/60 bg-white/[0.1]' : 'border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.06]',
      )}
    >
      <span className="flex items-center gap-1.5 text-sm font-medium text-white">
        {icon}{title}
        <span
          aria-hidden
          style={{ borderRadius: 9999 }}
          className={cn('ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-full border', active ? 'border-white bg-white text-black' : 'border-white/30')}
        >
          {active && <Check className="h-3 w-3" />}
        </span>
      </span>
      <span className="mt-0.5 block text-[11px] leading-snug text-zinc-500">{detail}</span>
    </button>
  );
}

export function NewGroupChannelSheet({ kind, open, onOpenChange }: { kind: NewChatKind; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const create = useCreateCommunity();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [paid, setPaid] = useState(false);
  const [price, setPrice] = useState('1000');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isChannel = kind === 'channel';
  const priceNumber = Math.floor(Number(price));
  const priceValid = !paid || (Number.isFinite(priceNumber) && priceNumber >= 1);
  const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const reset = () => {
    setName(''); setDescription(''); setIsPrivate(false); setPaid(false); setPrice('1000');
    setAvatarFile(null); setAvatarPreview(null);
  };

  const submit = async () => {
    if (name.trim().length < 3) { toast.error(t('communities.nameMinLength')); return; }
    if (!baseSlug) { toast.error(t('communities.invalidName')); return; }
    if (!priceValid) return;
    setBusy(true);
    try {
      const slug = await resolveUniqueSlug(baseSlug);
      const avatar_url = avatarFile ? await uploadCommunityMedia(avatarFile, slug, 'avatar') : undefined;
      const created = await create.mutateAsync({
        name: name.trim(),
        slug,
        description: description.trim() || undefined,
        avatar_url,
        is_private: isPrivate,
        kind,
        entry_price: paid ? priceNumber : null,
      });
      onOpenChange(false);
      reset();
      navigate(`/app/communities/${created.slug}?tab=chat&invite=1`);
    } catch {
      // the mutation shows its own toast
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent column glass hideHandle data-new-chat-sheet={kind}>
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <DrawerHeader className="p-0">
            <DrawerTitle className="text-white font-medium flex items-center gap-2">
              {isChannel ? <Megaphone className="w-5 h-5" /> : <Users className="w-5 h-5" />}
              {isChannel
                ? t('communities.newChat.newChannel', { defaultValue: 'New channel' })
                : t('communities.newChat.newGroup', { defaultValue: 'New group' })}
            </DrawerTitle>
          </DrawerHeader>
          <button type="button" onClick={() => onOpenChange(false)} aria-label={t('common.close', { defaultValue: 'Close' })} className="text-zinc-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 pb-6 space-y-4">
          <div className="flex items-center gap-3">
            <label className="w-14 h-14 shrink-0 rounded-xl bg-white/[0.06] border border-white/[0.1] flex items-center justify-center cursor-pointer overflow-hidden hover:bg-white/[0.1] transition-colors">
              {avatarPreview ? <img src={avatarPreview} alt="" className="w-full h-full object-cover" /> : <Image className="w-5 h-5 text-zinc-500" />}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setAvatarFile(file);
                  setAvatarPreview(URL.createObjectURL(file));
                }}
              />
            </label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={isChannel
                ? t('communities.newChat.channelName', { defaultValue: 'Channel name' })
                : t('communities.newChat.groupName', { defaultValue: 'Group name' })}
              maxLength={50}
              className="flex-1 min-w-0 h-10 px-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder:text-zinc-600 outline-none focus:border-white/20 text-sm"
            />
          </div>

          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={t('communities.newChat.description', { defaultValue: 'What is it about? (optional)' })}
            maxLength={500}
            rows={2}
            className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-xl text-white placeholder:text-zinc-600 outline-none focus:border-white/20 text-sm resize-none"
          />

          <div>
            <p className="mb-1.5 text-xs text-zinc-400">{t('communities.newChat.whoCanJoin', { defaultValue: 'Who can join' })}</p>
            <div className="flex gap-2">
              <Choice
                active={!isPrivate}
                onClick={() => setIsPrivate(false)}
                icon={<World className="w-4 h-4" />}
                title={t('communities.newChat.public', { defaultValue: 'Public' })}
                detail={t('communities.newChat.publicDetail', { defaultValue: 'Anyone can find it and join' })}
              />
              <Choice
                active={isPrivate}
                onClick={() => setIsPrivate(true)}
                icon={<Lock className="w-4 h-4" />}
                title={isChannel
                  ? t('communities.newChat.inviteOnly', { defaultValue: 'Invite only' })
                  : t('communities.newChat.private', { defaultValue: 'Private' })}
                detail={t('communities.newChat.privateDetail', { defaultValue: 'People join with your invite or your approval' })}
              />
            </div>
          </div>

          {isChannel && (
            <div>
              <p className="mb-1.5 text-xs text-zinc-400">{t('communities.newChat.entry', { defaultValue: 'Entry' })}</p>
              <div className="flex gap-2">
                <Choice
                  active={!paid}
                  onClick={() => setPaid(false)}
                  icon={null}
                  title={t('communities.newChat.free', { defaultValue: 'Free' })}
                  detail={t('communities.newChat.freeDetail', { defaultValue: 'No charge to join' })}
                />
                <Choice
                  active={paid}
                  onClick={() => setPaid(true)}
                  icon={<img src={dehubCoin} alt="" className="w-4 h-4" />}
                  title={t('communities.newChat.paid', { defaultValue: 'Paid' })}
                  detail={t('communities.newChat.paidDetail', { defaultValue: 'One payment in tokens, straight to you' })}
                />
              </div>
              {paid && (
                <div className="mt-2.5">
                  <div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 h-10">
                    <img src={dehubCoin} alt="" className="w-4 h-4" />
                    <input
                      value={price}
                      onChange={e => setPrice(e.target.value.replace(/[^0-9]/g, ''))}
                      inputMode="numeric"
                      aria-label={t('communities.newChat.price', { defaultValue: 'Price in tokens' })}
                      className="flex-1 min-w-0 bg-transparent text-sm text-white outline-none"
                    />
                    <span className="text-xs text-zinc-500">{t('buyCoins.tokensUnit', { defaultValue: 'tokens' })}</span>
                  </div>
                  <div className="mt-2 flex gap-2">
                    {QUICK_PRICES.map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPrice(String(p))}
                        className={cn('rounded-lg border px-2.5 py-1 text-xs', String(p) === price ? 'border-white/60 bg-white/[0.1] text-white' : 'border-white/[0.08] text-zinc-400')}
                      >
                        {p.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <p className="mt-2 text-[11px] text-zinc-500">
                {t('communities.newChat.channelNote', { defaultValue: 'Only you and your admins can post. Members read and react.' })}
              </p>
            </div>
          )}

          <Button
            onClick={submit}
            disabled={busy || !name.trim() || !priceValid}
            className="w-full rounded-xl bg-white text-black hover:bg-white/90 font-medium"
          >
            {busy
              ? t('communities.creating')
              : isChannel
                ? t('communities.newChat.createChannel', { defaultValue: 'Create channel' })
                : t('communities.newChat.createGroup', { defaultValue: 'Create group' })}
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

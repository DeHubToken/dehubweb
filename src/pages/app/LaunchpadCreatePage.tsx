import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { X, Upload, Loader2 } from 'lucide-react';
import { getLaunchpadBase } from '@/lib/launchpad/base-path';
import { Drawer, DrawerContent } from '@/components/ui/drawer';

export default function LaunchpadCreatePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const base = getLaunchpadBase(location.pathname);
  const { walletAddress, openLoginModal } = useAuth() as { walletAddress?: string; openLoginModal: () => void };
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [website, setWebsite] = useState('');
  const [twitter, setTwitter] = useState('');
  const [telegram, setTelegram] = useState('');
  const [chainId, setChainId] = useState<8453 | 56>(8453);
  const [curveType, setCurveType] = useState<'standard' | 'fair' | 'stealth'>('standard');
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function handleImageUpload(file: File) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Image files only'); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error('Max 5MB'); return; }
    setUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'png';
      const path = `launchpad/${(walletAddress || 'anon').toLowerCase()}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('ai-media-uploads').upload(path, file, {
        cacheControl: '3600', upsert: false, contentType: file.type,
      });
      if (error) throw error;
      const { data } = supabase.storage.from('ai-media-uploads').getPublicUrl(path);
      setImageUrl(data.publicUrl);
    } catch (e) {
      toast.error((e as Error)?.message ?? 'Upload failed');
    } finally { setUploading(false); }
  }

  const canNext1 = name.trim().length >= 2 && /^[A-Z0-9]{2,8}$/.test(symbol);
  const canSubmit = canNext1;

  const close = () => navigate(base);

  async function submit() {
    if (!walletAddress) { openLoginModal(); return; }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.from('launchpad_tokens').insert({
        chain_id: chainId,
        creator_address: walletAddress.toLowerCase(),
        name: name.trim(),
        symbol: symbol.trim().toUpperCase(),
        description: description.trim() || null,
        image_url: imageUrl.trim() || null,
        socials: { website, twitter, telegram },
        curve_type: curveType,
      }).select().single();
      if (error) throw error;
      toast.success(`${symbol} launched`);
      navigate(`${base}/${data.id}`);
    } catch (e) {
      toast.error((e as Error)?.message ?? 'Failed to create');
    } finally { setSubmitting(false); }
  }

  return (
    <>
      <Helmet>
        <title>Create coin — Launchpad</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>


      <Drawer open onOpenChange={(o) => { if (!o) close(); }}>
        <DrawerContent
          glass
          hideHandle={false}
          className="left-0 right-0 mx-auto max-w-2xl max-h-[92vh]"
        >
          <div className="flex items-center justify-between px-5 pt-3 pb-2">
            <div>
              <div className="text-white text-lg font-bold leading-tight">Create a coin</div>
              <div className="text-white/50 text-xs mt-0.5">Step {step} of 3</div>
            </div>
            <button onClick={close} aria-label="Close"
              className="rounded-lg p-1.5 text-white/60 hover:text-white hover:bg-white/5">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="px-5 pb-5 space-y-4 overflow-y-auto">
            {step === 1 && (
              <>
                <Field label="Name">
                  <input value={name} onChange={e => setName(e.target.value)} maxLength={48}
                    placeholder="e.g. Pepe Coin" className={inputCls} />
                </Field>
                <Field label="Ticker" hint="2–8 chars, A–Z, 0–9">
                  <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,''))}
                    maxLength={8} placeholder="PEPE" className={inputCls} />
                </Field>
                <Field label="Description (optional)">
                  <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} maxLength={280}
                    placeholder="Tell the world what this is" className={inputCls} />
                </Field>
                <Field label="Image URL (optional)">
                  <input value={imageUrl} onChange={e => setImageUrl(e.target.value)}
                    placeholder="https://…" className={inputCls} />
                </Field>
                <div className="grid grid-cols-3 gap-2">
                  <input value={website} onChange={e => setWebsite(e.target.value)} placeholder="Website" className={inputCls} />
                  <input value={twitter} onChange={e => setTwitter(e.target.value)} placeholder="X / Twitter" className={inputCls} />
                  <input value={telegram} onChange={e => setTelegram(e.target.value)} placeholder="Telegram" className={inputCls} />
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <Field label="Chain">
                  <div className="grid grid-cols-2 gap-2">
                    {([[8453,'Base'],[56,'BNB']] as const).map(([id,label]) => (
                      <button key={id} onClick={() => setChainId(id)}
                        className={`rounded-xl py-3 text-sm font-semibold ${chainId===id ? 'bg-white text-black' : 'bg-white/5 text-white/70 hover:text-white'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Curve">
                  <div className="grid grid-cols-3 gap-2">
                    {(['standard','fair','stealth'] as const).map(c => (
                      <button key={c} onClick={() => setCurveType(c)}
                        className={`rounded-xl py-3 text-sm font-semibold capitalize ${curveType===c ? 'bg-white text-black' : 'bg-white/5 text-white/70 hover:text-white'}`}>{c}</button>
                    ))}
                  </div>
                </Field>
                <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-xs text-white/60 space-y-1">
                  <div>Base pair: <span className="text-white">DHB</span></div>
                  <div>Graduation target: <span className="text-white">$42,000 market cap</span></div>
                  <div>Fee: <span className="text-white">1% per trade</span> (40% burn / 30% stakers / 20% creator / 10% platform)</div>
                </div>
              </>
            )}
            {step === 3 && (
              <>
                <div className="text-white text-sm font-semibold">Review</div>
                <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-sm space-y-1.5">
                  <Row k="Name" v={name} />
                  <Row k="Ticker" v={`$${symbol}`} />
                  <Row k="Chain" v={chainId === 8453 ? 'Base' : 'BNB'} />
                  <Row k="Curve" v={curveType} />
                  <Row k="Pair" v="DHB" />
                  <Row k="Graduates at" v="$42,000 mcap" />
                </div>
                <p className="text-[11px] text-white/40">Phase 1 mock — no on-chain transaction is sent.</p>
              </>
            )}

            <div className="flex items-center justify-between pt-2">
              <button onClick={() => setStep(s => Math.max(1, s-1))} disabled={step===1}
                className="rounded-xl px-4 py-2 text-sm text-white/70 hover:text-white disabled:opacity-30">Back</button>
              {step < 3
                ? <button onClick={() => setStep(s => s+1)} disabled={step===1 && !canNext1}
                    className="rounded-2xl bg-white text-black font-semibold px-5 py-2.5 disabled:opacity-40">Next</button>
                : <button onClick={submit} disabled={!canSubmit || submitting}
                    className="rounded-2xl bg-white text-black font-semibold px-5 py-2.5 disabled:opacity-40">
                    {submitting ? 'Launching…' : 'Launch'}
                  </button>}
            </div>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

const inputCls = "w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-white placeholder:text-white/40 focus:outline-none focus:border-white/30 text-sm";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-[11px] uppercase text-white/50">{label}</label>
        {hint && <span className="text-[10px] text-white/30">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><span className="text-white/50">{k}</span><span className="text-white capitalize">{v}</span></div>;
}

import { useTranslation as _useCopy } from 'react-i18next';
import { useDraftState } from '@/hooks/use-draft-state';
import { useState, type FormEvent } from 'react';
import { Loader2, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  onClose: () => void;
}

export function ArcadeSubmissionForm({ onClose }: Props) {
  const { t: _copy } = _useCopy();
  const emptyDraft = { title: '', email: '', playable_url: '', source_url: '', description: '' };
  const [draft, setDraft] = useDraftState('arcade:submission', emptyDraft);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setError('');
    setSubmitting(true);
    try {
      const { error: submitError } = await supabase.from('arcade_submissions').insert({
        title: String(data.get('title') || '').trim(),
        contact_email: String(data.get('email') || '').trim(),
        playable_url: String(data.get('playable_url') || '').trim(),
        source_url: String(data.get('source_url') || '').trim() || null,
        description: String(data.get('description') || '').trim(),
        mobile_support: data.get('mobile_support') === 'on',
        rights_confirmed: data.get('rights_confirmed') === 'on',
      });
      if (submitError) throw submitError;
      setDraft.complete(draft, emptyDraft);
      setSubmitted(true);
    } catch {
      setError('Could not send your game. Please check the links and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const field = 'w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:border-white/40 focus:outline-none';

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/80 px-3 py-8" role="dialog" aria-modal="true" aria-labelledby="arcade-submit-title">
      <div className="mx-auto max-w-lg rounded-2xl border border-white/10 bg-zinc-900 p-5 shadow-2xl">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="arcade-submit-title" className="text-xl font-semibold text-white">{_copy("copy.3bb8f2fe14a5", { defaultValue: "Submit a game" })}</h2>
            <p className="mt-1 text-sm text-zinc-400">{_copy("copy.3e5561300c75", { defaultValue: "Send us a playable link. We review every game before adding it to the arcade." })}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={_copy("copy.7d9eb7acb13e", { defaultValue: "Close" })} className="rounded-lg p-1 text-zinc-400 hover:text-white"><X size={20} /></button>
        </div>
        {submitted ? (
          <div className="space-y-4 text-sm text-zinc-300">
            <p>{_copy("copy.267b2e7d0261", { defaultValue: "Thanks! Your game is in the review queue. We’ll contact you at the email you provided if we need anything else." })}</p>
            <button type="button" onClick={onClose} className="rounded-lg bg-white px-4 py-2 font-semibold text-black">{_copy("copy.11a6767d5674", { defaultValue: "Done" })}</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <label className="block space-y-1 text-sm text-zinc-300">{_copy("copy.e692895bf7d9", { defaultValue: "Game title" })}<input name="title" value={draft.title} onChange={event => setDraft(previous => ({ ...previous, title: event.target.value }))} required minLength={2} maxLength={100} className={field} />
            </label>
            <label className="block space-y-1 text-sm text-zinc-300">{_copy("copy.6d7fce11ae00", { defaultValue: "Contact email" })}<input name="email" value={draft.email} onChange={event => setDraft(previous => ({ ...previous, email: event.target.value }))} type="email" required maxLength={254} className={field} />
            </label>
            <label className="block space-y-1 text-sm text-zinc-300">{_copy("copy.2f8a6f6edbe4", { defaultValue: "Playable game URL" })}<input name="playable_url" value={draft.playable_url} onChange={event => setDraft(previous => ({ ...previous, playable_url: event.target.value }))} type="url" required pattern="https://.*" placeholder="https://" className={field} />
            </label>
            <label className="block space-y-1 text-sm text-zinc-300">{_copy("copy.ba53cd7eca74", { defaultValue: "Source or project URL " })}<span className="text-zinc-500">{_copy("copy.0059798b7f70", { defaultValue: "(optional)" })}</span>
              <input name="source_url" value={draft.source_url} onChange={event => setDraft(previous => ({ ...previous, source_url: event.target.value }))} type="url" pattern="https://.*" placeholder="https://" className={field} />
            </label>
            <label className="block space-y-1 text-sm text-zinc-300">{_copy("copy.e2a14934eba1", { defaultValue: "About the game" })}<textarea name="description" value={draft.description} onChange={event => setDraft(previous => ({ ...previous, description: event.target.value }))} required minLength={20} maxLength={2000} rows={4} placeholder={_copy("copy.9305968ce5ae", { defaultValue: "What do players do? What makes your game a fit for DeHub?" })} className={field} />
            </label>
            <label className="flex items-start gap-2 text-sm text-zinc-300"><input name="mobile_support" type="checkbox" className="mt-1" />{_copy("copy.9df3732b38d6", { defaultValue: "It plays on phones with touch controls" })}</label>
            <label className="flex items-start gap-2 text-sm text-zinc-300"><input name="rights_confirmed" type="checkbox" required className="mt-1" />{_copy("copy.fb104838db48", { defaultValue: "I own this game or have permission to submit it for review" })}</label>
            {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
            <button type="submit" disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-50">
              {submitting && <Loader2 size={16} className="animate-spin" />}
              {submitting ? _copy("copy.b8ed5279e897", { defaultValue: "Sending…" }) : _copy("copy.f7cb7531a9bf", { defaultValue: "Send for review" })}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

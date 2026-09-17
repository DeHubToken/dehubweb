import { useState, type FormEvent } from 'react';
import { Loader2, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  onClose: () => void;
}

export function ArcadeSubmissionForm({ onClose }: Props) {
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
            <h2 id="arcade-submit-title" className="text-xl font-semibold text-white">Submit a game</h2>
            <p className="mt-1 text-sm text-zinc-400">Send us a playable link. We review every game before adding it to the arcade.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-zinc-400 hover:text-white"><X size={20} /></button>
        </div>
        {submitted ? (
          <div className="space-y-4 text-sm text-zinc-300">
            <p>Thanks! Your game is in the review queue. We’ll contact you at the email you provided if we need anything else.</p>
            <button type="button" onClick={onClose} className="rounded-lg bg-white px-4 py-2 font-semibold text-black">Done</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <label className="block space-y-1 text-sm text-zinc-300">Game title
              <input name="title" required minLength={2} maxLength={100} className={field} />
            </label>
            <label className="block space-y-1 text-sm text-zinc-300">Contact email
              <input name="email" type="email" required maxLength={254} className={field} />
            </label>
            <label className="block space-y-1 text-sm text-zinc-300">Playable game URL
              <input name="playable_url" type="url" required pattern="https://.*" placeholder="https://" className={field} />
            </label>
            <label className="block space-y-1 text-sm text-zinc-300">Source or project URL <span className="text-zinc-500">(optional)</span>
              <input name="source_url" type="url" pattern="https://.*" placeholder="https://" className={field} />
            </label>
            <label className="block space-y-1 text-sm text-zinc-300">About the game
              <textarea name="description" required minLength={20} maxLength={2000} rows={4} placeholder="What do players do? What makes your game a fit for DeHub?" className={field} />
            </label>
            <label className="flex items-start gap-2 text-sm text-zinc-300"><input name="mobile_support" type="checkbox" className="mt-1" />It plays on phones with touch controls</label>
            <label className="flex items-start gap-2 text-sm text-zinc-300"><input name="rights_confirmed" type="checkbox" required className="mt-1" />I own this game or have permission to submit it for review</label>
            {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
            <button type="submit" disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-50">
              {submitting && <Loader2 size={16} className="animate-spin" />}
              {submitting ? 'Sending…' : 'Send for review'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

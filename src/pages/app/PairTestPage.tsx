import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePairSession } from '@/hooks/use-pair-session';

/**
 * Diagnostic surface for the /pair matchmaker.
 *
 * Deliberately unlisted — no nav entry, no chrome. It proves the pieces that
 * media rides on: matchmaking, the signalling relay, and a real peer-to-peer
 * connection carrying data. Text goes over an RTCDataChannel rather than
 * through the server, so a message arriving here means ICE actually
 * established end to end. Adding camera tracks is then the only remaining step.
 *
 * Open it in two browsers signed in as different accounts.
 */
export default function PairTestPage() {
  const { status, messages, peerName, error, relayUsed, canSend, start, next, stop, send } =
    usePairSession();
  const [draft, setDraft] = useState('');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!draft.trim()) return;
    send(draft);
    setDraft('');
  };

  const label: Record<typeof status, string> = {
    idle: 'Not connected',
    queued: 'Looking for someone…',
    matched: 'Matched — negotiating connection…',
    connected: 'Connected',
    error: 'Error',
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-4 p-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">Random pair — connection test</h1>
        <p className="text-sm text-muted-foreground">
          Messages travel over a peer-to-peer data channel, not the server. If one arrives, the
          WebRTC path works.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
        <span className="font-medium">{label[status]}</span>
        {peerName && <span className="text-muted-foreground">with @{peerName}</span>}
        {status === 'connected' && (
          <span className="text-muted-foreground">
            {relayUsed ? 'via TURN relay' : 'direct peer-to-peer'}
          </span>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button onClick={start} disabled={status === 'queued' || status === 'connected'}>
          Start
        </Button>
        <Button variant="secondary" onClick={next} disabled={status === 'idle'}>
          Next
        </Button>
        <Button variant="ghost" onClick={stop} disabled={status === 'idle'}>
          Stop
        </Button>
      </div>

      <div className="min-h-48 flex-1 space-y-2 overflow-y-auto rounded-lg border p-3">
        {messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">No messages yet.</p>
        ) : (
          messages.map((m, i) => (
            <p key={`${m.at}-${i}`} className="text-sm">
              <span className="text-muted-foreground">{m.from === 'me' ? 'You' : 'Them'}: </span>
              {m.text}
            </p>
          ))
        )}
      </div>

      <form onSubmit={submit} className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={canSend ? 'Say something' : 'Waiting for a connection'}
          disabled={!canSend}
        />
        <Button type="submit" disabled={!canSend || !draft.trim()}>
          Send
        </Button>
      </form>
    </div>
  );
}

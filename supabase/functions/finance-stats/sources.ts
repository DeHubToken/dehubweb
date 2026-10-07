/**
 * Every line the money section of dehub.io/stats can show, and the sentence
 * that explains it. Kept apart from index.ts so it can be read without Deno.
 */

import type { FinanceKind } from './ledger.ts';

export type Origin = 'database' | 'api' | 'digitalocean' | 'stripe' | 'config';
export type Status = 'ok' | 'unavailable';

export interface SourceMeta {
  id: string;
  label: string;
  kind: FinanceKind;
  group: string;
  origin: Origin;
  status: Status;
  /** One line on what the figure is and where it is read from. */
  note: string;
}

/** The fixed catalogue. Anything a reader sees on the page is listed here. */
export const CATALOGUE: Omit<SourceMeta, 'status'>[] = [
  // In-app buys
  { id: 'dhb_card', label: 'DHB bought by card', kind: 'revenue', group: 'buys', origin: 'api', note: 'Card purchases of DHB through DeHub Pay that settled and were not refunded, at the amount charged.' },
  { id: 'dhb_crypto', label: 'DHB bought with crypto', kind: 'revenue', group: 'buys', origin: 'api', note: 'Crypto purchases of DHB through DeHub Pay that completed, at the USD value that settled.' },
  { id: 'pro_plans', label: 'Pro plans', kind: 'revenue', group: 'buys', origin: 'stripe', note: 'Paid subscription invoices in Stripe for the Creator, Ultra, Team and Scale plans.' },
  { id: 'ai_generations', label: 'AI generations', kind: 'revenue', group: 'buys', origin: 'database', note: 'DHB paid for image, video, music and 3D generations, less refunds for jobs that failed, plus generations paid from credits.' },
  { id: 'ads', label: 'Ads', kind: 'revenue', group: 'buys', origin: 'database', note: 'Ad budget top-ups, at the USD value recorded when they were paid.' },
  { id: 'post_credits', label: 'Post credits', kind: 'revenue', group: 'buys', origin: 'database', note: 'Social post credit packs, at the USD value recorded when they were paid.' },
  { id: 'post_quota', label: 'Extra posts', kind: 'revenue', group: 'buys', origin: 'api', note: 'DHB settled for posting beyond the free daily allowance.' },
  { id: 'voice_clones', label: 'Voice clones', kind: 'revenue', group: 'buys', origin: 'database', note: 'DHB paid to clone a voice.' },
  { id: 'live_dubbing', label: 'Live dubbing', kind: 'revenue', group: 'buys', origin: 'database', note: 'Settled minutes of live stage dubbing, at the per-minute DHB price.' },
  { id: 'youtube_imports', label: 'YouTube imports', kind: 'revenue', group: 'buys', origin: 'api', note: 'DHB settled to import a YouTube channel.' },
  { id: 'sms_credits', label: 'SMS credits', kind: 'revenue', group: 'buys', origin: 'api', note: 'DHB deposited for SMS notification credits, at the USD value recorded on deposit.' },
  // Fees on other people's money
  { id: 'creator_sub_fees', label: 'Creator subscription fees', kind: 'revenue', group: 'fees', origin: 'api', note: 'The platform fee kept from each fan subscription — 10% with no badge, down to 1% for the top badge.' },
  { id: 'work_fees', label: 'Work marketplace fees', kind: 'revenue', group: 'fees', origin: 'database', note: 'The difference between what a job poster paid and what the worker received, on confirmed payouts.' },
  // Costs
  { id: 'ai_generation_cost', label: 'AI generation providers', kind: 'cost', group: 'compute', origin: 'database', note: 'What fal, kie and Replicate billed for each successful generation — paid and free — worked back from the price and markup it ran at.' },
  { id: 'ai_text_usage', label: 'AI text APIs', kind: 'cost', group: 'compute', origin: 'database', note: 'Metered tokens on paid chat, search and translation routes at list price. Free-tier routes count as zero.' },
  { id: 'digitalocean', label: 'DigitalOcean', kind: 'cost', group: 'infrastructure', origin: 'digitalocean', note: 'DigitalOcean’s own invoices, and its month-to-date usage for the month still running.' },
  { id: 'stripe_fees', label: 'Card processing', kind: 'cost', group: 'payments', origin: 'api', note: 'Stripe’s fee on each card purchase of DHB.' },
];

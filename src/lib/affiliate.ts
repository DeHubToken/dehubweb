import { supabase } from "@/integrations/supabase/client";
import { getAffiliateRef } from "@/lib/affiliateRef";
import { withWalletHeader } from "@/lib/supabase-wallet-client";

export const AFFILIATE_COMMISSION_PCT = 20;
export const AFFILIATE_L1_COMMISSION_PCT = 20;
export const AFFILIATE_L2_COMMISSION_PCT = 5;

const randomCode = (len = 8) => {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
};

export async function getOrCreateAffiliateCode(
  ownerAddress: string,
  shareName?: string | null,
): Promise<{ code: string; share_name: string | null } | null> {
  const addr = ownerAddress.toLowerCase();
  const cleanShareName = shareName?.trim().replace(/^@+/, "").slice(0, 32) || null;
  // @ts-ignore - new table may not yet be in generated Database types
  const { data: existing } = await supabase
    .from("affiliate_codes" as never)
    .select("code,share_name")
    .ilike("owner_address", addr)
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1) as unknown as { data: Array<{ code: string; share_name: string | null }> | null };

  if (existing && existing.length > 0) {
    const current = existing[0];
    if (cleanShareName && current.share_name !== cleanShareName) {
      const { data } = await withWalletHeader(
        // @ts-ignore
        supabase
          .from("affiliate_codes" as never)
          .update({ share_name: cleanShareName } as never)
          .ilike("owner_address", addr)
          .eq("code", current.code)
          .select("code,share_name")
          .maybeSingle(),
        addr,
      ) as unknown as { data: { code: string; share_name: string | null } | null };
      if (data) return data;
    }
    return current;
  }

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode(8);
    const { data, error } = await withWalletHeader(
      // @ts-ignore
      supabase
        .from("affiliate_codes" as never)
        .insert({
          code,
          owner_address: addr,
          share_name: cleanShareName,
          commission_pct: AFFILIATE_COMMISSION_PCT,
        } as never)
        .select("code,share_name")
        .maybeSingle(),
      addr,
    ) as unknown as { data: { code: string; share_name: string | null } | null; error: { message?: string } | null };
    if (!error && data) return data;
  }
  return null;
}

/**
 * Self-attribute the currently signed-in wallet to a cookie-stored referral code.
 * First-touch wins via UNIQUE(referred_address). Safe to call multiple times.
 */
export async function attributeReferralIfPending(referredAddress: string) {
  const code = getAffiliateRef();
  if (!code) return;
  const addr = referredAddress.toLowerCase();

  // @ts-ignore
  const { data: codeRow } = await supabase
    .from("affiliate_codes" as never)
    .select("owner_address")
    .eq("code", code)
    .eq("active", true)
    .maybeSingle() as unknown as { data: { owner_address: string } | null };
  if (!codeRow) return;
  const l1Owner = codeRow.owner_address.toLowerCase();
  if (l1Owner === addr) return; // can't self-refer

  // Look up L2: who referred the L1 owner (if anyone)?
  // @ts-ignore
  const { data: l2Row } = await supabase
    .from("affiliate_referrals" as never)
    .select("owner_address")
    .ilike("referred_address", l1Owner)
    .maybeSingle() as unknown as { data: { owner_address: string } | null };
  const l2Owner = l2Row?.owner_address?.toLowerCase() ?? null;

  await withWalletHeader(
    // @ts-ignore
    supabase
      .from("affiliate_referrals" as never)
      .insert({
        code,
        owner_address: l1Owner,
        referred_address: addr,
        l2_owner_address: l2Owner && l2Owner !== addr ? l2Owner : null,
        source: typeof window !== "undefined" ? window.location.hostname : null,
      } as never),
    addr,
  );
}

/** A single account you referred — the "who", not just the count. */
export type AffiliateReferralEntry = {
  address: string;         // referred wallet address
  createdAt: string | null; // when they were attributed to you
  code: string | null;     // the invite code they came through
};

export type AffiliateStats = {
  code: string | null;
  shareName: string | null;
  referrals: number;        // L1 — directly invited
  l2Referrals: number;      // L2 — invited by your L1s
  l1List: AffiliateReferralEntry[]; // the accounts behind the L1 count
  l2List: AffiliateReferralEntry[]; // the accounts behind the L2 count
  totalEarnedCents: number;
  l1EarnedCents: number;
  l2EarnedCents: number;
  currency: string;
};

// Most-recent referrals returned for the "who" list. The exact total still
// comes from the query's count, so the counter stays accurate past this cap.
const REFERRAL_LIST_CAP = 500;

type ReferralRow = { referred_address: string | null; created_at: string | null; code: string | null };

function mapReferralRows(rows: ReferralRow[] | null): AffiliateReferralEntry[] {
  return (rows ?? [])
    .filter((r): r is ReferralRow & { referred_address: string } => !!r.referred_address)
    .map(r => ({
      address: r.referred_address.toLowerCase(),
      createdAt: r.created_at ?? null,
      code: r.code ?? null,
    }));
}

export async function loadAffiliateStats(ownerAddress: string, shareName?: string | null): Promise<AffiliateStats> {
  const addr = ownerAddress.toLowerCase();

  // All four queries only depend on the address — run them in parallel
  // (this used to be four serial round-trips and made the page feel slow).
  // The referral queries now select the actual rows with an exact count, so a
  // single round-trip yields both the "who" list and the counter total.
  const [codeRes, refRes, l2RefRes, earnRes] = await Promise.all([
    getOrCreateAffiliateCode(addr, shareName),
    // @ts-ignore
    supabase
      .from("affiliate_referrals" as never)
      .select("referred_address,created_at,code", { count: "exact" })
      .ilike("owner_address", addr)
      .order("created_at", { ascending: false })
      .limit(REFERRAL_LIST_CAP) as unknown as Promise<{ data: ReferralRow[] | null; count: number | null }>,
    // @ts-ignore
    supabase
      .from("affiliate_referrals" as never)
      .select("referred_address,created_at,code", { count: "exact" })
      .ilike("l2_owner_address", addr)
      .order("created_at", { ascending: false })
      .limit(REFERRAL_LIST_CAP) as unknown as Promise<{ data: ReferralRow[] | null; count: number | null }>,
    withWalletHeader(
      // @ts-ignore
      supabase
        .from("affiliate_earnings" as never)
        .select("commission_cents,currency,tier"),
      addr,
    ) as unknown as Promise<{ data: Array<{ commission_cents: number; currency: string; tier: number }> | null }>,
  ]);
  const code = codeRes?.code ?? null;

  const l1List = mapReferralRows(refRes.data);
  const l2List = mapReferralRows(l2RefRes.data);

  const rows = earnRes.data ?? [];
  const l1EarnedCents = rows.filter(r => r.tier !== 2).reduce((s, r) => s + (r.commission_cents ?? 0), 0);
  const l2EarnedCents = rows.filter(r => r.tier === 2).reduce((s, r) => s + (r.commission_cents ?? 0), 0);
  const totalEarnedCents = l1EarnedCents + l2EarnedCents;
  const currency = (rows[0]?.currency || "usd").toUpperCase();

  return {
    code,
    shareName: codeRes?.share_name ?? null,
    // Prefer the exact server count; fall back to the fetched rows so a missing
    // count header never silently collapses the counter to zero.
    referrals: refRes.count ?? l1List.length,
    l2Referrals: l2RefRes.count ?? l2List.length,
    l1List,
    l2List,
    totalEarnedCents,
    l1EarnedCents,
    l2EarnedCents,
    currency,
  };
}

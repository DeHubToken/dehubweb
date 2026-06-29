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
  if (codeRow.owner_address.toLowerCase() === addr) return; // can't self-refer

  await withWalletHeader(
    // @ts-ignore
    supabase
      .from("affiliate_referrals" as never)
      .insert({
        code,
        owner_address: codeRow.owner_address.toLowerCase(),
        referred_address: addr,
        source: typeof window !== "undefined" ? window.location.hostname : null,
      } as never),
    addr,
  );
}

export type AffiliateStats = {
  code: string | null;
  shareName: string | null;
  referrals: number;
  totalEarnedCents: number;
  currency: string;
};

export async function loadAffiliateStats(ownerAddress: string, shareName?: string | null): Promise<AffiliateStats> {
  const addr = ownerAddress.toLowerCase();
  const codeRes = await getOrCreateAffiliateCode(addr, shareName);
  const code = codeRes?.code ?? null;

  // @ts-ignore
  const refRes = await supabase
    .from("affiliate_referrals" as never)
    .select("id", { count: "exact", head: true })
    .ilike("owner_address", addr) as unknown as { count: number | null };
  // @ts-ignore
  const earnRes = await withWalletHeader(
    // @ts-ignore
    supabase
      .from("affiliate_earnings" as never)
      .select("commission_cents,currency"),
    addr,
  ) as unknown as { data: Array<{ commission_cents: number; currency: string }> | null };

  const totalEarnedCents = (earnRes.data ?? []).reduce((sum, r) => sum + (r.commission_cents ?? 0), 0);
  const currency = (earnRes.data?.[0]?.currency || "usd").toUpperCase();

  return {
    code,
    shareName: codeRes?.share_name ?? null,
    referrals: refRes.count ?? 0,
    totalEarnedCents,
    currency,
  };
}

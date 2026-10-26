import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/** partner_access_tokens row for Transak, shared by every function instance. */
export function transakTokenStore(db: SupabaseClient) {
  return {
    async read() {
      const { data } = await db.from("partner_access_tokens").select("token, expires_at").eq("partner", "transak").maybeSingle();
      return data ? { token: data.token as string, expiresAt: Date.parse(data.expires_at) } : null;
    },
    async write(token: string, expiresAt: number) {
      await db.from("partner_access_tokens").upsert({
        partner: "transak", token, expires_at: new Date(expiresAt).toISOString(), updated_at: new Date().toISOString(),
      });
    },
  };
}

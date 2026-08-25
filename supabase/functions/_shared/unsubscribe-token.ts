// Get-or-create the unsubscribe token for a recipient address.
//
// The send API rejects a transactional send that carries no unsubscribe_token
// with 400 missing_unsubscribe. Auth-hook sends are exempt because they are
// authorised by their run_id; everything else — support tickets, admin
// invites, email link codes — has to supply one, so process-email-queue mints
// it here just before the send.
//
// email_unsubscribe_tokens is UNIQUE on email, so the token is stable for an
// address across every email it ever receives: that is what makes an
// unsubscribe link still valid when the user clicks it weeks later.

// deno-lint-ignore no-explicit-any
type SupabaseClient = any

export async function getOrCreateUnsubscribeToken(
  supabase: SupabaseClient,
  email: string
): Promise<string | null> {
  const recipient = (email || '').trim().toLowerCase()
  if (!recipient) return null

  const { data: existing, error: readError } = await supabase
    .from('email_unsubscribe_tokens')
    .select('token')
    .eq('email', recipient)
    .maybeSingle()

  if (readError) {
    console.error('Failed to read unsubscribe token', { error: readError })
  }
  if (existing?.token) return existing.token as string

  const token = crypto.randomUUID().replaceAll('-', '')

  const { data: inserted, error: insertError } = await supabase
    .from('email_unsubscribe_tokens')
    .insert({ token, email: recipient })
    .select('token')
    .maybeSingle()

  if (inserted?.token) return inserted.token as string

  // Another worker inserted the row between our read and our write (the
  // dispatcher runs every 5s and can claim overlapping batches). Re-read
  // rather than failing the send.
  const { data: raced } = await supabase
    .from('email_unsubscribe_tokens')
    .select('token')
    .eq('email', recipient)
    .maybeSingle()

  if (raced?.token) return raced.token as string

  console.error('Failed to mint unsubscribe token', { error: insertError })
  return null
}

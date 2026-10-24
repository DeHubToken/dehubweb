/**
 * Profile fields on the server-rendered profile page.
 *
 * The account's label/value lines (dehub-stream-backend src/profile-fields)
 * that are https links get a <link rel="me"> in the page head. That is how
 * another site — a Mastodon profile, a personal page — proves this DeHub
 * profile links back to it: those checks fetch the HTML and run no script,
 * so the client-rendered profile alone would never pass them.
 */

/** The https links among an account's profile fields, at most four. */
export function profileFieldLinks(account) {
  const fields = account && Array.isArray(account.profileFields) ? account.profileFields : [];
  const links = [];
  for (const field of fields.slice(0, 4)) {
    const value = field && typeof field.value === 'string' ? field.value.trim() : '';
    if (!/^https:\/\/\S+$/i.test(value)) continue;
    try {
      links.push(new URL(value).toString());
    } catch {
      // not a link after all
    }
  }
  return links;
}

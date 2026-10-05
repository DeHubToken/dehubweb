/** Compact counts omit viewer flags; the server reports authentication explicitly. */
export function isAnonymousFeedResponse(response: {
  signal?: boolean;
  authenticated?: boolean;
  result?: Array<Record<string, unknown>>;
}): boolean {
  if (response.signal === true) return response.authenticated !== true;
  const rows = response.result || [];
  if (!rows.length) return false;
  return !rows.some(row => ['isLiked', 'isDisliked', 'isSaved', 'isReposted', 'isOwner', 'isUnlocked'].some(field => field in row));
}

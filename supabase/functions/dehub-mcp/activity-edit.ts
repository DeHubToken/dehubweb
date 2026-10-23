type Event = { kind: string; target: string | null; content: string | null; meta: Record<string, any> };

export function matchingComments(items: any[], event: Event, wallet: string): any[] {
  return items.filter(row => !row.notFound && String(row.address ?? row.commenter ?? '').toLowerCase() === wallet.toLowerCase()
    && String(row.content ?? '') === event.content
    && (event.kind !== 'reply' || String(row.parentId ?? row.commentId ?? '') === event.target));
}

/** The caller has authenticated the owner and loaded the event by profile ID. */
export async function correctActivity(db: any, agent: any, event: Event & { id: number }, token: string, action: string, content: unknown) {
  const api = async (path: string, body?: Record<string, unknown>) => {
    const response = await fetch(`https://api.dehub.io/api/${path}`, {
      method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    if (!response.ok || data.result === false || data.success === false) throw new Error(String(data.error ?? 'The change was not accepted.'));
    return data;
  };
  const save = async (changes: Record<string, unknown>) => {
    const result = await db.from('ai_agent_life_events').update(changes).eq('id', event.id).eq('agent_id', agent.id);
    if (result.error) throw new Error('The action changed, but its history could not be refreshed. Reload before trying again.');
  };
  if (action === 'unlike' && event.kind === 'like' && /^\d+$/.test(event.target ?? '')) {
    const current = await api(`nft_info/${event.target}`);
    const post = current.result ?? current;
    if (typeof post.isLiked !== 'boolean') throw new Error('Could not verify the current like. No change was sent.');
    if (post.isLiked) {
      await api('request_vote?vote=true', { streamTokenId: Number(event.target), vote: true });
      const verified = await api(`nft_info/${event.target}`);
      if ((verified.result ?? verified).isLiked !== false) throw new Error('The unlike could not be verified. Refresh before retrying.');
    }
    // Retain the event so the daily runner never likes this post again.
    await save({ meta: { ...event.meta, owner_unliked: true, corrected_at: new Date().toISOString() } });
    return;
  }
  if (action !== 'edit_comment' || !['comment', 'reply'].includes(event.kind)) throw new Error('That activity cannot be edited.');
  if (typeof content !== 'string' || !content.trim() || content.trim().length > 500) throw new Error('Enter a comment between 1 and 500 characters.');
  const post = event.kind === 'reply' ? event.meta.post : event.target;
  if (!/^\d+$/.test(String(post ?? ''))) throw new Error('This activity has no post reference.');
  let commentId = event.meta.comment_id;
  if (!commentId) {
    // Older activity stored only the post. Resolve an exact, unique authored comment.
    const matches = new Map<string, any>();
    for (let page = 0; page < 10; page++) {
      const data = await api(`nft/${post}/comments?page=${page}&limit=50${event.kind === 'reply' && page === 0 ? `&commentId=${encodeURIComponent(event.target!)}` : ''}`);
      const items = data.result?.items ?? [];
      for (const row of matchingComments(items, event, agent.owner_wallet_address)) matches.set(String(row.id ?? row._id), row);
      if (!(data.result?.hasMore ?? items.length >= 50)) break;
      if (page === 9) throw new Error('This older comment could not be safely identified in the available history.');
    }
    if (matches.size !== 1) throw new Error('Could not uniquely identify this comment. No comment was changed.');
    commentId = [...matches.keys()][0];
    await save({ meta: { ...event.meta, comment_id: commentId } });
  }
  if (!/^\d+$/.test(String(commentId))) throw new Error('Invalid comment reference.');
  const result = await api('edit_comment', { commentId: String(commentId), content: content.trim() });
  const edited = (result.result ?? result).comment;
  if (!edited || String(edited.id ?? edited._id) !== String(commentId) || edited.content !== content.trim()) {
    throw new Error('The edit could not be verified. Reload before trying again.');
  }
  await save({ content: content.trim(), meta: { ...event.meta, comment_id: String(commentId), owner_edited: true, corrected_at: new Date().toISOString() } });
}

/**
 * Where to read a fal queue request back from.
 *
 * fal serves status and result under the model's owner/app root, not the full
 * endpoint path the job was submitted to — its own client strips the path the
 * same way. A render sent to `bytedance/seedance-2.5/text-to-video` is read
 * back from `queue.fal.run/bytedance/seedance-2.5/requests/<id>`. Polls built
 * from the full path are what left a paid render sitting in "starting".
 *
 * The submit response carries the exact URLs, so they are stored on the ticket
 * and preferred. The owner/app root only serves tickets written before that.
 */
export function falQueueUrls(
  appId: string,
  requestId: string,
  stored?: { statusUrl?: unknown; responseUrl?: unknown } | null,
): { statusUrl: string; responseUrl: string } {
  const root = `https://queue.fal.run/${appId.split('/').slice(0, 2).join('/')}/requests/${requestId}`;
  return {
    statusUrl: falQueueUrl(stored?.statusUrl) ?? `${root}/status`,
    responseUrl: falQueueUrl(stored?.responseUrl) ?? root,
  };
}

/** The FAL_KEY goes with every poll, so only fal's own queue host is accepted. */
function falQueueUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === 'queue.fal.run' ? value : undefined;
  } catch {
    return undefined;
  }
}

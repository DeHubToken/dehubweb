/**
 * Stage notification copy and routing
 * ===================================
 * One place for "a stage you asked about is live": the sentence and the link.
 *
 * Three surfaces have to agree on both — the row in the notifications list, the
 * in-app toast when it happens while you are looking at the app, and the OS
 * notification when you are not — and they are written in three different
 * files. When they disagree, the bug is invisible in review and obvious in use:
 * a toast that says one thing and a bell row that says another, or a toast that
 * lands somewhere the bell row does not.
 *
 * `content` on these notification rows is deliberately empty (the
 * feature_request_like convention), so the sentence is composed from the type,
 * the actor and reference_title rather than read out of the database.
 */

/**
 * Where a stage notification should land.
 *
 * `reference_id` carries `audio_spaces.short_id` when the stage has one and the
 * uuid when it does not, so the two link shapes are told apart by whether the
 * value is all digits — the same test StageDeepLinkPage uses to resolve it back
 * to a row. With no reference at all the stages index is the honest fallback:
 * the stage is real, we just cannot say which one.
 */
export function stageNotificationPath(referenceId?: string | null): string {
  if (!referenceId) return '/stages';
  return /^\d+$/.test(referenceId) ? `/stages/${referenceId}` : `/stage/${referenceId}`;
}

/** "@alice's stage "Town Hall" is live — tap to listen in" */
export function stageLiveSentence(actorName: string, title?: string | null): string {
  return title
    ? `${actorName}'s stage "${title}" is live — tap to listen in`
    : `${actorName} is live on a stage`;
}

/** ""Town Hall" is starting soon" */
export function stageReminderSentence(title?: string | null): string {
  return title ? `"${title}" is starting soon` : 'A stage you set a reminder for is starting soon';
}

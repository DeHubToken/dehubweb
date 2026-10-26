/**
 * Words on the painted overlay.
 *
 * The painter is not a React tree, so it cannot call useTranslation. It takes
 * a translate function instead — the hook hands it the app's, in the
 * creator's language, which is the language their overlay speaks on every
 * other surface too. Without one it uses i18next directly once that is up,
 * and the English below before it is (and in tests).
 */
import i18n from 'i18next';

export type Translate = (key: string, options?: Record<string, unknown>) => string;

/** English for every key the painter reads, `_one` / `_other` for the counted ones. */
const ENGLISH: Record<string, string> = {
  'liveOverlay.giftedSubs_one': '{{name}} gifted a sub!',
  'liveOverlay.giftedSubs_other': '{{name}} gifted {{count}} subs!',
  'liveOverlay.someone': 'Someone',
  'liveOverlay.newFollower': 'New follower: {{name}}',
  'liveOverlay.newSubscriber': 'New subscriber: {{name}}',
  'liveOverlay.subscribedTo': '{{name}} subscribed to {{plan}}',
  'liveOverlay.shared': '{{name}} shared the stream',
  'liveOverlay.joined': '{{name}} joined',
  'liveOverlay.goalReached': 'Goal reached!',
  'liveOverlay.followersUnit': 'followers',
  'liveOverlay.topSupporters': 'Top supporters',
  'liveOverlay.tipped': '{{name}} sent a gift',
  'liveOverlay.wheelLanded': '{{name}} spun: {{result}}',
  'liveOverlay.subathon': 'Subathon',
  'liveOverlay.subathonOver': "Time's up",
  'liveOverlay.pointsTitle': 'Most loyal viewers',
  'liveOverlay.points_one': '{{formatted}} point',
  'liveOverlay.points_other': '{{formatted}} points',
  'liveOverlay.level': 'Level {{level}}',
  'liveOverlay.streak_one': '{{count}}-week streak',
  'liveOverlay.streak_other': '{{count}}-week streak',
  'liveOverlay.tipJar': 'Gift jar',
  'liveOverlay.poll.closed': 'Voting closed',
  'liveOverlay.poll.votes_one': '{{count}} vote',
  'liveOverlay.poll.votes_other': '{{count}} votes',
  'liveOverlay.poll.howToVote_one': 'Type {{command}} and a number in chat to vote · {{count}} vote',
  'liveOverlay.poll.howToVote_other': 'Type {{command}} and a number in chat to vote · {{count}} votes',
  'liveHype.train.level': 'Hype Train · Level {{level}}',
  'liveHype.train.endedLevel': 'Hype Train finished level {{level}}!',
  'liveHype.train.ended': 'Hype Train ended',
  'liveHype.train.thanks_one': 'Thanks to {{count}} supporter',
  'liveHype.train.thanks_other': 'Thanks to {{count}} supporters',
};

function interpolate(template: string, options: Record<string, unknown> | undefined): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options?.[name] ?? ''));
}

/** English straight from the table above; `defaultValue` for anything not in it (gift tier names). */
export const englishTranslate: Translate = (key, options) => {
  const count = options?.count;
  const counted = typeof count === 'number' ? ENGLISH[`${key}_${count === 1 ? 'one' : 'other'}`] : undefined;
  const template = counted ?? ENGLISH[key] ?? (typeof options?.defaultValue === 'string' ? options.defaultValue : key);
  return interpolate(template, options);
};

/** The app's i18next once it is initialised, English until then. */
export const defaultTranslate: Translate = (key, options) =>
  i18n.isInitialized ? String(i18n.t(key, options as never)) : englishTranslate(key, options);

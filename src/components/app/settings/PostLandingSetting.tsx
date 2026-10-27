/**
 * After you post (Settings → Appearance → Layout): how a new post of your own
 * lands at the top of the feed. Ghost slot unless you pick another; the four
 * styles and their motion live in lib/post-landing.
 */

import { useTranslation } from 'react-i18next';
import Send from '@/components/ui/cut-icons/send';

import { SettingsRow } from '@/components/app/settings/SettingsRow';
import { SettingDrawerSelect } from '@/components/app/settings/SettingDrawerSelect';
import {
  isPostLandingStyle,
  setPostLandingStyle,
  usePostLandingStyle,
} from '@/lib/post-landing';

export function PostLandingSetting() {
  const { t } = useTranslation();
  const style = usePostLandingStyle();
  const title = t('settings.postLanding', 'After you post');

  const options = [
    { value: 'ghost', label: t('settings.postLandingGhost', 'Ghost slot'), description: t('settings.postLandingGhostDesc', 'Your feed makes room and your post fades into place') },
    { value: 'morph', label: t('settings.postLandingMorph', 'Morph'), description: t('settings.postLandingMorphDesc', 'The composer shrinks into your post') },
    { value: 'pill', label: t('settings.postLandingPill', 'Pill to card'), description: t('settings.postLandingPillDesc', 'The upload bar opens out into your post once it is up') },
    { value: 'drop', label: t('settings.postLandingDrop', 'Drop in'), description: t('settings.postLandingDropDesc', 'Your post drops in from the top with a little bounce') },
  ];

  return (
    <SettingsRow
      icon={<Send />}
      anchor="post-landing"
      title={title}
      description={t('settings.postLandingDesc', 'How your new post lands in your feed')}
      action={
        <SettingDrawerSelect
          value={style}
          onValueChange={(value) => { if (isPostLandingStyle(value)) setPostLandingStyle(value); }}
          title={title}
          options={options}
        />
      }
    />
  );
}

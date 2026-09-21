/**
 * Settings entry for the guided walkthrough.
 *
 * The right-rail bento can be put away with its X, and putting something away
 * has to be undoable somewhere obvious or it is just gone. This is that
 * somewhere: it reopens the checklist for a member who has one, and starts one
 * for a member who never took the offer — which is most people, because the
 * offer is only made on the first session of a brand-new account.
 *
 * Renders nothing while signed out, where there is no wallet to hang progress
 * on and the row would only be an error waiting to happen.
 *
 * @module components/app/settings/GettingStartedSetting
 */

import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Compass } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useOnboarding } from '@/contexts/OnboardingChecklistContext';
import { SETTINGS_CONTROL_CLASS, SettingsRow } from '@/components/app/settings/SettingsRow';

export function GettingStartedSetting() {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const onboarding = useOnboarding();

  if (!isAuthenticated || !onboarding) return null;

  const handle = () => {
    onboarding.reopen();
    // The checklist lives in the home rail, so reopening it from here has to
    // take you to where it is — otherwise the button appears to do nothing.
    navigate('/app');
  };

  return (
    <SettingsRow
      icon={<Compass />}
      anchor="getting-started"
      title={t('onboarding.checklist.title')}
      description={
        onboarding.progress
          ? t('onboarding.checklist.progress', {
              done: onboarding.settled,
              total: onboarding.total,
            })
          : t('onboarding.checklist.subtitle')
      }
      action={
        <Button className={SETTINGS_CONTROL_CLASS} onClick={handle}>
          {t('onboarding.checklist.reopen')}
        </Button>
      }
    />
  );
}

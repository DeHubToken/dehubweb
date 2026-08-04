/**
 * Community Manage panel
 * ======================
 * The single admin surface for a community. Every tab is gated on the same
 * ability the server checks, so a control that would be refused never renders;
 * when nothing is permitted the whole dialog collapses to null rather than
 * showing an empty shell.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Settings,
  Shield,
  Users,
  SlidersHorizontal,
  Link2,
  ScrollText,
  History,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCommunityAbilities } from '@/hooks/use-community-admin';
import type { Community, CommunityMember } from '@/hooks/use-communities';

import { AdministratorsTab } from './AdministratorsTab';
import { MembersTab } from './MembersTab';
import { InviteLinksTab } from './InviteLinksTab';
import { RecentActionsTab } from './RecentActionsTab';
import { PermissionsTab } from './PermissionsTab';
import { RulesTab } from './RulesTab';
import { DangerZone } from './DangerZone';

export interface CommunityManageSheetProps {
  community: Community;
  membership: CommunityMember | null | undefined;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

type ManageTabValue =
  | 'admins'
  | 'members'
  | 'permissions'
  | 'invites'
  | 'rules'
  | 'log'
  | 'danger';

interface ManageTab {
  value: ManageTabValue;
  label: string;
  icon: LucideIcon;
  danger?: boolean;
  render: () => ReactNode;
}

export function CommunityManageSheet({
  community,
  membership,
  open,
  onOpenChange,
}: CommunityManageSheetProps) {
  const { t } = useTranslation();
  const abilities = useCommunityAbilities(community, membership);
  const [requested, setRequested] = useState<string>('');

  const closePanel = () => onOpenChange(false);

  const tabs = useMemo<ManageTab[]>(() => {
    const list: ManageTab[] = [];

    if (abilities.can('add_admins')) {
      list.push({
        value: 'admins',
        label: t('communities.manage.tabAdministrators', { defaultValue: 'Administrators' }),
        icon: Shield,
        render: () => <AdministratorsTab community={community} membership={membership} />,
      });
    }
    if (abilities.can('restrict_members')) {
      list.push({
        value: 'members',
        label: t('communities.manage.tabMembers', { defaultValue: 'Members' }),
        icon: Users,
        render: () => <MembersTab community={community} membership={membership} />,
      });
    }
    // Permissions carries privacy, slow mode and the member-rights map, which
    // the server gates on rank as well as change_info — a plain member holding
    // the "change info" toggle must not get this tab.
    if (abilities.canManageSettings) {
      list.push({
        value: 'permissions',
        label: t('communities.manage.tabPermissions', { defaultValue: 'Permissions' }),
        icon: SlidersHorizontal,
        render: () => <PermissionsTab community={community} membership={membership} />,
      });
    }
    if (abilities.can('invite_users')) {
      list.push({
        value: 'invites',
        label: t('communities.manage.tabInvites', { defaultValue: 'Invite links' }),
        icon: Link2,
        render: () => <InviteLinksTab community={community} membership={membership} />,
      });
    }
    if (abilities.can('change_info')) {
      list.push({
        value: 'rules',
        label: t('communities.manage.tabRules', { defaultValue: 'Rules' }),
        icon: ScrollText,
        render: () => <RulesTab community={community} membership={membership} />,
      });
    }
    if (abilities.can('restrict_members')) {
      list.push({
        value: 'log',
        label: t('communities.manage.tabRecentActions', { defaultValue: 'Recent actions' }),
        icon: History,
        render: () => <RecentActionsTab community={community} membership={membership} />,
      });
    }
    if (abilities.isOwner) {
      list.push({
        value: 'danger',
        label: t('communities.manage.tabDangerZone', { defaultValue: 'Danger zone' }),
        icon: AlertTriangle,
        danger: true,
        render: () => (
          <DangerZone community={community} membership={membership} onClosePanel={closePanel} />
        ),
      });
    }

    return list;
    // `closePanel` is a fresh closure every render but only ever calls
    // onOpenChange, which is what the dependency list tracks instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abilities, community, membership, onOpenChange, t]);

  // Derived rather than stored, so a tab that disappears (an ability revoked
  // mid-session) can never leave the panel pointing at nothing.
  const activeValue = tabs.some(tab => tab.value === requested)
    ? requested
    : (tabs[0]?.value ?? '');

  if (tabs.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 pt-2 sm:pt-0 gap-0 flex flex-col overflow-y-hidden max-h-[85vh] sm:max-h-[85vh] sm:max-w-2xl">
        <DialogHeader className="px-4 pt-4 pb-3 pr-12 border-b border-white/10 shrink-0">
          <DialogTitle className="text-white font-medium text-sm flex items-center gap-2 min-w-0">
            <Settings className="w-4 h-4 text-zinc-400 shrink-0" />
            <span className="truncate">{community.name}</span>
            <span className="text-zinc-600" aria-hidden="true">·</span>
            <span className="text-zinc-400 font-normal shrink-0">
              {t('communities.manage.title', { defaultValue: 'Manage' })}
            </span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            {t('communities.manage.description', {
              defaultValue: 'Administration settings for this community.',
            })}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeValue}
          onValueChange={setRequested}
          orientation="vertical"
          className="flex flex-col sm:flex-row flex-1 min-h-0"
        >
          <TabsList className="flex h-auto shrink-0 justify-start gap-1 rounded-none bg-transparent p-2 flex-row overflow-x-auto sm:flex-col sm:w-48 sm:overflow-x-visible sm:overflow-y-auto sm:border-r sm:border-white/10">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className={`w-auto sm:w-full shrink-0 justify-start gap-2 rounded-xl px-3 py-2 text-sm font-normal transition-colors data-[state=active]:shadow-none data-[state=active]:bg-white/[0.08] ${
                    tab.danger
                      ? 'text-red-400 hover:bg-red-500/15 data-[state=active]:text-red-400'
                      : 'text-zinc-400 hover:bg-white/[0.06] data-[state=active]:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {tabs.map(tab => (
            <TabsContent
              key={tab.value}
              value={tab.value}
              className="mt-0 flex-1 min-h-0 overflow-y-auto p-3.5 focus-visible:ring-0 focus-visible:ring-offset-0"
            >
              {/* Radix unmounts inactive content, so a tab's queries only ever
                  fire once the user opens it. */}
              {tab.render()}
            </TabsContent>
          ))}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

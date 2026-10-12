import { useState } from 'react';
import { useTranslation as _useCopy, useTranslation } from 'react-i18next';
import { Clock, Loader2 } from "lucide-react";
import UserPlus from "@/components/ui/cut-icons/add-account";
import Check from "@/components/ui/cut-icons/check";

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import type { ProfileHeaderProps } from './ProfileHeader';

export type ProfileFollowProps = Pick<ProfileHeaderProps, 'profile' | 'apiProfile' | 'isViewingOwnProfile' | 'isBlocked' | 'isFetchingProfile' | 'isFollowing' | 'isPending' | 'isTargetPrivate' | 'isFollowLoading' | 'handleFollow' | 'handleUnfollow'>;

export function ProfileFollowButton({ profile, apiProfile, isViewingOwnProfile, isBlocked, isFetchingProfile, isFollowing, isPending, isTargetPrivate, isFollowLoading, handleFollow, handleUnfollow }: ProfileFollowProps) {
  const { t: _copy } = _useCopy();
  const { t } = useTranslation();
  const [showUnfollowConfirm, setShowUnfollowConfirm] = useState(false);
  if (isViewingOwnProfile || isBlocked) return null;
  if (isFetchingProfile && profile.isFollowing == null && profile.isPending == null) return <Skeleton className="h-9 w-24 rounded-xl bg-white/10" />;
  return <>

                  {isPending && !isFollowing && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-xl border-zinc-600 text-zinc-300 gap-2 cursor-default"
                      disabled
                    >
                      <Clock className="w-4 h-4" />{_copy("copy.2d9e28289fac", { defaultValue: "Requested" })}</Button>
                  )}
                  {!isFollowing && !isPending && (
                    <Button
                      size="sm"
                      variant="glass"
                      className="rounded-xl gap-2"
                      onClick={handleFollow}
                      disabled={isFollowLoading}
                    >
                      {isFollowLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <UserPlus className="w-4 h-4" />
                      )}
                      {isTargetPrivate ? _copy("copy.59f03d642b41", { defaultValue: "Request" }) : apiProfile?.followsYou ? _copy("copy.fd3fdb5a65ea", { defaultValue: "Follow Back" }) : _copy("copy.641d1ef657bd", { defaultValue: "Follow" })}
                    </Button>
                  )}
                  {isFollowing && (
                    <Button
                      size="sm"
                      variant="glass"
                      className="rounded-xl gap-2"
                      onClick={() => setShowUnfollowConfirm(true)}
                      disabled={isFollowLoading}
                    >
                      {isFollowLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Check className="w-4 h-4" />
                      )}
                      {t('profile.following')}
                    </Button>
                  )}

      {/* Unfollow confirmation */}
      <AlertDialog open={showUnfollowConfirm} onOpenChange={setShowUnfollowConfirm}>
        <AlertDialogContent className="bg-black/60 backdrop-blur-[24px] border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">{_copy("copy.3951eec8fb35", { defaultValue: "Unfollow " })}{profile.name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-white/50">{_copy("copy.34684f511879", { defaultValue: "You will no longer see their posts in your feed." })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/[0.06] backdrop-blur-sm border-white/10 text-white hover:bg-white/[0.12]">{_copy("copy.19766ed6ccb2", { defaultValue: "Cancel" })}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500/20 backdrop-blur-sm border border-red-500/30 text-red-400 hover:bg-red-500/30"
              onClick={() => {
                handleUnfollow();
                setShowUnfollowConfirm(false);
              }}
            >{_copy("copy.778d568e8819", { defaultValue: "Unfollow" })}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
  </>;
}

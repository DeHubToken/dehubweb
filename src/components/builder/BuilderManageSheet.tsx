/**
 * Owner controls for a Builder app, opened from its preview page: the app's
 * own address (<slug>.dhb.gg), public/private, publishing to the DeHub app
 * store, and every saved version with one-tap restore.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  BUILDER_APPS_DOMAIN,
  builderApi,
  builderAppUrl,
  type BuilderListing,
  type BuilderProject,
  type BuilderVersion,
} from '@/lib/builder/api';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: BuilderProject;
  listing: BuilderListing | null;
  /** Re-read the project after any change (the preview reloads with it). */
  onChanged: () => void;
}

export function BuilderManageSheet({ open, onOpenChange, project, listing, onChanged }: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState<string | null>(null);
  const [slug, setSlug] = useState(project.slug ?? '');
  const [versions, setVersions] = useState<BuilderVersion[] | null>(null);

  useEffect(() => setSlug(project.slug ?? ''), [project.slug]);

  const loadVersions = useCallback(() => {
    builderApi.versions(project.id).then((r) => setVersions(r.versions)).catch(() => setVersions([]));
  }, [project.id]);

  useEffect(() => {
    if (open) loadVersions();
  }, [open, loadVersions, project.version]);

  const run = async (key: string, fn: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    try {
      await fn();
      if (done) toast.success(done);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const url = project.slug ? builderAppUrl(project.slug) : null;
  const published = !!listing?.published;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {project.emoji} {project.name}
          </SheetTitle>
        </SheetHeader>

        <section className="mt-6 space-y-2">
          <h3 className="text-sm font-medium">{t('builder.manage.address')}</h3>
          {url && (
            <div className="flex items-center gap-2">
              <a href={url} target="_blank" rel="noreferrer" className="text-sm underline truncate">
                {url}
              </a>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => navigator.clipboard.writeText(url).then(() => toast.success(t('builder.manage.copied')))}
              >
                {t('builder.manage.copy')}
              </Button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              maxLength={40}
              aria-label={t('builder.manage.address')}
            />
            <span className="text-sm text-muted-foreground whitespace-nowrap">.{BUILDER_APPS_DOMAIN}</span>
            <Button
              size="sm"
              disabled={!slug || slug === project.slug || busy !== null}
              onClick={() => run('slug', () => builderApi.setSlug(project.id, slug), t('builder.manage.addressSaved'))}
            >
              {t('builder.manage.save')}
            </Button>
          </div>
        </section>

        <section className="mt-6 flex items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-medium">{t('builder.manage.public')}</h3>
            <p className="text-xs text-muted-foreground">
              {project.is_public ? t('builder.manage.publicHint') : t('builder.manage.privateHint')}
            </p>
          </div>
          <Switch
            checked={project.is_public}
            disabled={busy !== null}
            onCheckedChange={(v) => run('visibility', () => builderApi.setVisibility(project.id, v))}
          />
        </section>

        <section className="mt-6 space-y-2">
          <h3 className="text-sm font-medium">{t('builder.manage.store')}</h3>
          {published ? (
            <>
              <p className="text-xs text-muted-foreground">
                {listing?.tier === 'unlisted' ? t('builder.manage.inStoreUnreviewed') : t('builder.manage.inStore')}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" asChild>
                  <a href={`/apps/${listing!.slug}`}>{t('builder.manage.viewInStore')}</a>
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy !== null}
                  onClick={() => run('unpublish', () => builderApi.unpublish(project.id), t('builder.manage.unpublished'))}
                >
                  {t('builder.manage.unpublish')}
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">{t('builder.manage.publishHint')}</p>
              <Button
                size="sm"
                disabled={busy !== null || project.version < 1}
                onClick={() => run('publish', () => builderApi.publish(project.id), t('builder.manage.publishedToast'))}
              >
                {t('builder.manage.publish')}
              </Button>
            </>
          )}
        </section>

        <section className="mt-6 space-y-2">
          <h3 className="text-sm font-medium">{t('builder.manage.versions')}</h3>
          {versions === null ? null : versions.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('builder.manage.noVersions')}</p>
          ) : (
            <ul className="space-y-2">
              {versions.map((v) => (
                <li key={v.version} className="flex items-start justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium">
                      v{v.version} · {new Date(v.created_at).toLocaleString()}
                    </div>
                    {v.summary && <div className="text-xs text-muted-foreground line-clamp-2">{v.summary}</div>}
                  </div>
                  {v.version === project.version ? (
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{t('builder.manage.current')}</span>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy !== null}
                      onClick={() =>
                        run('restore', () => builderApi.restore(project.id, v.version), t('builder.manage.restored', { version: v.version }))
                      }
                    >
                      {t('builder.manage.restore')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </SheetContent>
    </Sheet>
  );
}

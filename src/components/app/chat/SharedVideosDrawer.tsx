/**
 * SharedVideosDrawer Component
 * =============================
 * Displays shared videos in a DM conversation as a grid inside a drawer.
 */

import { useState, useEffect } from 'react';
import { Video, Loader2, Play } from 'lucide-react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';
import { getDMVideos, getMediaUrl } from '@/lib/api/dehub';

interface SharedVideo {
  id: string;
  url: string;
  thumbnail?: string;
  createdAt?: string;
}

interface SharedVideosDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SharedVideosDrawer({ open, onOpenChange }: SharedVideosDrawerProps) {
  const [videos, setVideos] = useState<SharedVideo[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIsLoading(true);
    getDMVideos(0, 50)
      .then(({ items }) => {
        const mapped = items.map((v: any) => ({
          id: v._id || v.id || Math.random().toString(),
          url: getMediaUrl(v.url || v.videoUrl || v.mediaUrl) || '',
          thumbnail: getMediaUrl(v.thumbnail || v.thumbnailUrl) || undefined,
          createdAt: v.createdAt || v.created_at,
        }));
        setVideos(mapped);
      })
      .catch(() => setVideos([]))
      .finally(() => setIsLoading(false));
  }, [open]);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent glass className="px-4 pb-8 max-h-[70vh]">
        <DrawerHeader className="border-b border-white/10 mb-4">
          <DrawerTitle className="text-white flex items-center gap-2">
            <Video className="w-5 h-5" />
            Shared Videos
          </DrawerTitle>
        </DrawerHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
          </div>
        ) : videos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-500 gap-2">
            <Video className="w-10 h-10 text-zinc-700" />
            <p className="text-sm">No shared videos yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 overflow-y-auto">
            {videos.map((video) => (
              <a
                key={video.id}
                href={video.url}
                target="_blank"
                rel="noopener noreferrer"
                className="relative aspect-video rounded-xl overflow-hidden bg-zinc-800 group hover:ring-2 hover:ring-white/20 transition-all"
              >
                {video.thumbnail ? (
                  <img
                    src={video.thumbnail}
                    alt="Video thumbnail"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-zinc-800">
                    <Video className="w-8 h-8 text-zinc-600" />
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="w-10 h-10 rounded-xl bg-black/60 backdrop-blur-sm flex items-center justify-center border border-white/10">
                    <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
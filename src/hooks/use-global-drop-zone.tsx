import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';

interface GlobalDropZoneContextType {
  isPostModalOpen: boolean;
  openPostModal: () => void;
  closePostModal: () => void;
  pendingFiles: FileList | null;
  clearPendingFiles: () => void;
  suppressGlobalDrop: () => void;
  unsuppressGlobalDrop: () => void;
}

const GlobalDropZoneContext = createContext<GlobalDropZoneContextType | null>(null);

export function GlobalDropZoneProvider({ children }: { children: ReactNode }) {
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<FileList | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSuppressed, setIsSuppressed] = useState(false);
  const suppressCountRef = useRef(0);

  const openPostModal = useCallback(() => {
    setIsPostModalOpen(true);
  }, []);

  const closePostModal = useCallback(() => {
    setIsPostModalOpen(false);
  }, []);

  const clearPendingFiles = useCallback(() => {
    setPendingFiles(null);
  }, []);

  const suppressGlobalDrop = useCallback(() => {
    suppressCountRef.current += 1;
    setIsSuppressed(true);
  }, []);

  const unsuppressGlobalDrop = useCallback(() => {
    suppressCountRef.current -= 1;
    if (suppressCountRef.current <= 0) {
      suppressCountRef.current = 0;
      setIsSuppressed(false);
    }
  }, []);

  // Global drag and drop handlers - only attach when NOT suppressed
  useEffect(() => {
    if (isSuppressed) {
      // Don't attach any global drag/drop listeners when suppressed
      setIsDragging(false);
      return;
    }

    let dragCounter = 0;

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter++;
      
      if (e.dataTransfer?.types.includes('Files')) {
        setIsDragging(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter--;
      
      if (dragCounter === 0) {
        setIsDragging(false);
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter = 0;
      setIsDragging(false);

      const files = e.dataTransfer?.files;
      if (files && files.length > 0) {
        const hasMedia = Array.from(files).some(file => 
          file.type.startsWith('image/') || 
          file.type.startsWith('video/') || 
          file.type.startsWith('audio/')
        );

        if (hasMedia) {
          setPendingFiles(files);
          setIsPostModalOpen(true);
        }
      }
    };

    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);

    return () => {
      document.removeEventListener('dragenter', handleDragEnter);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('drop', handleDrop);
    };
  }, [isSuppressed]);

  return (
    <GlobalDropZoneContext.Provider value={{ 
      isPostModalOpen, 
      openPostModal, 
      closePostModal, 
      pendingFiles, 
      clearPendingFiles,
      suppressGlobalDrop,
      unsuppressGlobalDrop,
    }}>
      {children}
      
      {/* Global drop overlay */}
      {isDragging && !isSuppressed && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="border-2 border-dashed border-white/40 rounded-3xl p-12 flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-xl bg-white/10 flex items-center justify-center">
              <svg 
                className="w-8 h-8 text-white" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeWidth={2} 
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" 
                />
              </svg>
            </div>
            <p className="text-xl font-semibold text-white">Drop to create post</p>
            <p className="text-sm text-zinc-400">Images, videos, or audio files</p>
          </div>
        </div>
      )}
    </GlobalDropZoneContext.Provider>
  );
}

export function useGlobalDropZone() {
  const context = useContext(GlobalDropZoneContext);
  if (!context) {
    throw new Error('useGlobalDropZone must be used within GlobalDropZoneProvider');
  }
  return context;
}

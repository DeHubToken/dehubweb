/**
 * Post Page Redirect
 * ==================
 * Redirects /app/post/:postId to home with the post pinned at top.
 * Uses URL search params so the pinned post persists after refresh.
 * 
 * @module pages/app/PostPage
 */

import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

export default function PostPage() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (postId) {
      // Navigate to home with postId as URL param (persists on refresh)
      navigate(`/app?post=${postId}`, { replace: true });
    }
  }, [postId, navigate]);

  // Show brief loading while redirecting
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-8 h-8 text-white animate-spin" />
    </div>
  );
}

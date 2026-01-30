/**
 * Post Page Redirect
 * ==================
 * Redirects /app/post/:postId to home with the post pinned at top.
 * This provides a seamless experience where shared posts appear
 * as the first item in the feed.
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
      // Navigate to home with the postId in state
      // This will cause HomePage to render that post first
      navigate('/app', { 
        state: { pinnedPostId: postId },
        replace: true // Replace history entry so back button works naturally
      });
    }
  }, [postId, navigate]);

  // Show brief loading while redirecting
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="w-8 h-8 text-white animate-spin" />
    </div>
  );
}

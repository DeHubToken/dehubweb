import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-wallet-address',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
};

interface StoryRecord {
  id: string;
  wallet_address: string;
  username: string | null;
  avatar: string | null;
  video_url: string;
  thumbnail_url: string | null;
  created_at: string;
  expires_at: string;
}

interface ApiResponse<T> {
  status: boolean;
  result: T | null;
  message: string;
}

function jsonResponse<T>(data: ApiResponse<T>, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ status: false, result: null, message }, status);
}

function successResponse<T>(result: T, message = 'Success'): Response {
  return jsonResponse({ status: true, result, message });
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const url = new URL(req.url);
  const walletAddress = req.headers.get('x-wallet-address')?.toLowerCase() || '';
  const pathname = url.pathname;

  try {
    // ============ VIEWS ENDPOINTS ============
    // GET /views?story_id=xxx - Get view count for a story
    if (req.method === 'GET' && pathname.endsWith('/views')) {
      const storyId = url.searchParams.get('story_id');
      if (!storyId) {
        return errorResponse('story_id is required');
      }

      console.log(`[stories-api] GET view count for story: ${storyId}`);
      const { count, error } = await supabase
        .from('story_views')
        .select('*', { count: 'exact', head: true })
        .eq('story_id', storyId);

      if (error) {
        console.error('[stories-api] Error fetching view count:', error);
        return errorResponse('Failed to fetch view count', 500);
      }

      return successResponse({ count: count || 0 });
    }

    // POST /views - Record a view (no auth required - anyone can view)
    if (req.method === 'POST' && pathname.endsWith('/views')) {
      const body = await req.json();
      // Use wallet address if provided, otherwise generate anonymous viewer ID
      const viewerWallet = walletAddress || `anon-${crypto.randomUUID()}`;
      const { story_id } = body;

      if (!story_id) {
        return errorResponse('story_id is required');
      }

      console.log(`[stories-api] POST record view for story: ${story_id} by ${viewerWallet}`);

      // Simple insert — every call = 1 new view row
      const { error } = await supabase
        .from('story_views')
        .insert({
          story_id,
          viewer_wallet_address: viewerWallet,
        });

      if (error) {
        console.error('[stories-api] Error recording view:', error);
        return errorResponse('Failed to record view', 500);
      }

      return successResponse({ recorded: true }, 'View recorded');
    }

    // ============ STORIES ENDPOINTS ============
    // GET - List or fetch stories
    if (req.method === 'GET') {
      const id = url.searchParams.get('id');
      const filterWallet = url.searchParams.get('wallet_address')?.toLowerCase();

      // Get single story by ID
      if (id) {
        console.log(`[stories-api] GET single story: ${id}`);
        const { data, error } = await supabase
          .from('stories')
          .select('*')
          .eq('id', id)
          .gt('expires_at', new Date().toISOString())
          .single();

        if (error || !data) {
          console.error('[stories-api] Story not found:', error);
          return errorResponse('Story not found', 404);
        }

        return successResponse(data as StoryRecord);
      }

      // Get stories by wallet address
      if (filterWallet) {
        console.log(`[stories-api] GET stories for wallet: ${filterWallet}`);
        const { data, error } = await supabase
          .from('stories')
          .select('*')
          .eq('wallet_address', filterWallet)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false });

        if (error) {
          console.error('[stories-api] Error fetching user stories:', error);
          return errorResponse('Failed to fetch stories', 500);
        }

        return successResponse(data as StoryRecord[]);
      }

      // Get all active stories
      console.log('[stories-api] GET all active stories');
      const { data, error } = await supabase
        .from('stories')
        .select('*')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[stories-api] Error fetching stories:', error);
        return errorResponse('Failed to fetch stories', 500);
      }

      return successResponse(data as StoryRecord[]);
    }

    // POST - Create a new story
    if (req.method === 'POST') {
      if (!walletAddress) {
        return errorResponse('x-wallet-address header is required', 401);
      }

      const body = await req.json();
      const { video_url, thumbnail_url, username, avatar } = body;

      if (!video_url) {
        return errorResponse('video_url is required');
      }

      console.log(`[stories-api] POST create story for wallet: ${walletAddress}`);

      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      const { data, error } = await supabase
        .from('stories')
        .insert({
          wallet_address: walletAddress,
          video_url,
          thumbnail_url: thumbnail_url || null,
          username: username || null,
          avatar: avatar || null,
          expires_at: expiresAt.toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error('[stories-api] Error creating story:', error);
        return errorResponse('Failed to create story', 500);
      }

      console.log(`[stories-api] Story created: ${data.id}`);
      return successResponse(data as StoryRecord, 'Story created successfully');
    }

    // DELETE - Delete own story
    if (req.method === 'DELETE') {
      if (!walletAddress) {
        return errorResponse('x-wallet-address header is required', 401);
      }

      const id = url.searchParams.get('id');
      if (!id) {
        return errorResponse('id query parameter is required');
      }

      console.log(`[stories-api] DELETE story: ${id} by wallet: ${walletAddress}`);

      // First verify ownership
      const { data: existing, error: fetchError } = await supabase
        .from('stories')
        .select('wallet_address')
        .eq('id', id)
        .single();

      if (fetchError || !existing) {
        console.error('[stories-api] Story not found for deletion:', fetchError);
        return errorResponse('Story not found', 404);
      }

      if (existing.wallet_address.toLowerCase() !== walletAddress) {
        console.error('[stories-api] Unauthorized delete attempt');
        return errorResponse('You can only delete your own stories', 403);
      }

      const { error: deleteError } = await supabase
        .from('stories')
        .delete()
        .eq('id', id);

      if (deleteError) {
        console.error('[stories-api] Error deleting story:', deleteError);
        return errorResponse('Failed to delete story', 500);
      }

      console.log(`[stories-api] Story deleted: ${id}`);
      return successResponse({ id }, 'Story deleted successfully');
    }

    return errorResponse('Method not allowed', 405);
  } catch (err) {
    console.error('[stories-api] Unexpected error:', err);
    return errorResponse('Internal server error', 500);
  }
});

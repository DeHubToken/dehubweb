import { useContext, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '@/contexts/AuthContext';
import { isOwnProfileAlias, setOwnProfileHandle } from '@/lib/own-profile-path';

/**
 * Keeps your own profile's address at /<your username>.
 *
 * Call once, high in the app layout, BEFORE anything matches routes: the
 * handle is set during render so the cached-page matching in the same pass
 * already knows /<you> is your own profile.
 *
 * /profile and /app/profile (nav, old links, the app) are swapped in place for
 * /<you>, keeping ?tab= and the hash, with no extra back-button entry.
 * /profile?id=… is someone else's profile and is left to the profile page,
 * which already moves it to their username.
 */
export function useOwnProfileUrl(): void {
  // useContext rather than useAuth: the state gallery renders without an AuthProvider.
  const auth = useContext(AuthContext);
  const handle = auth?.isAuthenticated ? auth.user?.username ?? null : null;
  setOwnProfileHandle(handle);

  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!handle || !isOwnProfileAlias(location.pathname)) return;
    const params = new URLSearchParams(location.search);
    if (params.has('id')) return;
    navigate(
      { pathname: `/${handle.replace(/^@+/, '')}`, search: location.search, hash: location.hash },
      { replace: true, state: location.state },
    );
  }, [handle, location.pathname, location.search, location.hash, location.state, navigate]);
}

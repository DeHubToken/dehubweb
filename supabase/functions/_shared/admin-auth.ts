// The godmode panel's admin JWT, verified the way admin-stages verifies it: by
// asking GET /api/admin/me who it belongs to, so a revoked token stops working
// here the moment it stops working everywhere else and no admin secret is
// copied into this project.

const ADMIN_API_BASE = Deno.env.get('ADMIN_API_BASE') || 'https://api.dehub.io';
const ADMIN_VERIFY_TIMEOUT_MS = 8_000;

export interface PanelAdmin { id: string; email: string; role: string }

export class AdminAuthError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export async function requirePanelAdmin(req: Request, roles: string[]): Promise<PanelAdmin> {
  const authorization = req.headers.get('authorization') || '';
  if (!authorization.toLowerCase().startsWith('bearer ')) throw new AdminAuthError(401, 'Missing authorization token');

  let response: Response;
  try {
    response = await fetch(`${ADMIN_API_BASE}/api/admin/me`, {
      headers: { Authorization: authorization },
      signal: AbortSignal.timeout(ADMIN_VERIFY_TIMEOUT_MS),
    });
  } catch (e) {
    // Unreachable is not "not an admin": that would log the operator out over a blip.
    throw new AdminAuthError(503, `Could not reach the admin API: ${(e as Error).message}`);
  }
  if (response.status === 401 || response.status === 400) throw new AdminAuthError(401, 'Authentication required');
  if (!response.ok) throw new AdminAuthError(503, `Admin API rejected the check (${response.status})`);

  const body = await response.json().catch(() => null);
  const admin = body?.admin;
  if (!admin?._id && !admin?.id) throw new AdminAuthError(401, 'Authentication required');
  if (admin.isActive === false) throw new AdminAuthError(403, 'This admin account is disabled');
  const role = String(admin.role || '').toUpperCase();
  if (!roles.includes(role)) throw new AdminAuthError(403, 'Not permitted');
  return { id: String(admin._id || admin.id), email: admin.email || '', role };
}

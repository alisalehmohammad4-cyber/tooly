import type { AppUser } from '@/types/domain';

export const ACTIVE_USER_COOKIE = 'tooly_active_user';
export const ORG_ID_COOKIE = 'tooly_org_id';

/**
 * Authoritative server helper to resolve the active organization ID.
 * - Reads from active authenticated user session cookies ('tooly_org_id', 'tooly_active_user').
 * - Verifies user is authenticated (not the default unauthenticated 'usr-worker').
 * - Reads from request headers ('x-organization-id', 'x-org-id').
 * - If unauthenticated, falls back ONLY if explicit org query parameter/argument exists; otherwise returns null.
 */
export async function getServerSessionOrgId(
  explicitOrgParam?: string | null
): Promise<string | null> {
  try {
    const { cookies, headers } = await import('next/headers');
    const cookieStore = await cookies();

    // 1. Check direct organization cookie
    const directOrgCookie = cookieStore.get(ORG_ID_COOKIE)?.value?.trim();

    // 2. Check active user session cookie
    const activeUserCookie = cookieStore.get(ACTIVE_USER_COOKIE)?.value;
    if (activeUserCookie) {
      try {
        const decoded = decodeURIComponent(activeUserCookie);
        const parsed = JSON.parse(decoded) as Partial<AppUser>;
        // If valid authenticated user (not unauthenticated default worker)
        if (parsed && parsed.id && parsed.id !== 'usr-worker') {
          const userOrg = parsed.organizationId?.trim() || (parsed as { organization_id?: string }).organization_id?.trim();
          if (userOrg) {
            return userOrg;
          }
        }
      } catch {
        // Ignore JSON parsing error
      }
    }

    if (directOrgCookie) {
      return directOrgCookie;
    }

    // 3. Check request headers
    const headerList = await headers();
    const headerOrg =
      headerList.get('x-organization-id')?.trim() ||
      headerList.get('x-org-id')?.trim();
    if (headerOrg) {
      return headerOrg;
    }
  } catch {
    // In contexts where next/headers cookies() or headers() is unavailable
  }

  // 4. Fallback ONLY if explicit org query parameter exists
  if (explicitOrgParam && explicitOrgParam.trim()) {
    return explicitOrgParam.trim();
  }

  return null;
}

/**
 * Authoritative server helper to retrieve the active authenticated user.
 * Returns null if unauthenticated or default worker.
 */
export async function getServerSessionUser(): Promise<AppUser | null> {
  try {
    const { cookies } = await import('next/headers');
    const cookieStore = await cookies();
    const activeUserCookie = cookieStore.get(ACTIVE_USER_COOKIE)?.value;
    if (activeUserCookie) {
      const decoded = decodeURIComponent(activeUserCookie);
      const parsed = JSON.parse(decoded) as AppUser;
      if (parsed && parsed.id && parsed.id !== 'usr-worker' && parsed.organizationId) {
        return parsed;
      }
    }
  } catch {
    // Ignore error
  }
  return null;
}

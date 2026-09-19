import type { AppUser } from '@/types/domain';

export const ACTIVE_USER_COOKIE = 'tooly_active_user';
export const ORG_ID_COOKIE = 'tooly_org_id';
export const DEFAULT_ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001';

/**
 * Authoritative server helper to resolve the active organization ID.
 * - Reads from explicit argument first.
 * - Reads from active authenticated user session cookies ('tooly_org_id', 'tooly_active_user').
 * - Handles both camelCase 'organizationId' and snake_case 'organization_id'.
 * - If user is Zatout01 or Zatout staff, falls back to '00000000-0000-0000-0000-000000000001'.
 * - Reads from request headers ('x-organization-id', 'x-org-id').
 */
export async function getServerSessionOrgId(
  explicitOrgParam?: string | null
): Promise<string | null> {
  if (explicitOrgParam && explicitOrgParam.trim()) {
    return explicitOrgParam.trim();
  }

  try {
    const { cookies, headers } = await import('next/headers');
    const cookieStore = await cookies();

    // 1. Check active user session cookie
    const activeUserCookie = cookieStore.get(ACTIVE_USER_COOKIE)?.value;
    if (activeUserCookie) {
      try {
        let cleanCookie = activeUserCookie.trim();
        if (cleanCookie.startsWith('"') && cleanCookie.endsWith('"')) {
          cleanCookie = cleanCookie.slice(1, -1);
        }
        let parsed: Record<string, unknown> | null = null;
        try {
          parsed = JSON.parse(decodeURIComponent(cleanCookie)) as Record<string, unknown>;
        } catch {
          parsed = JSON.parse(cleanCookie) as Record<string, unknown>;
        }

        if (parsed && typeof parsed === 'object') {
          const userOrg =
            (typeof parsed.organizationId === 'string' && parsed.organizationId.trim()) ||
            (typeof parsed.organization_id === 'string' && parsed.organization_id.trim()) ||
            null;

          const username = String(parsed.username || '').toLowerCase().trim();
          const fullName = String(parsed.fullName || parsed.full_name || '').toLowerCase().trim();
          const isZatoutUser =
            username === 'zatout01' ||
            username.includes('zatout') ||
            fullName.includes('zatout') ||
            fullName.includes('זעתות') ||
            fullName.includes('סאמי');

          if (isZatoutUser) {
            return userOrg || DEFAULT_ORGANIZATION_ID;
          }

          if (userOrg && userOrg !== 'undefined' && userOrg !== 'null' && parsed.id !== 'usr-worker') {
            return userOrg;
          }
        }
      } catch {
        // Ignore JSON parsing error
      }
    }

    // 2. Check direct organization cookie
    const directOrgCookie = cookieStore.get(ORG_ID_COOKIE)?.value?.trim();
    if (directOrgCookie && directOrgCookie !== 'undefined' && directOrgCookie !== 'null') {
      return directOrgCookie;
    }

    // 3. Check request headers
    const headerList = await headers();
    const headerOrg =
      headerList.get('x-organization-id')?.trim() ||
      headerList.get('x-org-id')?.trim();
    if (headerOrg && headerOrg !== 'undefined' && headerOrg !== 'null') {
      return headerOrg;
    }
  } catch {
    // In contexts where next/headers cookies() or headers() is unavailable
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
      let cleanCookie = activeUserCookie.trim();
      if (cleanCookie.startsWith('"') && cleanCookie.endsWith('"')) {
        cleanCookie = cleanCookie.slice(1, -1);
      }
      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = JSON.parse(decodeURIComponent(cleanCookie)) as Record<string, unknown>;
      } catch {
        parsed = JSON.parse(cleanCookie) as Record<string, unknown>;
      }

      if (parsed && typeof parsed === 'object') {
        const username = String(parsed.username || '').toLowerCase().trim();
        const fullName = String(parsed.fullName || parsed.full_name || '').toLowerCase().trim();
        const isZatoutUser =
          username === 'zatout01' ||
          username.includes('zatout') ||
          fullName.includes('zatout') ||
          fullName.includes('זעתות') ||
          fullName.includes('סאמי');

        const org =
          (typeof parsed.organizationId === 'string' && parsed.organizationId.trim()) ||
          (typeof parsed.organization_id === 'string' && parsed.organization_id.trim()) ||
          (isZatoutUser ? DEFAULT_ORGANIZATION_ID : undefined);

        if (parsed.id && parsed.id !== 'usr-worker' && org) {
          return {
            ...parsed,
            organizationId: org,
            organization_id: org,
          } as unknown as AppUser;
        }
      }
    }
  } catch {
    // Ignore error
  }
  return null;
}

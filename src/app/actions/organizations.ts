'use server';

import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import {
  TenantRegistrationSchema,
  type RegisterOrganizationResult,
} from '@/core/tenant/tenantOnboard.schema';
import { isSupabaseConfigured, getSupabaseServerClient } from '@/lib/supabase';
import { isPlatformSuperAdmin } from '@/lib/auth/superadmin';
import { getServerSessionUser } from '@/lib/auth/session';
import {
  getMockOrganizationBySlug,
  getMockOrganizations,
  updateMockOrganization,
  addMockOrganization,
  addMockWarehouse,
  addMockCategory,
  addMockUser,
} from '@/lib/mockStore';
import type { Organization, AppUser, OrganizationStatus } from '@/types/domain';

const INITIAL_CATEGORIES = [
  { name: 'כלי עבודה חשמליים', slug: 'power-tools', icon: 'drill' },
  { name: 'כלי עבודה ידניים', slug: 'hand-tools', icon: 'wrench' },
  { name: 'מדידה ואופטיקה', slug: 'measuring-optical', icon: 'ruler' },
  { name: 'ציוד בטיחות ומיגון', slug: 'safety-ppe', icon: 'shield' },
  { name: 'ריתוך וחימום', slug: 'welding-heat', icon: 'flame' },
  { name: 'ציוד כבד וגנרטורים', slug: 'heavy-generators', icon: 'truck' },
];

/**
 * Notifies system superadmins via email about a newly registered organization awaiting review.
 * Uses Resend API if RESEND_API_KEY is present; otherwise gracefully logs formatted notification.
 */
async function sendAdminNotificationEmail(params: {
  orgName: string;
  contactPerson: string;
  phone: string;
  email: string;
}) {
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'alisalehmohammad4@gmail.com';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://tooly-dun.vercel.app';
  const approvalUrl = `${appUrl}/admin`;

  const emailSubject = `🔔 בקשת רישום ארגון חדש ב-Tooly: ${params.orgName}`;
  const emailText = `שלום מנהל המערכת,

התקבלה בקשת רישום ארגון חדש במערכת Tooly הממתינה לאישורך:
- שם החברה/ארגון: ${params.orgName}
- איש קשר ומנהל: ${params.contactPerson}
- טלפון: ${params.phone || 'לא הוזן'}
- אימייל: ${params.email || 'לא הוזן'}

לצפייה בבקשה ואישורה בלחיצת כפתור אחת:
${approvalUrl}

בברכה,
צוות Tooly`;

  try {
    const resendApiKey = process.env.RESEND_API_KEY;
    if (resendApiKey) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_EMAIL || 'Tooly Onboarding <onboarding@tooly.app>',
          to: [adminEmail],
          subject: emailSubject,
          text: emailText,
        }),
      });
      console.log(`[Admin Notification Email] Sent via Resend to ${adminEmail} for org "${params.orgName}"`);
    } else {
      console.log(`[Admin Notification Email] Clean alert logged for Admin:
To: ${adminEmail}
Subject: ${emailSubject}
Approval Link: ${approvalUrl}
Org: ${params.orgName} | Contact: ${params.contactPerson} | Phone: ${params.phone} | Email: ${params.email}`);
    }
  } catch (err) {
    console.warn('[Admin Notification Email] Notification attempt completed with warning:', err);
  }
}

export async function registerNewOrganizationAction(
  rawInput: unknown
): Promise<RegisterOrganizationResult> {
  const parsed = TenantRegistrationSchema.safeParse(rawInput);
  if (!parsed.success) {
    const firstError = parsed.error.issues[0]?.message || 'נתוני הרישום אינם תקינים';
    return { success: false, error: firstError };
  }

  const {
    companyName,
    slug,
    serialPrefix,
    defaultCurrency,
    contactEmail,
    contactPhone,
    contact_email,
    contact_phone,
    adminFullName,
    adminUsername,
    adminPin,
    initialWarehouseName,
  } = parsed.data;

  const cleanSlug = slug.trim().toLowerCase();
  const phone = (contactPhone || contact_phone || '').trim();
  const email = (contactEmail || contact_email || '').trim();

  // 1. Slug uniqueness check against mock store
  if (getMockOrganizationBySlug(cleanSlug)) {
    return {
      success: false,
      error: 'מזהה ארגון זה (slug) כבר קיים במערכת. אנא בחר מזהה ייחודי אחר.',
    };
  }

  const orgId = randomUUID();
  const whId = randomUUID();
  const userId = randomUUID();
  const whCode = 'MAIN-01';
  const nowIso = new Date().toISOString();

  const newOrg: Organization = {
    id: orgId,
    name: companyName.trim(),
    slug: cleanSlug,
    serialPrefix: serialPrefix.trim().toUpperCase(),
    defaultCurrency,
    status: 'pending_approval',
    contact_phone: phone,
    contact_email: email,
    contactPhone: phone,
    contactEmail: email,
    created_at: nowIso,
    approved_at: null,
    approved_by: null,
  };

  const newWarehouse = {
    id: whId,
    name: initialWarehouseName.trim() || 'מחסן ראשי',
    code: whCode,
    type: 'central_warehouse' as const,
    isActive: true,
    organizationId: orgId,
  };

  const adminUser: AppUser = {
    id: userId,
    fullName: adminFullName.trim(),
    username: adminUsername.trim(),
    pinCode: adminPin.trim(),
    role: 'general_manager',
    organizationId: orgId,
    assignedWarehouseId: whId,
    assignedWarehouseName: initialWarehouseName.trim() || 'מחסן ראשי',
    isActive: true,
    email: email || undefined,
    phone: phone || undefined,
    createdAt: nowIso,
  };

  // 2. Supabase Integration
  if (isSupabaseConfigured()) {
    try {
      const serverClient = getSupabaseServerClient();

      // Verify slug uniqueness in database
      const { data: existingOrg } = await serverClient
        .from('organizations')
        .select('id, slug')
        .eq('slug', cleanSlug)
        .maybeSingle();

      if (existingOrg) {
        return {
          success: false,
          error: 'מזהה ארגון זה (slug) כבר קיים במערכת. אנא בחר מזהה ייחודי אחר.',
        };
      }

      // Insert organization
      const { error: orgErr } = await serverClient.from('organizations').insert({
        id: orgId,
        name: newOrg.name,
        slug: newOrg.slug,
        serial_prefix: newOrg.serialPrefix,
        default_currency: newOrg.defaultCurrency,
        status: 'pending_approval',
        contact_phone: newOrg.contact_phone,
        contact_email: newOrg.contact_email,
      });

      if (orgErr) {
        console.warn('Could not insert organization with new fields into Supabase (trying base fields):', orgErr.message);
        if (orgErr.message?.includes('column') || orgErr.code === 'PGRST204') {
          await serverClient.from('organizations').insert({
            id: orgId,
            name: newOrg.name,
            slug: newOrg.slug,
            serial_prefix: newOrg.serialPrefix,
            default_currency: newOrg.defaultCurrency,
          });
        }
      }

      // Insert warehouse
      const { error: whErr } = await serverClient.from('warehouses').insert({
        id: whId,
        name: newWarehouse.name,
        code: newWarehouse.code,
        type: newWarehouse.type,
        is_active: true,
        organization_id: orgId,
      });

      if (whErr) {
        console.warn('Could not insert warehouse into Supabase:', whErr.message);
      }

      // Insert admin user
      const { error: userErr } = await serverClient.from('app_users').insert({
        id: userId,
        full_name: adminUser.fullName,
        username: adminUser.username,
        pin_code: adminUser.pinCode,
        role: adminUser.role,
        is_active: true,
        assigned_warehouse_id: whId,
        organization_id: orgId,
      });

      if (userErr) {
        console.warn('Could not insert admin user into Supabase app_users:', userErr.message);
      }

      // Insert initial categories
      const categoriesRows = INITIAL_CATEGORIES.map((cat, idx) => ({
        id: randomUUID(),
        name: cat.name,
        slug: `${cleanSlug}-${cat.slug}`,
        icon: cat.icon,
        display_order: idx + 1,
        organization_id: orgId,
      }));

      const { error: catErr } = await serverClient.from('categories').insert(categoriesRows);
      if (catErr) {
        console.warn('Could not insert categories into Supabase:', catErr.message);
      }
    } catch (dbErr) {
      console.warn('Supabase organization creation failed, fallback to local store:', dbErr);
    }
  }

  // 3. Sync to Authoritative In-Memory Mock Store
  addMockOrganization(newOrg);
  addMockWarehouse(newWarehouse);
  addMockUser(adminUser);

  INITIAL_CATEGORIES.forEach((cat, idx) => {
    addMockCategory({
      id: `cat-${cleanSlug}-${cat.slug}`,
      name: cat.name,
      slug: `${cleanSlug}-${cat.slug}`,
      icon: cat.icon,
      displayOrder: idx + 1,
      organizationId: orgId,
    });
  });

  // 4. Send email notification to Admin asynchronously without blocking
  void sendAdminNotificationEmail({
    orgName: newOrg.name,
    contactPerson: adminUser.fullName,
    phone: phone,
    email: email,
  });

  return {
    success: true,
    pendingApproval: true,
    organization: newOrg,
    user: adminUser,
  };
}

export async function getPendingOrganizationsAction(): Promise<{
  success: boolean;
  organizations: Organization[];
  data: Organization[];
  error?: string;
}> {
  try {
    // Strict server-side check: Only Platform SuperAdmin can view pending onboarding requests
    const caller = await getServerSessionUser();
    if (!isPlatformSuperAdmin(caller)) {
      console.warn(
        `[getPendingOrganizationsAction] Access denied for non-superadmin user: ${caller?.username || caller?.id || 'anonymous'}`
      );
      return {
        success: false,
        organizations: [],
        data: [],
        error: 'אין לך הרשאת מנהל על (Platform SuperAdmin) לצפות בבקשות הצטרפות של ארגונים.',
      };
    }

    const orgsMap = new Map<string, Organization>();

    // 1. Supabase query if configured
    if (isSupabaseConfigured()) {
      try {
        const serverClient = getSupabaseServerClient();
        // Query pending / non-active organizations (including Yamojee, suspended, or pending_approval)
        const { data, error } = await serverClient
          .from('organizations')
          .select('*')
          .neq('status', 'active')
          .order('created_at', { ascending: false });

        if (data && !error) {
          type OrgDbRow = Record<string, unknown> & {
            id: string | number;
            name?: string;
            slug?: string;
            serial_prefix?: string;
            serialPrefix?: string;
            default_currency?: string;
            defaultCurrency?: string;
            logo_url?: string;
            logoUrl?: string;
            status?: string;
            contact_phone?: string;
            contactPhone?: string;
            contact_email?: string;
            contactEmail?: string;
            created_at?: string;
            approved_at?: string;
            approved_by?: string;
          };
          for (const row of (data as OrgDbRow[])) {
            const orgId = String(row.id);
            const rawStatus = (row.status as string) || '';
            const normalizedStatus: OrganizationStatus =
              !rawStatus || rawStatus === 'pending' || rawStatus === 'pending_approval'
                ? 'pending_approval'
                : (rawStatus as OrganizationStatus);

            const orgObj: Organization = {
              id: orgId,
              name: row.name || 'ארגון ללא שם',
              slug: row.slug || orgId.slice(0, 8),
              serialPrefix: row.serial_prefix || row.serialPrefix || 'TOOL-',
              defaultCurrency: row.default_currency || row.defaultCurrency || 'ILS',
              logoUrl: row.logo_url || row.logoUrl,
              status: normalizedStatus,
              contact_phone: row.contact_phone || row.contactPhone,
              contact_email: row.contact_email || row.contactEmail,
              contactPhone: row.contact_phone || row.contactPhone,
              contactEmail: row.contact_email || row.contactEmail,
              created_at: row.created_at,
              approved_at: row.approved_at,
              approved_by: row.approved_by,
            };
            orgsMap.set(orgObj.id, orgObj);
          }
        }
      } catch (err) {
        console.warn('[getPendingOrganizationsAction] Supabase query failed:', err);
      }
    }

    // 2. Mock Store Pending Organizations (all non-active organizations)
    const mockPending = getMockOrganizations().filter((o) => o.status !== 'active');
    for (const mo of mockPending) {
      if (!orgsMap.has(mo.id)) {
        orgsMap.set(mo.id, mo);
      }
    }

    // Sort descending by created_at
    const sorted = Array.from(orgsMap.values()).sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeB - timeA;
    });

    return {
      success: true,
      organizations: sorted,
      data: sorted,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'שגיאה בטעינת ארגונים ממתינים לאישור';
    return {
      success: false,
      organizations: [],
      data: [],
      error: msg,
    };
  }
}

export async function approveOrganizationAction(
  orgId: string,
  approvedByUserId?: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    // Strict server-side check: Only Platform SuperAdmin can approve new organizations
    const caller = await getServerSessionUser();
    if (!isPlatformSuperAdmin(caller)) {
      console.warn(
        `[approveOrganizationAction] Unauthorized approval attempt by user: ${caller?.username || caller?.id || 'anonymous'}`
      );
      return {
        success: false,
        error: 'פעולה זו מורשית בלבד עבור מנהל העל של המערכת (Platform SuperAdmin).',
      };
    }

    const nowIso = new Date().toISOString();

    // 1. Update Mock Store
    const updatedMock = updateMockOrganization(orgId, {
      status: 'active',
      approved_at: nowIso,
      approved_by: approvedByUserId || null,
      approvedBy: approvedByUserId || null,
    });

    // 2. Update Supabase
    if (isSupabaseConfigured()) {
      try {
        const serverClient = getSupabaseServerClient();
        const updatePayload: Record<string, unknown> = {
          status: 'active',
          approved_at: nowIso,
        };
        if (approvedByUserId) {
          updatePayload.approved_by = approvedByUserId;
        }

        const { error: sbErr } = await serverClient
          .from('organizations')
          .update(updatePayload)
          .eq('id', orgId);

        if (sbErr) {
          console.warn('[approveOrganizationAction] Supabase update warning:', sbErr.message);
        }
      } catch (err) {
        console.warn('[approveOrganizationAction] Supabase update failed:', err);
      }
    }

    revalidatePath('/admin');
    revalidatePath('/dashboard/manager');
    revalidatePath('/');

    return {
      success: true,
      message: updatedMock?.name
        ? `ארגון "${updatedMock.name}" אושר בהצלחה!`
        : 'הארגון אושר בהצלחה ופעיל כעת במערכת',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'שגיאה באישור הארגון';
    return {
      success: false,
      error: msg,
    };
  }
}

export async function rejectOrganizationAction(
  orgId: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    // Strict server-side check: Only Platform SuperAdmin can reject organizations
    const caller = await getServerSessionUser();
    if (!isPlatformSuperAdmin(caller)) {
      console.warn(
        `[rejectOrganizationAction] Unauthorized rejection attempt by user: ${caller?.username || caller?.id || 'anonymous'}`
      );
      return {
        success: false,
        error: 'פעולה זו מורשית בלבד עבור מנהל העל של המערכת (Platform SuperAdmin).',
      };
    }

    // 1. Update Mock Store
    const updatedMock = updateMockOrganization(orgId, {
      status: 'rejected',
    });

    // 2. Update Supabase
    if (isSupabaseConfigured()) {
      try {
        const serverClient = getSupabaseServerClient();
        const { error: sbErr } = await serverClient
          .from('organizations')
          .update({
            status: 'rejected',
          })
          .eq('id', orgId);

        if (sbErr) {
          console.warn('[rejectOrganizationAction] Supabase update warning:', sbErr.message);
        }
      } catch (err) {
        console.warn('[rejectOrganizationAction] Supabase update failed:', err);
      }
    }

    revalidatePath('/dashboard/manager');
    revalidatePath('/admin');
    revalidatePath('/');

    return {
      success: true,
      message: updatedMock?.name
        ? `בקשת הארגון "${updatedMock.name}" נדחתה`
        : 'בקשת הארגון נדחתה בהצלחה',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'שגיאה בדחיית הארגון';
    return {
      success: false,
      error: msg,
    };
  }
}

export interface AdminOrganizationListItem {
  id: string;
  name: string;
  slug: string;
  serialPrefix: string;
  defaultCurrency: string;
  status: OrganizationStatus;
  contactPhone?: string;
  contactEmail?: string;
  toolsCount: number;
  membersCount: number;
  activeLoansCount: number;
  created_at?: string;
  approved_at?: string | null;
}

export interface PlatformMetrics {
  totalOrganizations: number;
  totalActiveOrganizations: number;
  pendingApprovalsCount: number;
  totalAssetsCount: number;
  totalActiveLoansCount: number;
  totalUsersCount: number;
}

/**
 * SuperAdmin Only: Retrieves all registered organizations across the platform
 * with aggregate tool counts, user counts, and current status.
 */
export async function getAllOrganizationsAdminAction(): Promise<{
  success: boolean;
  organizations: AdminOrganizationListItem[];
  error?: string;
}> {
  try {
    const caller = await getServerSessionUser();
    if (!isPlatformSuperAdmin(caller)) {
      return {
        success: false,
        organizations: [],
        error: 'אין לך הרשאת מנהל על (Platform SuperAdmin) לצפות בכלל ארגוני המערכת.',
      };
    }

    const orgsMap = new Map<string, AdminOrganizationListItem>();

    // 1. Supabase Query if configured
    if (isSupabaseConfigured()) {
      try {
        const serverClient = getSupabaseServerClient();
        const { data: dbOrgs, error: orgErr } = await serverClient
          .from('organizations')
          .select('*')
          .order('created_at', { ascending: false });

        if (dbOrgs && !orgErr) {
          type DbOrgRow = Record<string, unknown> & {
            id: string | number;
            name?: string;
            slug?: string;
            serial_prefix?: string;
            serialPrefix?: string;
            default_currency?: string;
            defaultCurrency?: string;
            status?: string;
            contact_phone?: string;
            contactPhone?: string;
            contact_email?: string;
            contactEmail?: string;
            created_at?: string;
            approved_at?: string;
          };
          for (const row of (dbOrgs as DbOrgRow[])) {
            const orgId = String(row.id);
            const rawStatus = (row.status as string) || '';
            const normalizedStatus: OrganizationStatus =
              !rawStatus || rawStatus === 'pending' || rawStatus === 'pending_approval'
                ? 'pending_approval'
                : (rawStatus as OrganizationStatus);

            orgsMap.set(orgId, {
              id: orgId,
              name: row.name || 'ארגון ללא שם',
              slug: row.slug || orgId.slice(0, 8),
              serialPrefix: row.serial_prefix || row.serialPrefix || 'TOOL-',
              defaultCurrency: row.default_currency || row.defaultCurrency || 'ILS',
              status: normalizedStatus,
              contactPhone: row.contact_phone || row.contactPhone,
              contactEmail: row.contact_email || row.contactEmail,
              toolsCount: 0,
              membersCount: 0,
              activeLoansCount: 0,
              created_at: row.created_at,
              approved_at: row.approved_at,
            });
          }

          // Count users per org from Supabase
          try {
            const { data: usersData } = await serverClient
              .from('app_users')
              .select('organization_id');
            if (usersData) {
              for (const u of usersData) {
                const oId = u.organization_id;
                if (oId && orgsMap.has(oId)) {
                  orgsMap.get(oId)!.membersCount++;
                }
              }
            }
          } catch {}

          // Count assets per org from Supabase
          try {
            const { data: assetsData } = await serverClient
              .from('assets')
              .select('organization_id, status');
            if (assetsData) {
              for (const a of assetsData) {
                const oId = a.organization_id;
                if (oId && orgsMap.has(oId)) {
                  const entry = orgsMap.get(oId)!;
                  entry.toolsCount++;
                  if (a.status === 'checked_out') {
                    entry.activeLoansCount++;
                  }
                }
              }
            }
          } catch {}
        }
      } catch (sbErr) {
        console.warn('[getAllOrganizationsAdminAction] Supabase query note:', sbErr);
      }
    }

    // 2. Merge Authoritative Mock Organizations
    const { MOCK_USERS, MOCK_ASSETS } = await import('@/lib/mockStore');
    for (const mockOrg of getMockOrganizations()) {
      if (!orgsMap.has(mockOrg.id)) {
        const mockTools = MOCK_ASSETS.filter(
          (a) => a.organizationId === mockOrg.id || a.organization_id === mockOrg.id
        );
        const mockMembers = MOCK_USERS.filter(
          (u) => u.organizationId === mockOrg.id || u.organization_id === mockOrg.id
        );
        const activeLoans = mockTools.filter((a) => a.status === 'checked_out').length;

        orgsMap.set(mockOrg.id, {
          id: mockOrg.id,
          name: mockOrg.name,
          slug: mockOrg.slug,
          serialPrefix: mockOrg.serialPrefix,
          defaultCurrency: mockOrg.defaultCurrency,
          status: mockOrg.status || 'active',
          contactPhone: mockOrg.contact_phone || mockOrg.contactPhone,
          contactEmail: mockOrg.contact_email || mockOrg.contactEmail,
          toolsCount: mockTools.length,
          membersCount: mockMembers.length,
          activeLoansCount: activeLoans,
          created_at: mockOrg.created_at,
          approved_at: mockOrg.approved_at,
        });
      } else {
        // If toolsCount is 0 in DB, check mock count as fallback
        const existing = orgsMap.get(mockOrg.id)!;
        if (existing.toolsCount === 0) {
          const mockTools = MOCK_ASSETS.filter(
            (a) => a.organizationId === mockOrg.id || a.organization_id === mockOrg.id
          );
          existing.toolsCount = mockTools.length;
          existing.activeLoansCount = mockTools.filter((a) => a.status === 'checked_out').length;
        }
        if (existing.membersCount === 0) {
          const mockMembers = MOCK_USERS.filter(
            (u) => u.organizationId === mockOrg.id || u.organization_id === mockOrg.id
          );
          existing.membersCount = mockMembers.length;
        }
      }
    }

    const list = Array.from(orgsMap.values());
    return {
      success: true,
      organizations: list,
    };
  } catch (err: unknown) {
    return {
      success: false,
      organizations: [],
      error: err instanceof Error ? err.message : 'שגיאה בטעינת ארגוני המערכת',
    };
  }
}

/**
 * SuperAdmin Only: Retrieves overall platform aggregate metrics.
 */
export async function getPlatformMetricsAction(): Promise<{
  success: boolean;
  metrics: PlatformMetrics;
  error?: string;
}> {
  try {
    const caller = await getServerSessionUser();
    if (!isPlatformSuperAdmin(caller)) {
      return {
        success: false,
        metrics: {
          totalOrganizations: 0,
          totalActiveOrganizations: 0,
          pendingApprovalsCount: 0,
          totalAssetsCount: 0,
          totalActiveLoansCount: 0,
          totalUsersCount: 0,
        },
        error: 'הרשאה נדחתה: פעולה זו מורשית למנהל על בלבד.',
      };
    }

    const allOrgsRes = await getAllOrganizationsAdminAction();
    const orgs = allOrgsRes.organizations || [];

    const totalOrgs = orgs.length;
    const activeOrgs = orgs.filter((o) => o.status === 'active').length;
    const pendingOrgs = orgs.filter((o) => o.status !== 'active').length;
    const totalAssets = orgs.reduce((sum, o) => sum + (o.toolsCount || 0), 0);
    const totalLoans = orgs.reduce((sum, o) => sum + (o.activeLoansCount || 0), 0);
    const totalUsers = orgs.reduce((sum, o) => sum + (o.membersCount || 0), 0);

    return {
      success: true,
      metrics: {
        totalOrganizations: totalOrgs,
        totalActiveOrganizations: activeOrgs,
        pendingApprovalsCount: pendingOrgs,
        totalAssetsCount: totalAssets,
        totalActiveLoansCount: totalLoans,
        totalUsersCount: totalUsers,
      },
    };
  } catch (err: unknown) {
    return {
      success: false,
      metrics: {
        totalOrganizations: 0,
        totalActiveOrganizations: 0,
        pendingApprovalsCount: 0,
        totalAssetsCount: 0,
        totalActiveLoansCount: 0,
        totalUsersCount: 0,
      },
      error: err instanceof Error ? err.message : 'שגיאה בחישוב מדדי המערכת',
    };
  }
}

/**
 * SuperAdmin Only: Activates or suspends an organization.
 */
export async function toggleOrganizationStatusAction(
  orgId: string,
  newStatus: OrganizationStatus
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    const caller = await getServerSessionUser();
    if (!isPlatformSuperAdmin(caller)) {
      return {
        success: false,
        error: 'הרשאה נדחתה: פעולה זו מורשית למנהל על בלבד.',
      };
    }

    updateMockOrganization(orgId, { status: newStatus });

    if (isSupabaseConfigured()) {
      try {
        const serverClient = getSupabaseServerClient();
        await serverClient
          .from('organizations')
          .update({ status: newStatus })
          .eq('id', orgId);
      } catch (err) {
        console.warn('[toggleOrganizationStatusAction] Supabase update warning:', err);
      }
    }

    revalidatePath('/admin');
    revalidatePath('/dashboard/manager');

    return {
      success: true,
      message: `סטטוס הארגון עודכן בהצלחה ל-${newStatus === 'active' ? 'פעיל' : 'מושהה'}.`,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'שגיאה בעדכון סטטוס הארגון',
    };
  }
}

export interface MasterAssetResult {
  id: string;
  name: string;
  tagNumber: string;
  serialNumber?: string;
  qrCode?: string;
  brand?: string;
  modelNumber?: string;
  status: string;
  condition?: string;
  organizationId: string;
  organizationName: string;
  warehouseName?: string;
  assignedWorker?: string;
  assignedWorkerPhone?: string;
}

/**
 * SuperAdmin Only: Global lookup for any asset across all organizations and warehouses.
 * Completely isolates SuperAdmin as platform-master without adopting customer warehouse scope.
 */
export async function masterLookupAssetsAction(query?: string): Promise<{
  success: boolean;
  assets: MasterAssetResult[];
  error?: string;
}> {
  try {
    const caller = await getServerSessionUser();
    if (!isPlatformSuperAdmin(caller)) {
      return {
        success: false,
        assets: [],
        error: 'הרשאה נדחתה: פעולה זו מורשית למנהל על בלבד.',
      };
    }

    const cleanQuery = query?.trim() || '';
    const results: MasterAssetResult[] = [];
    const seenIds = new Set<string>();

    // 1. Supabase Query across all organizations
    if (isSupabaseConfigured()) {
      try {
        const serverClient = getSupabaseServerClient();

        // Get organizations map for human names
        const { data: orgRows } = await serverClient
          .from('organizations')
          .select('id, name');
        const orgNamesMap = new Map<string, string>();
        if (orgRows) {
          for (const o of orgRows) {
            orgNamesMap.set(String(o.id), o.name || 'ארגון');
          }
        }

        // Get warehouses map for warehouse names
        const { data: whRows } = await serverClient
          .from('warehouses')
          .select('id, name');
        const whNamesMap = new Map<string, string>();
        if (whRows) {
          for (const w of whRows) {
            whNamesMap.set(String(w.id), w.name || 'מחסן');
          }
        }

        let dbQuery = serverClient
          .from('assets')
          .select(
            'id, name, tag_number, serial_number, qr_code, brand, model_number, status, condition, organization_id, current_warehouse_id, current_assigned_worker, assigned_worker_phone'
          )
          .limit(50);

        if (cleanQuery) {
          dbQuery = dbQuery.or(
            `tag_number.ilike.%${cleanQuery}%,serial_number.ilike.%${cleanQuery}%,name.ilike.%${cleanQuery}%,brand.ilike.%${cleanQuery}%,qr_code.ilike.%${cleanQuery}%,current_assigned_worker.ilike.%${cleanQuery}%`
          );
        } else {
          dbQuery = dbQuery.order('created_at', { ascending: false });
        }

        const { data: assetsData, error: assetsErr } = await dbQuery;

        if (assetsData && !assetsErr) {
          for (const a of assetsData) {
            const orgId = String(a.organization_id || '');
            const orgName = orgNamesMap.get(orgId) || 'ארגון כללי';
            const whId = String(a.current_warehouse_id || '');
            const whName = whNamesMap.get(whId) || (whId ? 'מחסן' : 'לא מוגדר');

            results.push({
              id: a.id,
              name: a.name || 'כלי עבודה',
              tagNumber: a.tag_number || a.id.slice(0, 8),
              serialNumber: a.serial_number || undefined,
              qrCode: a.qr_code || undefined,
              brand: a.brand || undefined,
              modelNumber: a.model_number || undefined,
              status: a.status || 'in_stock',
              condition: a.condition || 'good',
              organizationId: orgId,
              organizationName: orgName,
              warehouseName: whName,
              assignedWorker: a.current_assigned_worker || undefined,
              assignedWorkerPhone: a.assigned_worker_phone || undefined,
            });
            seenIds.add(a.id);
          }
        }
      } catch (err) {
        console.warn('[masterLookupAssetsAction] Supabase lookup error:', err);
      }
    }

    // 2. Fallback / Merge from MOCK_ASSETS
    try {
      const { MOCK_ASSETS } = await import('@/lib/mockStore');
      const qLower = cleanQuery.toLowerCase();
      const matchedMocks = cleanQuery
        ? MOCK_ASSETS.filter((item) => {
            const a = item as unknown as Record<string, unknown>;
            const tag = String(a.tag_number || a.tagNumber || a.qrCode || '').toLowerCase();
            const serial = String(a.serial_number || a.serialNumber || '').toLowerCase();
            const name = String(a.name || a.toolName || '').toLowerCase();
            const brand = String(a.brand || '').toLowerCase();
            const worker = String(a.current_assigned_worker || a.assignedWorker || '').toLowerCase();
            return (
              tag.includes(qLower) ||
              serial.includes(qLower) ||
              name.includes(qLower) ||
              brand.includes(qLower) ||
              worker.includes(qLower)
            );
          })
        : MOCK_ASSETS.slice(0, 30);

      for (const raw of matchedMocks) {
        const m = raw as unknown as Record<string, unknown>;
        const id = String(m.id || '');
        if (!seenIds.has(id)) {
          results.push({
            id,
            name: String(m.name || m.toolName || 'כלי עבודה'),
            tagNumber: String(m.tag_number || m.tagNumber || m.qrCode || id),
            serialNumber: m.serial_number ? String(m.serial_number) : (m.serialNumber ? String(m.serialNumber) : undefined),
            qrCode: m.qr_code ? String(m.qr_code) : (m.qrCode ? String(m.qrCode) : undefined),
            brand: m.brand ? String(m.brand) : undefined,
            modelNumber: m.model_number ? String(m.model_number) : (m.modelNumber ? String(m.modelNumber) : undefined),
            status: String(m.status || 'in_stock'),
            condition: String(m.condition || 'good'),
            organizationId: String(m.organization_id || m.organizationId || 'default-org'),
            organizationName: 'הבונים (Mock)',
            warehouseName: String(m.warehouse_name || m.warehouseName || 'מחסן ראשי'),
            assignedWorker: m.current_assigned_worker ? String(m.current_assigned_worker) : (m.assignedWorker ? String(m.assignedWorker) : undefined),
            assignedWorkerPhone: m.assigned_worker_phone ? String(m.assigned_worker_phone) : (m.assignedWorkerPhone ? String(m.assignedWorkerPhone) : undefined),
          });
          seenIds.add(id);
        }
      }
    } catch {}

    return {
      success: true,
      assets: results,
    };
  } catch (err: unknown) {
    return {
      success: false,
      assets: [],
      error: err instanceof Error ? err.message : 'שגיאה באיתור כלי עבודה גלובלי',
    };
  }
}


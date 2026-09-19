'use server';

import { randomUUID } from 'crypto';
import {
  TenantRegistrationSchema,
  type RegisterOrganizationResult,
} from '@/core/tenant/tenantOnboard.schema';
import { isSupabaseConfigured, getSupabaseServerClient } from '@/lib/supabase';
import {
  getMockOrganizationBySlug,
  addMockOrganization,
  addMockWarehouse,
  addMockCategory,
  addMockUser,
} from '@/lib/mockStore';
import type { Organization, AppUser } from '@/types/domain';

const INITIAL_CATEGORIES = [
  { name: 'כלי עבודה חשמליים', slug: 'power-tools', icon: 'drill' },
  { name: 'כלי עבודה ידניים', slug: 'hand-tools', icon: 'wrench' },
  { name: 'מדידה ואופטיקה', slug: 'measuring-optical', icon: 'ruler' },
  { name: 'ציוד בטיחות ומיגון', slug: 'safety-ppe', icon: 'shield' },
  { name: 'ריתוך וחימום', slug: 'welding-heat', icon: 'flame' },
  { name: 'ציוד כבד וגנרטורים', slug: 'heavy-generators', icon: 'truck' },
];

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
    adminFullName,
    adminUsername,
    adminPin,
    initialWarehouseName,
  } = parsed.data;

  const cleanSlug = slug.trim().toLowerCase();

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

  const newOrg: Organization = {
    id: orgId,
    name: companyName.trim(),
    slug: cleanSlug,
    serialPrefix: serialPrefix.trim().toUpperCase(),
    defaultCurrency,
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
    createdAt: new Date().toISOString(),
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
      });

      if (orgErr) {
        console.warn('Could not insert organization into Supabase (falling back to mock store):', orgErr.message);
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

  return {
    success: true,
    organization: newOrg,
    user: adminUser,
  };
}

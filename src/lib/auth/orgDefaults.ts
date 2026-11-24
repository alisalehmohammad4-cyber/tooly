import type { Organization } from '@/types/domain';

/**
 * Lightweight, client-safe default organization metadata.
 * Kept isolated from `@/lib/mockStore` so Client Components (such as AuthContext)
 * never pull the 43k-line mock dataset into browser JS bundles.
 */
export const DEFAULT_ORGANIZATION: Organization = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Sami Zatout Group',
  slug: 'zatout',
  serialPrefix: 'ZR-',
  defaultCurrency: 'ILS',
  status: 'active',
  contact_phone: '050-1234567',
  contact_email: 'office@zatout.co.il',
  contactPhone: '050-1234567',
  contactEmail: 'office@zatout.co.il',
  created_at: '2024-01-01T00:00:00.000Z',
  approved_at: '2024-01-01T00:00:00.000Z',
};

export const SALEHALI_ORGANIZATION: Organization = {
  id: '11111111-1111-1111-1111-111111111111',
  name: 'Ali Saleh Enterprises',
  slug: 'salehali',
  serialPrefix: 'ALI-',
  defaultCurrency: 'ILS',
  status: 'active',
  contact_phone: '052-9876543',
  contact_email: 'admin@salehali.com',
  contactPhone: '052-9876543',
  contactEmail: 'admin@salehali.com',
  created_at: '2024-01-01T00:00:00.000Z',
  approved_at: '2024-01-01T00:00:00.000Z',
};

const FALLBACK_ORGANIZATIONS: Organization[] = [
  DEFAULT_ORGANIZATION,
  SALEHALI_ORGANIZATION,
];

/**
 * Minimal client-safe fallback lookup for built-in organization metadata.
 */
export function getFallbackOrganizationById(orgId: string): Organization | undefined {
  if (!orgId) return undefined;
  return FALLBACK_ORGANIZATIONS.find((org) => org.id === orgId);
}

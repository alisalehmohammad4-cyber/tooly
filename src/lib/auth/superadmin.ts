import type { AppUser } from '@/types/domain';

/**
 * Authoritative helper to determine whether an active user is the Tooly Platform SuperAdmin.
 * Strictly separates the platform owner from customer/tenant managers (such as Sami Zatout).
 */
export function isPlatformSuperAdmin(user?: AppUser | null): boolean {
  if (!user) return false;

  const username = (user.username || '').toLowerCase().trim();
  const email = (user.email || '').toLowerCase().trim();
  const fullName = (user.fullName || '').toLowerCase().trim();

  // 1. Tenant company managers (such as Sami Zatout) are strictly NOT Platform SuperAdmin
  if (
    username === 'zatout01' ||
    username.includes('zatout') ||
    fullName.includes('zatout') ||
    fullName.includes('זעתות') ||
    fullName.includes('סאמי')
  ) {
    return false;
  }

  // 2. Explicit SuperAdmin boolean flag
  if (user.is_superadmin === true || user.isSuperAdmin === true) {
    return true;
  }

  // 3. Explicit SuperAdmin role
  if ((user.role as string)?.toLowerCase() === 'superadmin') {
    return true;
  }

  // 4. Platform Owner exact usernames
  const SUPERADMIN_USERNAMES = [
    'admin',
    'admintool',
    'superadmin',
    'alisalehmohammad4',
  ];

  if (SUPERADMIN_USERNAMES.includes(username)) {
    return true;
  }

  // 5. Master Platform SuperAdmin PIN
  if (user.pinCode === '9009' || (user as { pin?: string }).pin === '9009') {
    return true;
  }

  // 6. Platform Owner email
  const configuredAdminEmail = (process.env.ADMIN_NOTIFICATION_EMAIL || 'alisalehmohammad4@gmail.com')
    .toLowerCase()
    .trim();

  if (email && (email === 'alisalehmohammad4@gmail.com' || email === configuredAdminEmail)) {
    return true;
  }

  return false;
}

/**
 * Canonical PostgreSQL database statuses for public.transfer_requests.status.
 * Verified production CHECK constraint:
 * CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'IN_TRANSIT', 'COMPLETED'))
 */
export const TRANSFER_REQUEST_DB_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  IN_TRANSIT: 'IN_TRANSIT',
  COMPLETED: 'COMPLETED',
} as const;

export type TransferRequestDbStatus =
  (typeof TRANSFER_REQUEST_DB_STATUS)[keyof typeof TRANSFER_REQUEST_DB_STATUS];

/**
 * Array of canonical DB statuses permitted to be written into public.transfer_requests.status.
 */
export const ALLOWED_TRANSFER_REQUEST_DB_STATUSES: readonly TransferRequestDbStatus[] = [
  TRANSFER_REQUEST_DB_STATUS.PENDING,
  TRANSFER_REQUEST_DB_STATUS.APPROVED,
  TRANSFER_REQUEST_DB_STATUS.REJECTED,
  TRANSFER_REQUEST_DB_STATUS.IN_TRANSIT,
  TRANSFER_REQUEST_DB_STATUS.COMPLETED,
];

/**
 * Active / blocking transfer request statuses used for Supabase .in('status', ...) queries.
 * Includes canonical uppercase statuses ('PENDING', 'APPROVED', 'IN_TRANSIT') and legacy tolerance ('in_transit').
 * An asset associated with a transfer request in any of these statuses cannot be checked out or dispatched.
 */
export const ACTIVE_TRANSFER_REQUEST_STATUSES: readonly string[] = [
  TRANSFER_REQUEST_DB_STATUS.PENDING,
  TRANSFER_REQUEST_DB_STATUS.APPROVED,
  TRANSFER_REQUEST_DB_STATUS.IN_TRANSIT,
  'in_transit', // legacy tolerance for existing in-memory / historical rows
];

/**
 * Predicate to determine if a transfer request status is active (blocking).
 * Matches case-insensitively for resilient in-memory filtering.
 */
export function isTransferRequestActive(status?: string | null): boolean {
  if (!status) return false;
  const upper = status.trim().toUpperCase();
  return upper === 'PENDING' || upper === 'APPROVED' || upper === 'IN_TRANSIT';
}

/**
 * Normalizes a requested status update into a valid canonical DB status.
 * Replaces invalid status values like 'cancelled' or 'CANCELLED' with 'REJECTED'.
 */
export function normalizeTransferRequestDbStatus(
  status?: string | null
): TransferRequestDbStatus {
  if (!status) return TRANSFER_REQUEST_DB_STATUS.PENDING;
  const upper = status.trim().toUpperCase();
  if (upper === 'CANCELLED' || upper === 'CANCELED' || upper === 'REJECTED') {
    return TRANSFER_REQUEST_DB_STATUS.REJECTED;
  }
  if (upper === 'IN_TRANSIT') {
    return TRANSFER_REQUEST_DB_STATUS.IN_TRANSIT;
  }
  if (upper === 'APPROVED') {
    return TRANSFER_REQUEST_DB_STATUS.APPROVED;
  }
  if (upper === 'COMPLETED') {
    return TRANSFER_REQUEST_DB_STATUS.COMPLETED;
  }
  return TRANSFER_REQUEST_DB_STATUS.PENDING;
}

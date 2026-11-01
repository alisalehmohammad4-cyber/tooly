import crypto from 'node:crypto';

export interface CheckoutPayloadHashParams {
  assetIds: string[];
  organizationId: string;
  warehouseId?: string | null;
  workerName: string;
  workerPhone?: string | null;
  expectedReturnDate: string;
}

/**
 * Computes a deterministic SHA-256 hash of the canonical checkout parameters.
 * Normalizes array ordering and string casing to ensure exact reproducibility.
 */
export function computeCheckoutPayloadHash(params: CheckoutPayloadHashParams): string {
  // Sort and lowercase asset IDs deterministically
  const sortedAssetIds = Array.from(
    new Set((params.assetIds || []).map((id) => id.trim().toLowerCase()))
  ).sort();

  const canonicalObj = {
    assetIds: sortedAssetIds,
    expectedReturnDate: (params.expectedReturnDate || '').trim(),
    organizationId: (params.organizationId || '').trim().toLowerCase(),
    warehouseId: params.warehouseId ? params.warehouseId.trim().toLowerCase() : null,
    workerName: (params.workerName || '').trim(),
    workerPhone: params.workerPhone && params.workerPhone.trim().length > 0
      ? params.workerPhone.trim()
      : null,
  };

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalObj))
    .digest('hex');
}

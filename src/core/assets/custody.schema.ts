import { z } from 'zod';

export const AssetAccessoriesSchema = z.object({
  batteriesCount: z.number().int().min(0).default(0),
  hasCharger: z.boolean().default(false),
  hasCase: z.boolean().default(false),
});

export type AssetAccessories = z.infer<typeof AssetAccessoriesSchema>;

export const BulkCheckoutSchema = z.object({
  assetIds: z
    .array(z.string().trim().min(1, 'Asset ID cannot be empty'))
    .min(1, 'At least one asset is required for checkout'),
  workerName: z.string().trim().min(2, 'Worker name must be at least 2 characters'),
  workerPhone: z.string().trim().optional(),
  expectedReturnDate: z.string().trim().min(1, 'Expected return date is required'),
  accessories: z.record(z.string(), AssetAccessoriesSchema).default({}),
  signatureData: z.string().trim().min(1, 'Digital signature is required'),
  notes: z.string().trim().optional(),
});

export type BulkCheckoutInput = z.infer<typeof BulkCheckoutSchema>;

export const CheckoutSchema = z.object({
  assetId: z.string().trim().min(1, 'Asset ID is required'),
  workerName: z.string().trim().min(2, 'Worker name must be at least 2 characters'),
  workerPhone: z.string().trim().optional(),
  expectedReturnDate: z.string().trim().optional(),
  accessories: AssetAccessoriesSchema.optional(),
  signatureData: z.string().trim().optional(),
  notes: z.string().trim().optional(),
});

export type CheckoutInput = z.infer<typeof CheckoutSchema>;

export const CheckinSchema = z.object({
  assetId: z.string().trim().min(1, 'Asset ID is required'),
  condition: z.enum(['excellent', 'good', 'needs_repair', 'retired']),
  notes: z.string().trim().optional(),
});

export type CheckinInput = z.infer<typeof CheckinSchema>;

export const TransferSchema = z.object({
  assetId: z.string().trim().min(1, 'Target asset ID is required'),
  targetWarehouseId: z.string().trim().min(1, 'Target warehouse is required'),
  notes: z.string().trim().optional(),
});

export type TransferInput = z.infer<typeof TransferSchema>;

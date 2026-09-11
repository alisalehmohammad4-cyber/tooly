import { z } from 'zod';

export const CheckoutSchema = z.object({
  assetId: z.string().trim().min(1, 'Asset ID is required'),
  workerName: z.string().trim().min(1, 'Worker name is required'),
  workerPhone: z.string().trim().optional(),
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

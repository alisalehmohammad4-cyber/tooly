import { z } from 'zod';

export const QuickOnboardSchema = z.object({
  qrCode: z.string().trim().min(1, 'QR code is required'),
  warehouseId: z.string().trim().min(1, 'Warehouse ID is required'),
  categoryId: z.string().trim().min(1, 'Category ID is required'),
  toolName: z.string().trim().min(1, 'Tool name is required'),
  brand: z.string().trim().min(1, 'Brand is required'),
  modelNumber: z.string().trim().optional().or(z.literal('')),
  condition: z.enum(['excellent', 'good', 'needs_repair', 'retired']),
});

export type QuickOnboardInput = z.infer<typeof QuickOnboardSchema>;

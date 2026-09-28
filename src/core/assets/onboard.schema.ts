import { z } from 'zod';

export const QuickOnboardSchema = z.object({
  qrCode: z.string().trim().min(1, 'QR code is required'),
  nfcUid: z.string().trim().optional().or(z.literal('')),
  warehouseId: z.string().trim().min(1, 'Warehouse ID is required'),
  categoryId: z.string().trim().min(1, 'Category ID is required'),
  toolName: z.string().trim().min(1, 'Tool name is required'),
  brand: z.string().trim().min(1, 'Brand is required'),
  modelNumber: z.string().trim().optional().or(z.literal('')),
  condition: z.enum(['excellent', 'good', 'needs_repair', 'retired']),
  poNumber: z.string().trim().optional().or(z.literal('')),
  po_number: z.string().trim().optional().or(z.literal('')),
  supplyLocation: z.string().trim().optional().or(z.literal('')),
  supply_location: z.string().trim().optional().or(z.literal('')),
  gps: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .nullable()
    .optional(),
});

export type QuickOnboardInput = z.infer<typeof QuickOnboardSchema>;


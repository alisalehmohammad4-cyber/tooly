import { z } from 'zod';

export const TenantRegistrationSchema = z.object({
  companyName: z
    .string()
    .trim()
    .min(2, 'שם החברה חייב להכיל לפחות 2 תווים')
    .max(150, 'שם החברה אינו יכול לעלות על 150 תווים'),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2, 'מזהה ה-Slug חייב להכיל לפחות 2 תווים')
    .max(50, 'מזהה ה-Slug אינו יכול לעלות על 50 תווים')
    .regex(/^[a-z0-9-]+$/, 'מזהה Slug יכול להכיל אותיות באנגלית קטנות, מספרים ומקפים בלבד'),
  serialPrefix: z
    .string()
    .trim()
    .toUpperCase()
    .min(2, 'קידומת ברקוד חייבת להכיל לפחות 2 תווים')
    .max(10, 'קידומת ברקוד אינה יכולה לעלות על 10 תווים')
    .regex(/^[A-Z0-9_-]{2,10}$/, 'קידומת ברקוד יכולה להכיל אותיות גדולות באנגלית, מספרים, מקף או קו תחתון')
    .default('TOOL-'),
  defaultCurrency: z
    .enum(['ILS', 'USD', 'EUR', 'AED', 'SAR'])
    .default('ILS'),
  adminFullName: z
    .string()
    .trim()
    .min(2, 'שם המנהל חייב להכיל לפחות 2 תווים')
    .max(100, 'שם המנהל אינו יכול לעלות על 100 תווים'),
  adminUsername: z
    .string()
    .trim()
    .min(2, 'שם המשתמש חייב להכיל לפחות 2 תווים')
    .max(50, 'שם המשתמש אינו יכול לעלות על 50 תווים')
    .regex(/^[a-zA-Z0-9_]{2,50}$/, 'שם משתמש יכול להכיל אותיות באנגלית, מספרים וקו תחתון בלבד'),
  adminPin: z
    .string()
    .trim()
    .min(4, 'קוד PIN / סיסמה חייב להכיל לפחות 4 תווים')
    .max(20, 'קוד PIN / סיסמה אינו יכול לעלות על 20 תווים'),
  initialWarehouseName: z
    .string()
    .trim()
    .min(2, 'שם מחסן הבסיס חייב להכיל לפחות 2 תווים')
    .max(100, 'שם מחסן הבסיס אינו יכול לעלות על 100 תווים')
    .default('מחסן ראשי'),
});

export type TenantRegistrationInput = z.infer<typeof TenantRegistrationSchema>;

export interface RegisterOrganizationResult {
  success: boolean;
  error?: string;
  organization?: import('@/types/domain').Organization;
  user?: import('@/types/domain').AppUser;
}

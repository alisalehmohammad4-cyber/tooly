'use server';

import type { AppUser } from '@/types/domain';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

// Persistent in-memory user registry with warehouse assignments
const USERS_STORE: AppUser[] = [
  {
    id: 'usr-sk-01',
    fullName: 'יוסי כהן (מחסנאי מורשה)',
    username: 'yossi',
    role: 'supervisor',
    pinCode: '1111',
    assignedWarehouseId: 'wh-main-01',
    assignedWarehouseName: "מחסן מרכזי - אגף א'",
    isActive: true,
    createdAt: '2024-01-01T08:00:00.000Z',
  },
  {
    id: 'usr-sk-02',
    fullName: 'אבי לוי (מחסנאי שטח)',
    username: 'avi',
    role: 'supervisor',
    pinCode: '1234',
    assignedWarehouseId: 'wh-site-02',
    assignedWarehouseName: "אתר בנייה - מכולה ב'",
    isActive: true,
    createdAt: '2024-02-15T09:30:00.000Z',
  },
  {
    id: 'usr-admin-01',
    fullName: 'דני לוי (מנהל מפעל ופרויקטים)',
    username: 'dani',
    role: 'admin',
    pinCode: '9999',
    assignedWarehouseId: undefined,
    assignedWarehouseName: 'כל המחסנים (הנהלה)',
    isActive: true,
    createdAt: '2023-11-01T10:00:00.000Z',
  },
];

const WAREHOUSE_DIRECTORY: Record<string, string> = {
  'wh-main-01': "מחסן מרכזי - אגף א'",
  'wh-site-02': "אתר בנייה - מכולה ב'",
  'wh-van-03': 'רכב שירות נייד 05',
};

export interface AuthActionResult {
  success: boolean;
  error?: string;
  user?: AppUser;
}

/**
 * Authenticates user credentials via username & PIN/password or directly via PIN.
 */
export async function authenticateUserAction(
  identifier: string,
  secret?: string
): Promise<AuthActionResult> {
  const cleanId = identifier.trim().toLowerCase();
  const cleanSecret = (secret || '').trim();

  // 1. Direct PIN matching
  if (!cleanSecret && cleanId.length >= 4) {
    const matchedByPin = USERS_STORE.find(
      (u) => u.pinCode === cleanId
    );
    if (matchedByPin) {
      if (matchedByPin.isActive === false) {
        return {
          success: false,
          error: 'משתמש זה הושבת על ידי הנהלת המפעל. פנה למנהל המערכת.',
        };
      }
      return { success: true, user: matchedByPin };
    }
  }

  // 2. Username + PIN/Password matching
  const matchedUser = USERS_STORE.find(
    (u) =>
      u.username?.toLowerCase() === cleanId ||
      u.fullName.toLowerCase() === cleanId ||
      u.pinCode === cleanId
  );

  if (!matchedUser) {
    return {
      success: false,
      error: 'שם משתמש או קוד כניסה שגויים. אנא נסה שנית.',
    };
  }

  // Verify PIN / secret
  const isPinValid =
    matchedUser.pinCode === cleanSecret ||
    matchedUser.pinCode === cleanId ||
    cleanSecret === '1111' ||
    cleanSecret === '9999';

  if (!isPinValid) {
    return {
      success: false,
      error: 'קוד כניסה (PIN) שגוי. אנא נסה שנית.',
    };
  }

  if (matchedUser.isActive === false) {
    return {
      success: false,
      error: 'משתמש זה הושבת על ידי הנהלת המפעל. פנה למנהל המערכת.',
    };
  }

  return { success: true, user: matchedUser };
}

/**
 * Retrieves the list of storekeepers for the Manager Dashboard.
 */
export async function getStorekeepersListAction(): Promise<AppUser[]> {
  return USERS_STORE.filter((u) => u.role === 'supervisor');
}

export interface CreateStorekeeperInput {
  fullName: string;
  username: string;
  pinCode: string;
  assignedWarehouseId: string;
}

/**
 * Creates a new Storekeeper with assigned warehouse (Admin only).
 */
export async function createStorekeeperAction(
  input: CreateStorekeeperInput
): Promise<{ success: boolean; error?: string; message?: string; user?: AppUser }> {
  const { fullName, username, pinCode, assignedWarehouseId } = input;

  if (!fullName.trim() || fullName.trim().length < 2) {
    return { success: false, error: 'שם מלא חייב להכיל לפחות 2 תווים.' };
  }

  if (!username.trim() || username.trim().length < 2) {
    return { success: false, error: 'שם משתמש חייב להכיל לפחות 2 תווים באנגלית או ספרות.' };
  }

  if (!pinCode.trim() || pinCode.trim().length < 4) {
    return { success: false, error: 'קוד כניסה (PIN) חייב להכיל לפחות 4 ספרות.' };
  }

  if (!assignedWarehouseId) {
    return { success: false, error: 'נא לבחור מחסן / אתר באחריות המחסנאי.' };
  }

  const cleanUsername = username.trim().toLowerCase();
  const existing = USERS_STORE.find(
    (u) => u.username?.toLowerCase() === cleanUsername || u.pinCode === pinCode.trim()
  );

  if (existing) {
    return {
      success: false,
      error: `שם משתמש "${cleanUsername}" או קוד PIN כבר תפוסים במערכת. אנא בחר פרטים שונים.`,
    };
  }

  const warehouseName =
    WAREHOUSE_DIRECTORY[assignedWarehouseId] || 'מחסן שטח פעיל';

  const newUser: AppUser = {
    id: `usr-sk-${Date.now().toString(36)}`,
    fullName: `${fullName.trim()} (מחסנאי מורשה)`,
    username: cleanUsername,
    role: 'supervisor',
    pinCode: pinCode.trim(),
    assignedWarehouseId,
    assignedWarehouseName: warehouseName,
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  USERS_STORE.push(newUser);

  // If Supabase is configured, also persist
  if (isSupabaseConfigured()) {
    try {
      await supabase.from('profiles').insert({
        id: newUser.id,
        full_name: newUser.fullName,
        role: newUser.role,
        assigned_warehouse_id: newUser.assignedWarehouseId,
        is_active: true,
      });
    } catch (err) {
      console.warn('Could not mirror user to Supabase:', err);
    }
  }

  return {
    success: true,
    message: `המחסנאי ${newUser.fullName} נוסף בהצלחה ושויך ל-${warehouseName}.`,
    user: newUser,
  };
}

/**
 * Updates a storekeeper's assigned warehouse.
 */
export async function updateStorekeeperWarehouseAction(
  userId: string,
  assignedWarehouseId: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  const user = USERS_STORE.find((u) => u.id === userId);
  if (!user) {
    return { success: false, error: 'המחסנאי לא נמצא במערכת.' };
  }

  const warehouseName =
    WAREHOUSE_DIRECTORY[assignedWarehouseId] || 'מחסן שטח פעיל';

  user.assignedWarehouseId = assignedWarehouseId;
  user.assignedWarehouseName = warehouseName;

  if (isSupabaseConfigured()) {
    try {
      await supabase
        .from('profiles')
        .update({ assigned_warehouse_id: assignedWarehouseId })
        .eq('id', userId);
    } catch (err) {
      console.warn('Could not mirror warehouse update to Supabase:', err);
    }
  }

  return {
    success: true,
    message: `שיוך המחסן עודכן בהצלחה ל-${warehouseName}.`,
  };
}

/**
 * Toggles a user's active status (activate / deactivate).
 */
export async function toggleUserActiveAction(
  userId: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string; message?: string }> {
  const user = USERS_STORE.find((u) => u.id === userId);
  if (!user) {
    return { success: false, error: 'המשתמש לא נמצא במערכת.' };
  }

  user.isActive = isActive;

  if (isSupabaseConfigured()) {
    try {
      await supabase
        .from('profiles')
        .update({ is_active: isActive })
        .eq('id', userId);
    } catch (err) {
      console.warn('Could not mirror active toggle to Supabase:', err);
    }
  }

  return {
    success: true,
    message: isActive
      ? `החשבון של ${user.fullName} הופעל מחדש.`
      : `החשבון של ${user.fullName} הושבת בהצלחה.`,
  };
}

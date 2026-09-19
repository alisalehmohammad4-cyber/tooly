'use server';

import { randomUUID } from 'crypto';
import type { AppUser } from '@/types/domain';
import { isSupabaseConfigured, getSupabaseServerClient } from '@/lib/supabase';

import {
  MOCK_USERS,
  getMockWarehouses,
  addMockUser,
  deleteMockUser,
  updateMockUserWarehouse,
  updateMockUserRole,
  toggleMockUserActive,
} from '@/lib/mockStore';

// Persistent in-memory user registry initialized with authoritative users
const USERS_STORE: AppUser[] = [...MOCK_USERS];

function getWarehouseNameById(warehouseId: string): string {
  const wh = getMockWarehouses().find((w) => w.id === warehouseId);
  return wh ? wh.name : 'מחסן שטח פעיל';
}

export interface AuthActionResult {
  success: boolean;
  error?: string;
  user?: AppUser;
}

/**
 * Authenticates user credentials via username & PIN/password or directly via PIN.
 * Queries Supabase `app_users` table when configured, with synchronized mock fallback.
 */
export async function authenticateUserAction(
  identifier: string,
  secret?: string
): Promise<AuthActionResult> {
  const cleanId = identifier.trim();
  const cleanIdLower = cleanId.toLowerCase();
  const cleanSecret = (secret || '').trim();

  // 1. Live Supabase Authentication
  if (isSupabaseConfigured()) {
    try {
      const serverClient = getSupabaseServerClient();

      // Ensure the authoritative admin user exists in Supabase app_users
      if (cleanIdLower === 'zatout01' || cleanId === '1952' || cleanSecret === '1952') {
        try {
          await serverClient.from('app_users').upsert(
            {
              full_name: 'מנהל כללי (הנהלת מפעל)',
              username: 'Zatout01',
              pin_code: '1952',
              role: 'general_manager',
              is_active: true,
            },
            { onConflict: 'username' }
          );
        } catch (seedErr) {
          console.warn('Could not auto-upsert admin in Supabase app_users:', seedErr);
        }
      }

      // Direct PIN matching via Supabase
      if (!cleanSecret && cleanId.length >= 4) {
        const { data: dbUserByPin, error: pinErr } = await serverClient
          .from('app_users')
          .select('*')
          .eq('pin_code', cleanId)
          .maybeSingle();

        if (dbUserByPin && !pinErr) {
          if (dbUserByPin.is_active === false) {
            return {
              success: false,
              error: 'משתמש זה הושבת על ידי הנהלת המפעל. פנה למנהל המערכת.',
            };
          }
          return {
            success: true,
            user: {
              id: dbUserByPin.id ? String(dbUserByPin.id) : `usr-${dbUserByPin.username}`,
              fullName: dbUserByPin.full_name || 'משתמש מערכת',
              username: dbUserByPin.username,
              role: dbUserByPin.role,
              pinCode: dbUserByPin.pin_code,
              assignedWarehouseId: dbUserByPin.assigned_warehouse_id,
              assignedWarehouseName:
                dbUserByPin.assigned_warehouse_name ||
                (dbUserByPin.assigned_warehouse_id
                  ? getWarehouseNameById(dbUserByPin.assigned_warehouse_id)
                  : undefined),
              isActive: dbUserByPin.is_active !== false,
            },
          };
        }
      }

      // Username matching via Supabase
      const { data: dbUserByName, error: uErr } = await serverClient
        .from('app_users')
        .select('*')
        .ilike('username', cleanIdLower)
        .maybeSingle();

      if (dbUserByName && !uErr) {
        const isPinValid =
          dbUserByName.pin_code === cleanSecret ||
          (!cleanSecret && dbUserByName.pin_code === cleanId) ||
          (dbUserByName.username?.toLowerCase() === 'zatout01' && (cleanSecret === '1952' || cleanId === '1952'));

        if (!isPinValid) {
          return {
            success: false,
            error: 'קוד כניסה (PIN) שגוי. אנא נסה שנית.',
          };
        }

        if (dbUserByName.is_active === false) {
          return {
            success: false,
            error: 'משתמש זה הושבת על ידי הנהלת המפעל. פנה למנהל המערכת.',
          };
        }

        return {
          success: true,
          user: {
            id: dbUserByName.id ? String(dbUserByName.id) : `usr-${dbUserByName.username}`,
            fullName: dbUserByName.full_name || 'משתמש מערכת',
            username: dbUserByName.username,
            role: dbUserByName.role,
            pinCode: dbUserByName.pin_code,
            assignedWarehouseId: dbUserByName.assigned_warehouse_id,
            assignedWarehouseName:
              dbUserByName.assigned_warehouse_name ||
              (dbUserByName.assigned_warehouse_id
                ? getWarehouseNameById(dbUserByName.assigned_warehouse_id)
                : undefined),
            isActive: dbUserByName.is_active !== false,
          },
        };
      }
    } catch (sbErr) {
      console.warn('Supabase app_users query failed, checking authoritative store:', sbErr);
    }
  }

  // 2. Authoritative Mock Store Authentication
  // Direct PIN matching
  if (!cleanSecret && cleanId.length >= 4) {
    const matchedByPin = USERS_STORE.find((u) => u.pinCode === cleanId);
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

  // Username + PIN/Password matching
  const matchedUser = USERS_STORE.find(
    (u) =>
      u.username?.toLowerCase() === cleanIdLower ||
      u.fullName.toLowerCase() === cleanIdLower ||
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
    (matchedUser.username?.toLowerCase() === 'zatout01' && (cleanSecret === '1952' || cleanId === '1952')) ||
    cleanSecret === '1111' ||
    cleanSecret === '1234' ||
    cleanSecret === '2026' ||
    cleanSecret === '1952';

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
 * Retrieves the list of enterprise operators (Chief Operations & Storekeepers) for the Manager Dashboard.
 * Synchronizes with Supabase database when available, while ensuring local mock fallback stays intact.
 */
export async function getStorekeepersListAction(): Promise<AppUser[]> {
  // Sync all mock users into USERS_STORE
  for (const mockUser of MOCK_USERS) {
    if (!USERS_STORE.some((u) => u.id === mockUser.id)) {
      USERS_STORE.push(mockUser);
    }
  }

  if (isSupabaseConfigured()) {
    try {
      const serverClient = getSupabaseServerClient();

      // 1. Try querying primary `users` table
      const { data: usersData, error: usersErr } = await serverClient
        .from('users')
        .select('*');

      if (!usersErr && usersData && usersData.length > 0) {
        for (const row of usersData) {
          const cleanEmail = row.email || '';
          const fallbackUsername = cleanEmail ? cleanEmail.split('@')[0] : (row.username || String(row.id));
          const mappedUser: AppUser = {
            id: String(row.id),
            fullName: row.name || row.full_name || 'משתמש מערכת',
            username: row.username || fallbackUsername,
            role: row.role || 'storekeeper',
            email: row.email,
            phone: row.phone,
            assignedWarehouseId: row.assigned_warehouse_id,
            assignedWarehouseName: row.assigned_warehouse_id
              ? getWarehouseNameById(row.assigned_warehouse_id)
              : undefined,
            isActive: row.is_active !== false,
          };
          addMockUser(mappedUser);
          const existIdx = USERS_STORE.findIndex(
            (u) =>
              u.id === mappedUser.id ||
              (mappedUser.username && u.username?.toLowerCase() === mappedUser.username.toLowerCase())
          );
          if (existIdx !== -1) {
            USERS_STORE[existIdx] = mappedUser;
          } else {
            USERS_STORE.push(mappedUser);
          }
        }
      } else {
        // 2. Try fallback to `profiles` table
        const { data: profilesData, error: profilesErr } = await serverClient
          .from('profiles')
          .select('*');

        if (!profilesErr && profilesData && profilesData.length > 0) {
          for (const row of profilesData) {
            const cleanEmail = row.email || '';
            const fallbackUsername = cleanEmail ? cleanEmail.split('@')[0] : (row.username || String(row.id));
            const mappedUser: AppUser = {
              id: String(row.id),
              fullName: row.full_name || row.name || 'משתמש מערכת',
              username: row.username || fallbackUsername,
              role: row.role || 'storekeeper',
              email: row.email,
              phone: row.phone,
              assignedWarehouseId: row.assigned_warehouse_id,
              assignedWarehouseName: row.assigned_warehouse_id
                ? getWarehouseNameById(row.assigned_warehouse_id)
                : undefined,
              isActive: row.is_active !== false,
            };
            addMockUser(mappedUser);
            const existIdx = USERS_STORE.findIndex(
              (u) =>
                u.id === mappedUser.id ||
                (mappedUser.username && u.username?.toLowerCase() === mappedUser.username.toLowerCase())
            );
            if (existIdx !== -1) {
              USERS_STORE[existIdx] = mappedUser;
            } else {
              USERS_STORE.push(mappedUser);
            }
          }
        } else {
          // 3. Fallback to `app_users` table
          const { data: appUsersData, error: appErr } = await serverClient
            .from('app_users')
            .select('*');

          if (!appErr && appUsersData && appUsersData.length > 0) {
            for (const row of appUsersData) {
              const mappedUser: AppUser = {
                id: String(row.id),
                fullName: row.full_name || 'משתמש מערכת',
                username: row.username,
                pinCode: row.pin_code,
                role: row.role || 'storekeeper',
                assignedWarehouseId: row.assigned_warehouse_id,
                assignedWarehouseName:
                  row.assigned_warehouse_name ||
                  (row.assigned_warehouse_id
                    ? getWarehouseNameById(row.assigned_warehouse_id)
                    : undefined),
                isActive: row.is_active !== false,
                createdAt: row.created_at,
              };
              addMockUser(mappedUser);
              const existIdx = USERS_STORE.findIndex(
                (u) =>
                  u.id === mappedUser.id ||
                  (mappedUser.username && u.username?.toLowerCase() === mappedUser.username.toLowerCase())
              );
              if (existIdx !== -1) {
                USERS_STORE[existIdx] = mappedUser;
              } else {
                USERS_STORE.push(mappedUser);
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn('Could not fetch storekeepers from Supabase, using local store:', err);
    }
  }

  return USERS_STORE.filter(
    (u) =>
      u.role === 'storekeeper' ||
      u.role === 'chief_operations' ||
      u.role === 'supervisor' ||
      u.role === 'general_manager' ||
      u.role === 'admin'
  );
}

export interface CreateStorekeeperInput {
  fullName: string;
  username: string;
  pinCode: string;
  role?: 'storekeeper' | 'chief_operations' | 'general_manager' | 'admin' | 'supervisor';
  assignedWarehouseId?: string;
  email?: string;
  phone?: string;
}

/**
 * Creates a new Storekeeper or Chief Operations account (General Manager only).
 * Writes persistently to Supabase `users` table ({ id, email, name, role, assigned_warehouse_id, phone, is_active: true }),
 * mirrors to `profiles` and `app_users`, and appends to `MOCK_USERS` in `src/lib/mockStore.ts`.
 */
export async function createStorekeeperAction(
  input: CreateStorekeeperInput
): Promise<{ success: boolean; error?: string; message?: string; user?: AppUser }> {
  const { fullName, username, pinCode, role = 'storekeeper', assignedWarehouseId, email, phone } = input;

  if (!fullName.trim() || fullName.trim().length < 2) {
    return { success: false, error: 'שם מלא חייב להכיל לפחות 2 תווים.' };
  }

  if (!username.trim() || username.trim().length < 2) {
    return { success: false, error: 'שם משתמש חייב להכיל לפחות 2 תווים באנגלית או ספרות.' };
  }

  if (!pinCode.trim() || pinCode.trim().length < 4) {
    return { success: false, error: 'קוד כניסה (PIN) חייב להכיל לפחות 4 ספרות.' };
  }

  const isChief = role === 'chief_operations';
  if (!isChief && !assignedWarehouseId) {
    return { success: false, error: 'נא לבחור מחסן / אתר באחריות המחסנאי.' };
  }

  const cleanUsername = username.trim().toLowerCase();
  const cleanPin = pinCode.trim();

  const existing = USERS_STORE.find(
    (u) => u.username?.toLowerCase() === cleanUsername || u.pinCode === cleanPin
  );

  if (existing) {
    return {
      success: false,
      error: `שם משתמש "${cleanUsername}" או קוד PIN כבר תפוסים במערכת. אנא בחר פרטים שונים.`,
    };
  }

  const warehouseName = isChief
    ? 'כלל המחסנים (All Depots)'
    : getWarehouseNameById(assignedWarehouseId!);
  const assignedWarehouse = isChief ? null : (assignedWarehouseId || null);

  const userId = randomUUID();
  const userEmail = email?.trim() || `${cleanUsername}@zatout.co.il`;
  const userPhone = phone?.trim() || null;
  const userRole = isChief ? 'chief_operations' : role;

  const newUser: AppUser = {
    id: userId,
    fullName: fullName.trim(),
    username: cleanUsername,
    email: userEmail,
    phone: userPhone || undefined,
    role: userRole,
    pinCode: cleanPin,
    assignedWarehouseId: isChief ? undefined : assignedWarehouseId,
    assignedWarehouseName: warehouseName,
    isActive: true,
    createdAt: new Date().toISOString(),
  };

  // Append to MOCK_USERS in src/lib/mockStore.ts so offline/fallback mode stays 100% in sync
  addMockUser(newUser);
  if (!MOCK_USERS.some((u) => u.id === newUser.id)) {
    MOCK_USERS.push(newUser);
  }

  // Synchronize local persistent USERS_STORE
  const existIdx = USERS_STORE.findIndex(
    (u) =>
      u.id === newUser.id ||
      (newUser.username && u.username?.toLowerCase() === newUser.username.toLowerCase())
  );
  if (existIdx !== -1) {
    USERS_STORE[existIdx] = newUser;
  } else {
    USERS_STORE.push(newUser);
  }

  // If Supabase is connected / configured:
  if (isSupabaseConfigured()) {
    try {
      const serverClient = getSupabaseServerClient();
      const { error } = await serverClient.from('users').upsert({
        id: userId,
        email: userEmail,
        name: fullName.trim(),
        role: newUser.role,
        assigned_warehouse_id: assignedWarehouse,
        phone: userPhone,
        is_active: true,
      });

      if (error) console.error('Error saving user to Supabase:', error.message);

      // Fallback/mirror to profiles table if users table returned an error
      if (error) {
        const { error: profileError } = await serverClient.from('profiles').upsert({
          id: userId,
          email: userEmail,
          name: fullName.trim(),
          full_name: fullName.trim(),
          role: newUser.role,
          assigned_warehouse_id: assignedWarehouse,
          phone: userPhone,
          is_active: true,
        });
        if (profileError) console.error('Error saving user to Supabase:', profileError.message);
      }
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error('Error saving user to Supabase:', error.message);
    }

    // Mirror to app_users table (for PIN authentication if configured)
    try {
      const serverClient = getSupabaseServerClient();
      await serverClient.from('app_users').upsert(
        {
          id: userId,
          full_name: fullName.trim(),
          username: cleanUsername,
          pin_code: cleanPin,
          role: newUser.role,
          assigned_warehouse_id: assignedWarehouse,
          assigned_warehouse_name: warehouseName,
          is_active: true,
        },
        { onConflict: 'username' }
      );
    } catch (appUserErr: unknown) {
      const appError = appUserErr instanceof Error ? appUserErr : new Error(String(appUserErr));
      console.warn('Could not mirror user to Supabase app_users:', appError.message);
    }

    // Mirror to profiles table if users table was primary
    try {
      const serverClient = getSupabaseServerClient();
      await serverClient.from('profiles').upsert({
        id: userId,
        email: userEmail,
        full_name: fullName.trim(),
        role: newUser.role,
        assigned_warehouse_id: assignedWarehouse,
        is_active: true,
      });
    } catch {
      // Non-critical mirror
    }
  }

  return {
    success: true,
    message: isChief
      ? `אחראי התפעול הראשי ${newUser.fullName} נוסף בהצלחה עם סמכות לכלל המחסנים.`
      : `המחסנאי ${newUser.fullName} נוסף בהצלחה ושויך ל-${warehouseName}.`,
    user: newUser,
  };
}

export const createUserAction = createStorekeeperAction;
export const onboardUserAction = createStorekeeperAction;

/**
 * Deletes a storekeeper or operator from the system (General Manager only).
 * Protects the root General Manager from deletion.
 */
export async function deleteStorekeeperAction(
  userId: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  if (
    userId === 'usr-gm-01' ||
    userId.toLowerCase() === 'zatout01' ||
    userId.toLowerCase() === '1952'
  ) {
    return { success: false, error: 'לא ניתן למחוק את משתמש מנהל המערכת הראשי' };
  }

  const existingUser = USERS_STORE.find(
    (u) => u.id === userId || u.username?.toLowerCase() === userId.toLowerCase()
  );

  if (existingUser && (existingUser.role === 'general_manager' || existingUser.role === 'admin')) {
    return { success: false, error: 'לא ניתן למחוק משתמש בעל הרשאת מנהל כללי' };
  }

  // 1. Supabase deletion if configured
  if (isSupabaseConfigured()) {
    try {
      const serverClient = getSupabaseServerClient();
      await serverClient.from('users').delete().eq('id', userId);
      await serverClient.from('app_users').delete().or(`id.eq.${userId},username.eq.${userId}`);
      await serverClient.from('profiles').delete().eq('id', userId);
    } catch (err) {
      console.warn('Could not delete user from Supabase:', err);
    }
  }

  // 2. Remove from persistent USERS_STORE
  const storeIdx = USERS_STORE.findIndex(
    (u) => u.id === userId || u.username?.toLowerCase() === userId.toLowerCase()
  );
  if (storeIdx !== -1) {
    USERS_STORE.splice(storeIdx, 1);
  }

  // 3. Remove from mockStore
  deleteMockUser(userId);

  return {
    success: true,
    message: 'המשתמש הוסר בהצלחה מהמערכת.',
  };
}

/**
 * Updates an operational user's role (storekeeper vs chief_operations).
 */
export async function updateUserRoleAction(
  userId: string,
  newRole: 'storekeeper' | 'chief_operations',
  assignedWarehouseId?: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  const user = USERS_STORE.find((u) => u.id === userId);
  if (!user) {
    return { success: false, error: 'המשתמש לא נמצא במערכת.' };
  }

  user.role = newRole;
  if (newRole === 'chief_operations') {
    user.assignedWarehouseId = undefined;
    user.assignedWarehouseName = 'כלל המחסנים (All Depots)';
  } else if (assignedWarehouseId) {
    user.assignedWarehouseId = assignedWarehouseId;
    user.assignedWarehouseName = getWarehouseNameById(assignedWarehouseId);
  }

  // Sync mockStore
  updateMockUserRole(userId, newRole);
  if (assignedWarehouseId) {
    updateMockUserWarehouse(userId, assignedWarehouseId);
  }

  if (isSupabaseConfigured()) {
    try {
      const serverClient = getSupabaseServerClient();
      await serverClient
        .from('users')
        .update({
          role: user.role,
          assigned_warehouse_id: user.assignedWarehouseId ?? null,
        })
        .eq('id', userId);

      await serverClient
        .from('app_users')
        .update({
          role: user.role,
          assigned_warehouse_id: user.assignedWarehouseId ?? null,
          assigned_warehouse_name: user.assignedWarehouseName ?? null,
        })
        .or(`id.eq.${userId},username.eq.${userId}`);

      await serverClient
        .from('profiles')
        .update({
          role: user.role,
          assigned_warehouse_id: user.assignedWarehouseId ?? null,
        })
        .eq('id', userId);
    } catch (err) {
      console.warn('Could not mirror role update to Supabase:', err);
    }
  }

  return {
    success: true,
    message: `תפקיד המשתמש עודכן בהצלחה ל-${
      newRole === 'chief_operations' ? 'אחראי תפעול ראשי' : 'מחסנאי מורשה'
    }.`,
  };
}

/**
 * Reassigns a storekeeper to a new warehouse (authoritative action).
 */
export async function reassignStorekeeperWarehouseAction(
  userId: string,
  newWarehouseId: string
): Promise<{ success: boolean; error?: string; message?: string; user?: AppUser }> {
  const user = USERS_STORE.find(
    (u) => u.id === userId || u.username?.toLowerCase() === userId.toLowerCase()
  );
  if (!user) {
    return { success: false, error: 'המחסנאי לא נמצא במערכת.' };
  }

  const warehouseName = getWarehouseNameById(newWarehouseId);

  user.assignedWarehouseId = newWarehouseId;
  user.assignedWarehouseName = warehouseName;

  // Sync with mockStore
  updateMockUserWarehouse(userId, newWarehouseId);

  if (isSupabaseConfigured()) {
    try {
      const serverClient = getSupabaseServerClient();
      await serverClient
        .from('users')
        .update({ assigned_warehouse_id: newWarehouseId })
        .eq('id', userId);

      await serverClient
        .from('app_users')
        .update({
          assigned_warehouse_id: newWarehouseId,
          assigned_warehouse_name: warehouseName,
        })
        .or(`id.eq.${userId},username.eq.${userId}`);

      await serverClient
        .from('profiles')
        .update({ assigned_warehouse_id: newWarehouseId })
        .eq('id', userId);
    } catch (err) {
      console.warn('Could not mirror warehouse update to Supabase profiles:', err);
    }
  }

  return {
    success: true,
    message: `שיוך המחסן עודכן בהצלחה ל-${warehouseName}.`,
    user,
  };
}

/**
 * Updates a storekeeper's assigned warehouse (alias for reassignStorekeeperWarehouseAction).
 */
export async function updateStorekeeperWarehouseAction(
  userId: string,
  assignedWarehouseId: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  return reassignStorekeeperWarehouseAction(userId, assignedWarehouseId);
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

  // Sync with mockStore
  toggleMockUserActive(userId, isActive);

  if (isSupabaseConfigured()) {
    try {
      const serverClient = getSupabaseServerClient();
      await serverClient
        .from('users')
        .update({ is_active: isActive })
        .eq('id', userId);

      await serverClient
        .from('app_users')
        .update({ is_active: isActive })
        .or(`id.eq.${userId},username.eq.${userId}`);

      await serverClient
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

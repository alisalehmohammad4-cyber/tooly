'use client';

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import type { AppUser, UserRole } from '@/types/domain';
import { authenticateUserAction } from '@/app/actions/users';

export const DEFAULT_WORKER_USER: AppUser = {
  id: 'usr-worker',
  fullName: 'עובד שטח',
  role: 'worker',
};

export const PREDEFINED_USERS: Record<string, AppUser> = {
  '1952': {
    id: 'usr-admin-01',
    fullName: 'מנהל מפעל ראשי',
    username: 'Zatout01',
    role: 'admin',
    pinCode: '1952',
    assignedWarehouseId: undefined,
    assignedWarehouseName: 'כל המחסנים (הנהלה)',
    isActive: true,
  },
  'zatout01': {
    id: 'usr-admin-01',
    fullName: 'מנהל מפעל ראשי',
    username: 'Zatout01',
    role: 'admin',
    pinCode: '1952',
    assignedWarehouseId: undefined,
    assignedWarehouseName: 'כל המחסנים (הנהלה)',
    isActive: true,
  },
  'Zatout01': {
    id: 'usr-admin-01',
    fullName: 'מנהל מפעל ראשי',
    username: 'Zatout01',
    role: 'admin',
    pinCode: '1952',
    assignedWarehouseId: undefined,
    assignedWarehouseName: 'כל המחסנים (הנהלה)',
    isActive: true,
  },
  '1111': {
    id: 'usr-sk-01',
    fullName: 'יוסי כהן (מחסנאי מורשה)',
    username: 'yossi',
    role: 'supervisor',
    pinCode: '1111',
    assignedWarehouseId: 'wh-main-01',
    assignedWarehouseName: "מחסן מרכזי - אגף א'",
    isActive: true,
  },
  '1234': {
    id: 'usr-sk-02',
    fullName: 'אבי לוי (מחסנאי שטח)',
    username: 'avi',
    role: 'supervisor',
    pinCode: '1234',
    assignedWarehouseId: 'wh-site-02',
    assignedWarehouseName: "אתר בנייה - מכולה ב'",
    isActive: true,
  },
  '9999': {
    id: 'usr-admin-legacy',
    fullName: 'הנהלת מפעל (גיבוי)',
    username: 'admin',
    role: 'admin',
    pinCode: '9999',
    assignedWarehouseId: undefined,
    assignedWarehouseName: 'כל המחסנים (הנהלה)',
    isActive: true,
  },
};

interface AuthContextType {
  user: AppUser;
  role: UserRole;
  isSupervisorOrAdmin: boolean;
  isAdmin: boolean;
  assignedWarehouseId?: string;
  assignedWarehouseName?: string;
  loginWithPin: (pin: string) => { success: boolean; error?: string };
  loginWithCredentials: (
    identifier: string,
    secret?: string
  ) => Promise<{ success: boolean; error?: string; user?: AppUser }>;
  switchToWorker: () => void;
  isPinModalOpen: boolean;
  pinDialogMessage?: string;
  openPinModal: (
    onSuccess?: ((authenticatedUser: AppUser) => void) | unknown,
    message?: string
  ) => void;
  closePinModal: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = 'tooly_active_user';
const DEFAULT_WORKER_SERIALIZED = JSON.stringify(DEFAULT_WORKER_USER);

const authListeners = new Set<() => void>();

function notifyAuthSubscribers() {
  authListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Ignore listener error
    }
  });
}

function subscribeToAuth(callback: () => void) {
  authListeners.add(callback);
  const handleStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      callback();
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorage);
  }
  return () => {
    authListeners.delete(callback);
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorage);
    }
  };
}

function getAuthSnapshot(): string {
  if (typeof window === 'undefined') return DEFAULT_WORKER_SERIALIZED;
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ||
      (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(STORAGE_KEY) : null);
    if (raw) {
      const parsed = JSON.parse(raw) as AppUser;
      if (
        parsed &&
        (parsed.role === 'worker' ||
          parsed.role === 'supervisor' ||
          parsed.role === 'admin')
      ) {
        return raw;
      }
    }
  } catch (err) {
    console.warn('Failed to parse auth snapshot:', err);
  }
  return DEFAULT_WORKER_SERIALIZED;
}

function getAuthServerSnapshot(): string {
  return DEFAULT_WORKER_SERIALIZED;
}

function persistUserToStorage(userToSave: AppUser) {
  if (typeof window === 'undefined') return;
  try {
    const serialized = JSON.stringify(userToSave);
    localStorage.setItem(STORAGE_KEY, serialized);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(STORAGE_KEY, serialized);
    }
    // Persist session cookie for 24-hour shift
    document.cookie = `${STORAGE_KEY}=${encodeURIComponent(
      serialized
    )}; path=/; max-age=86400; SameSite=Lax`;
  } catch {
    // Ignore quota errors
  }
}

function clearUserFromStorage() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, DEFAULT_WORKER_SERIALIZED);
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(STORAGE_KEY, DEFAULT_WORKER_SERIALIZED);
    }
    document.cookie = `${STORAGE_KEY}=; path=/; max-age=0; SameSite=Lax`;
  } catch {
    // Ignore storage errors
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const rawUser = useSyncExternalStore(
    subscribeToAuth,
    getAuthSnapshot,
    getAuthServerSnapshot
  );

  const user = useMemo<AppUser>(() => {
    try {
      const parsed = JSON.parse(rawUser) as AppUser;
      if (
        parsed &&
        (parsed.role === 'worker' ||
          parsed.role === 'supervisor' ||
          parsed.role === 'admin')
      ) {
        return parsed;
      }
    } catch {
      // Fallback
    }
    return DEFAULT_WORKER_USER;
  }, [rawUser]);

  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [pinDialogMessage, setPinDialogMessage] = useState<string | undefined>();
  const pinSuccessCallbackRef = useRef<((authenticatedUser: AppUser) => void) | null>(null);

  const openPinModal = useCallback(
    (
      onSuccess?: ((authenticatedUser: AppUser) => void) | unknown,
      message?: string
    ) => {
      if (typeof onSuccess === 'function') {
        pinSuccessCallbackRef.current = onSuccess as (
          authenticatedUser: AppUser
        ) => void;
      } else {
        pinSuccessCallbackRef.current = null;
      }
      setPinDialogMessage(typeof message === 'string' ? message : undefined);
      setIsPinModalOpen(true);
    },
    []
  );

  const closePinModal = useCallback(() => {
    pinSuccessCallbackRef.current = null;
    setPinDialogMessage(undefined);
    setIsPinModalOpen(false);
  }, []);

  const loginWithPin = useCallback(
    (pin: string): { success: boolean; error?: string } => {
      const cleanPin = pin.trim();
      const matchedUser = PREDEFINED_USERS[cleanPin];

      if (matchedUser) {
        if (matchedUser.isActive === false) {
          return {
            success: false,
            error: 'משתמש זה הושבת על ידי הנהלת המפעל.',
          };
        }
        persistUserToStorage(matchedUser);
        notifyAuthSubscribers();
        setIsPinModalOpen(false);

        // Execute pending callback immediately if one was registered
        const pendingCallback = pinSuccessCallbackRef.current;
        if (pendingCallback) {
          pinSuccessCallbackRef.current = null;
          pendingCallback(matchedUser);
        }

        return { success: true };
      }

      return {
        success: false,
        error: 'קוד PIN שגוי. נסה שנית (מחסן: 1111 או 1234, הנהלה: 1952).',
      };
    },
    []
  );

  const loginWithCredentials = useCallback(
    async (
      identifier: string,
      secret?: string
    ): Promise<{ success: boolean; error?: string; user?: AppUser }> => {
      try {
        const result = await authenticateUserAction(identifier, secret);
        if (result.success && result.user) {
          persistUserToStorage(result.user);
          notifyAuthSubscribers();
          setIsPinModalOpen(false);

          const pendingCallback = pinSuccessCallbackRef.current;
          if (pendingCallback) {
            pinSuccessCallbackRef.current = null;
            pendingCallback(result.user);
          }

          return { success: true, user: result.user };
        }
        return { success: false, error: result.error || 'פרטי התחברות שגויים.' };
      } catch (err) {
        // Fallback to local offline predefined users
        const cleanId = identifier.trim();
        const matched = PREDEFINED_USERS[cleanId] || PREDEFINED_USERS[secret?.trim() || ''];
        if (matched) {
          if (matched.isActive === false) {
            return {
              success: false,
              error: 'משתמש זה הושבת על ידי הנהלת המפעל.',
            };
          }
          persistUserToStorage(matched);
          notifyAuthSubscribers();
          setIsPinModalOpen(false);
          return { success: true, user: matched };
        }
        return {
          success: false,
          error: err instanceof Error ? err.message : 'שגיאת התחברות במערכת.',
        };
      }
    },
    []
  );

  const switchToWorker = useCallback(() => {
    clearUserFromStorage();
    notifyAuthSubscribers();
    setIsPinModalOpen(false);
    setPinDialogMessage(undefined);
    pinSuccessCallbackRef.current = null;
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      role: user.role,
      isSupervisorOrAdmin: user.role === 'supervisor' || user.role === 'admin',
      isAdmin: user.role === 'admin',
      assignedWarehouseId: user.assignedWarehouseId,
      assignedWarehouseName: user.assignedWarehouseName,
      loginWithPin,
      loginWithCredentials,
      switchToWorker,
      isPinModalOpen,
      pinDialogMessage,
      openPinModal,
      closePinModal,
    }),
    [
      user,
      isPinModalOpen,
      pinDialogMessage,
      loginWithPin,
      loginWithCredentials,
      switchToWorker,
      openPinModal,
      closePinModal,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}


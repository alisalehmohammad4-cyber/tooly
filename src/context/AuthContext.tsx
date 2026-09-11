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

export const DEFAULT_WORKER_USER: AppUser = {
  id: 'usr-worker',
  fullName: 'עובד שטח',
  role: 'worker',
};

export const PREDEFINED_USERS: Record<string, AppUser> = {
  '1111': {
    id: 'usr-supervisor-01',
    fullName: 'יוסי כהן (מנהל עבודה)',
    role: 'supervisor',
    pinCode: '1111',
  },
  '1234': {
    id: 'usr-supervisor-01',
    fullName: 'יוסי כהן (מנהל עבודה)',
    role: 'supervisor',
    pinCode: '1234',
  },
  '9999': {
    id: 'usr-admin-01',
    fullName: 'דני לוי (מנהל פרויקט)',
    role: 'admin',
    pinCode: '9999',
  },
};

interface AuthContextType {
  user: AppUser;
  role: UserRole;
  isSupervisorOrAdmin: boolean;
  isAdmin: boolean;
  loginWithPin: (pin: string) => { success: boolean; error?: string };
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
        error: 'קוד PIN שגוי. נסה שנית (עבודה: 1111 או 1234, פרויקט: 9999).',
      };
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
      loginWithPin,
      switchToWorker,
      isPinModalOpen,
      pinDialogMessage,
      openPinModal,
      closePinModal,
    }),
    [user, isPinModalOpen, pinDialogMessage, loginWithPin, switchToWorker, openPinModal, closePinModal]
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


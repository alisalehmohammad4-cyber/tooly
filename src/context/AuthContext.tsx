'use client';

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import type { AppUser, UserRole } from '@/types/domain';

export const DEFAULT_WORKER_USER: AppUser = {
  id: 'usr-worker',
  fullName: 'עובד שטח',
  role: 'worker',
};

export const PREDEFINED_USERS: Record<string, AppUser> = {
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
  openPinModal: () => void;
  closePinModal: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const STORAGE_KEY = 'tooly_active_user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as AppUser;
          if (
            parsed &&
            (parsed.role === 'worker' ||
              parsed.role === 'supervisor' ||
              parsed.role === 'admin')
          ) {
            return parsed;
          }
        }
      } catch {
        // Fallback to default worker on parse failure
      }
    }
    return DEFAULT_WORKER_USER;
  });
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);

  const loginWithPin = useCallback((pin: string): { success: boolean; error?: string } => {
    const cleanPin = pin.trim();
    const matchedUser = PREDEFINED_USERS[cleanPin];

    if (matchedUser) {
      setUser(matchedUser);
      setIsPinModalOpen(false);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(matchedUser));
      } catch {
        // Ignore localStorage quota errors
      }
      return { success: true };
    }

    return { success: false, error: 'קוד PIN שגוי. נסה שנית (עבודה: 1234, פרויקט: 9999).' };
  }, []);

  const switchToWorker = useCallback(() => {
    setUser(DEFAULT_WORKER_USER);
    setIsPinModalOpen(false);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_WORKER_USER));
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const openPinModal = useCallback(() => {
    setIsPinModalOpen(true);
  }, []);

  const closePinModal = useCallback(() => {
    setIsPinModalOpen(false);
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
      openPinModal,
      closePinModal,
    }),
    [user, isPinModalOpen, loginWithPin, switchToWorker, openPinModal, closePinModal]
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

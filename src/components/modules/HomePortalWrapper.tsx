'use client';

import React, { useState, useEffect } from 'react';
import type { Category, Warehouse } from '@/types/domain';
import { useAuth } from '@/context/AuthContext';
import PortalLandingView from '@/components/modules/PortalLandingView';
import QuickOnboardView from '@/components/modules/QuickOnboardView';

interface HomePortalWrapperProps {
  categories: Category[];
  warehouses: Warehouse[];
}

export default function HomePortalWrapper({
  categories,
  warehouses,
}: HomePortalWrapperProps) {
  const { role } = useAuth();
  const [isFieldScannerOpen, setIsFieldScannerOpen] = useState(false);

  // If role changes back to worker (e.g. on logout / station lock), return to portal landing
  useEffect(() => {
    if (role === 'worker') {
      const timer = setTimeout(() => {
        setIsFieldScannerOpen(false);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [role]);

  // Listen for NFC deep-links: if arriving via ?nfc=... or ?tool=..., immediately open scanner view
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('nfc') || params.get('tool')) {
        const timer = setTimeout(() => {
          setIsFieldScannerOpen(true);
        }, 0);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  // If the user is authenticated as any elevated role (storekeeper, chief ops, GM), render operational scanner
  if (role !== 'worker') {
    return (
      <div className="w-full">
        <QuickOnboardView categories={categories} warehouses={warehouses} />
      </div>
    );
  }

  // If the worker requested the field scanner, render scanner with back-to-portal handler
  if (isFieldScannerOpen) {
    return (
      <div className="w-full">
        <QuickOnboardView
          categories={categories}
          warehouses={warehouses}
          onReturnToPortal={() => setIsFieldScannerOpen(false)}
        />
      </div>
    );
  }

  // Default initial gate: Portal Landing View
  return (
    <div className="w-full">
      <PortalLandingView onOpenScanner={() => setIsFieldScannerOpen(true)} />
    </div>
  );
}

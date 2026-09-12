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

  // If the user is authenticated as supervisor or admin, always render the operational scanner
  if (role === 'supervisor' || role === 'admin') {
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

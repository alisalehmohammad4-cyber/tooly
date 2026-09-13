'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { Download, Smartphone, X, Share2, Sparkles } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

// Check standalone mode via matchMedia & navigator
function subscribeStandalone(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  const mql = window.matchMedia('(display-mode: standalone)');
  mql.addEventListener('change', callback);
  return () => mql.removeEventListener('change', callback);
}

function getStandaloneSnapshot(): boolean {
  if (typeof window === 'undefined') return false;
  const isDisplayStandalone = window.matchMedia('(display-mode: standalone)').matches;
  const isNavigatorStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return isDisplayStandalone || isNavigatorStandalone;
}

function getStandaloneServerSnapshot(): boolean {
  return false;
}

// Check iOS Safari
function getIosSnapshot(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent.toLowerCase();
  const isIosDevice = /iphone|ipad|ipod/.test(ua);
  const isSafari = /safari/.test(ua) && !/chrome|crios|fxios/.test(ua);
  return isIosDevice && isSafari && !getStandaloneSnapshot();
}

export function PwaInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);
  const [showIosGuide, setShowIosGuide] = useState(false);

  const isStandalone = useSyncExternalStore(
    subscribeStandalone,
    getStandaloneSnapshot,
    getStandaloneServerSnapshot
  );

  const isIos = useSyncExternalStore(
    () => () => {},
    getIosSnapshot,
    () => false
  );

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      if (isIos) {
        setShowIosGuide((prev) => !prev);
      }
      return;
    }

    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } catch (err) {
      console.error('[PWA] Error launching install prompt:', err);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
  };

  // Do not show if app is already running in standalone mode or dismissed
  if (isStandalone || isDismissed) {
    return null;
  }

  // Show if native install prompt is available OR if iOS device
  const canPrompt = Boolean(deferredPrompt) || isIos;
  if (!canPrompt) {
    return null;
  }

  return (
    <aside
      aria-label="Install Tooly Application"
      className="fixed bottom-3 inset-x-3 sm:bottom-4 sm:right-4 sm:left-auto sm:max-w-md z-50 transition-all duration-300 animate-in fade-in slide-in-from-bottom-5"
    >
      <div className="bg-white/95 backdrop-blur-md border border-blue-200 text-blue-950 rounded-2xl shadow-xl shadow-blue-950/10 p-4 flex flex-col gap-3 relative overflow-hidden">
        {/* Ambient Top Indicator */}
        <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-600 via-blue-400 to-blue-500" />

        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shrink-0 shadow-inner">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="font-bold text-sm tracking-wide text-blue-950">
                  Tooly Field App
                </h2>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200 uppercase">
                  PWA
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5 font-medium leading-relaxed">
                התקן את אפליקציית Tooly לגישה מהירה בשטח
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            aria-label="סגור הודעה"
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action button & iOS instructions */}
        <div className="flex flex-col gap-2 pt-1">
          {deferredPrompt && (
            <button
              type="button"
              onClick={handleInstallClick}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs tracking-wide shadow-md shadow-blue-600/20 active:scale-[0.98] transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>התקן עכשיו במסך הבית</span>
            </button>
          )}

          {isIos && !deferredPrompt && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowIosGuide((v) => !v)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-xs tracking-wide transition-all cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                <span>הוראות התקנה ל-iPhone (iOS)</span>
              </button>

              {showIosGuide && (
                <div className="p-3 bg-slate-50 rounded-xl border border-blue-100 text-[11px] text-blue-950 leading-relaxed space-y-1.5 animate-in fade-in">
                  <p className="flex items-center gap-1.5 font-semibold text-blue-600">
                    <Sparkles className="w-3.5 h-3.5" />
                    שלבי התקנה מהירים:
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-slate-700 pr-1">
                    <li>לחץ על כפתור השיתוף <strong className="text-blue-600">(Share ⎋)</strong> בתחתית Safari.</li>
                    <li>גלול ובחר <strong className="text-blue-600">&quot;הוסף למסך הבית&quot; (Add to Home Screen)</strong>.</li>
                    <li>לחץ על <strong className="text-blue-600">&quot;הוסף&quot; (Add)</strong> בפינה העליונה.</li>
                  </ol>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

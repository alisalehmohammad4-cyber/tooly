'use client';

import { useEffect } from 'react';

// Deploy version hash updated to bust aggressive mobile Safari local caches
const APP_DEPLOY_VERSION = process.env.NEXT_PUBLIC_BUILD_VERSION || `20261007-v${Date.now()}`;

export default function ClientCacheBuster() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const cached = localStorage.getItem('tooly_app_deploy_version');
      const currentUrl = new URL(window.location.href);
      const urlVersion = currentUrl.searchParams.get('v');

      // If version in localStorage is outdated OR URL query doesn't match the fresh build:
      if (cached !== APP_DEPLOY_VERSION || urlVersion !== APP_DEPLOY_VERSION) {
        localStorage.setItem('tooly_app_deploy_version', APP_DEPLOY_VERSION);

        // Clear WebKit / CacheStorage caches if available
        if ('caches' in window) {
          try {
            caches.keys().then((keys) => {
              keys.forEach((k) => void caches.delete(k));
            });
          } catch {
            // ignore cache errors
          }
        }

        // Set cache-busting version query parameter 'v' and replace location
        currentUrl.searchParams.set('v', APP_DEPLOY_VERSION);
        window.location.replace(currentUrl.toString());
      }
    } catch {
      // ignore storage access errors in private mode
    }
  }, []);

  return null;
}


import type { GpsCoordinates } from '@/types/domain';

/**
 * Silently attempts to retrieve device GPS coordinates with a 3.5s timeout.
 * Gracefully resolves to null if geolocation is unsupported, denied, or timed out.
 */
export async function getCurrentGpsCoordinates(): Promise<GpsCoordinates | null> {
  if (typeof window === 'undefined' || !navigator.geolocation) {
    return null;
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: parseFloat(position.coords.latitude.toFixed(6)),
          lng: parseFloat(position.coords.longitude.toFixed(6)),
        });
      },
      () => {
        // Graceful fallback on permission denial, timeout, or location unavailable
        resolve(null);
      },
      {
        timeout: 3500,
        enableHighAccuracy: false,
        maximumAge: 60000,
      }
    );
  });
}

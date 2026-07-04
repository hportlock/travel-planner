import { useEffect, useState } from 'react';

/**
 * Tracks navigator.onLine. Presentational signal only — gate nothing on it
 * (browsers report false positives); the service-worker cache and
 * NetworkError handling remain the source of truth for reachability.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}

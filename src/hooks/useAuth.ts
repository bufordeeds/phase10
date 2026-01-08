import { useEffect } from 'react';
import { useAuthStore } from '../stores/authStore';

export function useAuth() {
  const store = useAuthStore();

  useEffect(() => {
    if (!store.initialized) {
      store.initialize();
    }
  }, [store.initialized]);

  return store;
}

// Convenience hook for checking auth status
export function useIsAuthenticated() {
  const { user, initialized } = useAuthStore();
  return { isAuthenticated: !!user, initialized };
}

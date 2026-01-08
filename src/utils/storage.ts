import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Check if we're in a browser environment (not SSR)
const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

// SecureStore adapter for Supabase auth persistence
// Uses SecureStore on native, localStorage on web (client-side only)
export const secureStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      if (!isBrowser) return null;
      return window.localStorage.getItem(key);
    }
    return SecureStore.getItemAsync(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      if (!isBrowser) return;
      window.localStorage.setItem(key, value);
      return;
    }
    await SecureStore.setItemAsync(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      if (!isBrowser) return;
      window.localStorage.removeItem(key);
      return;
    }
    await SecureStore.deleteItemAsync(key);
  },
};

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StorageAdapter } from './storageAdapter';

/**
 * The only file that knows AsyncStorage exists. AsyncStorage is unencrypted
 * local storage: it holds the household's local state and must never hold
 * credentials, auth tokens, API keys or any other secret.
 */
export const asyncStorageAdapter: StorageAdapter = {
  read: (key) => AsyncStorage.getItem(key),
  write: (key, value) => AsyncStorage.setItem(key, value),
  remove: (key) => AsyncStorage.removeItem(key),
};

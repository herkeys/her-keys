import AsyncStorage from '@react-native-async-storage/async-storage';
import { APPEARANCE_STORAGE_KEY, type AppearanceStorage } from '../design/theme/appearance';

/**
 * The device-local home of the appearance preference (Light / Dark / System).
 *
 * Its own AsyncStorage key — deliberately NOT inside the household AppState envelope, the sync payload, the Supabase profile or any
 * per-account store — so it survives sign-out and sign-in, changes of account and a household reset, and can never reach a backend.
 * Holds one short non-sensitive string (`{"v":1,"preference":"dark"}`), never a credential.
 */
export const appearanceStorage: AppearanceStorage = {
  read: () => AsyncStorage.getItem(APPEARANCE_STORAGE_KEY),
  write: (value) => AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, value),
};

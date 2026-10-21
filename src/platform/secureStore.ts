import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type { SecureStorageAdapter } from '../domain/account/secureSession';

/**
 * The device's secure storage, behind the narrow capability the session
 * boundary needs.
 *
 * `expo-secure-store` is the iOS keychain and the Android keystore. It has no
 * web implementation, and that is not something to paper over with
 * localStorage: a refresh token in web storage is a refresh token any script on
 * the page can read. On web this adapter reports that it cannot store a
 * credential, and the session boundary turns that into a degraded session
 * rather than a silent downgrade.
 */
export const secureStorageAvailable = Platform.OS !== 'web';

// All adapter instances share the same native keys. Preserve invocation order
// so an old actor's pending delete cannot finish after a new actor's write.
let secureTurn:Promise<unknown>=Promise.resolve();
function inSecureTurn<T>(work:()=>Promise<T>):Promise<T> {
  const result=secureTurn.then(work,work);
  secureTurn=result.catch(()=>undefined);
  return result;
}

export function createDeviceSecureStorage(): SecureStorageAdapter {
  if (!secureStorageAvailable) {
    const refuse = () => {
      throw new Error('This platform has no secure storage, so no session credential is kept on it.');
    };
    return {
      async getItem() {
        refuse();
        return null;
      },
      async setItem() {
        refuse();
      },
      async deleteItem() {
        // Nothing was ever stored, so there is nothing to fail at removing.
      },
    };
  }

  return {
    getItem: (key) => inSecureTurn(()=>SecureStore.getItemAsync(key)),
    setItem: (key, value) => inSecureTurn(()=>SecureStore.setItemAsync(key, value)),
    deleteItem: (key) => inSecureTurn(()=>SecureStore.deleteItemAsync(key)),
  };
}

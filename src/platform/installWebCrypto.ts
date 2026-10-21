import * as Crypto from 'expo-crypto';
import { installWebCryptoShim } from './webCryptoShim';

// Side-effect module, imported first by the root layout so the shim exists before any Supabase client is created (AE2E-D02).
installWebCryptoShim(globalThis as Parameters<typeof installWebCryptoShim>[0], Crypto);

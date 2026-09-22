/**
 * The shared react-native stub, plus the one export the store provider needs (`AppState`).
 * Feature-local so the shared test floor stays untouched; a Systems test file registers it itself.
 */
export * from '../../support/rn-stub';
export { default } from '../../support/rn-stub';

export const AppState = { addEventListener: () => ({ remove: () => {} }) };

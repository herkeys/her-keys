/** A `react-native` whose Platform.OS is read live from `globalThis.__hkPlatformOS`, and every read is counted. */
export const Platform = {
  get OS() {
    globalThis.__hkPlatformReads = (globalThis.__hkPlatformReads ?? 0) + 1;
    return globalThis.__hkPlatformOS ?? 'ios';
  },
  select(map) {
    return map[this.OS] ?? map.default;
  },
};
export default { Platform };

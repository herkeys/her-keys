import { randomUUID as uuid } from 'node:crypto';
export { useAppStore } from './talkItOutBoundary.mjs';
export const randomUUID = () => uuid();
export const reportFixture = { submit: async () => 'unavailable' };
export const aiReportClient = { submit: (...args) => reportFixture.submit(...args) };

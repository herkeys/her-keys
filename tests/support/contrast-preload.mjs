/**
 * HK-FE-UI-02 rendered-contrast audit preload (opt-in: HK_UI_CONTRAST_AUDIT=<output dir>).
 *
 * Wraps react-test-renderer's `create` so every renderer a test makes is remembered. Each renderer is audited in its FINAL state:
 * either just before the test unmounts it (so flows that clean up after themselves — the Premium panels — are still measured, with
 * their sheets and receipts open) or, if the test never unmounts it, when the process exits. Findings are written to
 * <dir>/<pid>.json. Without the env var this module does nothing. Run via `node scripts-dev/ui02-contrast-audit.mjs`.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = process.env.HK_UI_CONTRAST_AUDIT;
if (out) {
  const require = createRequire(import.meta.url);
  const TestRenderer = require('react-test-renderer');
  const { auditContrast } = await import('./contrastAudit.ts');
  const merged = new Map();
  const audited = new WeakSet();
  let measured = 0;
  let renders = 0;
  const audit = (renderer) => {
    if (audited.has(renderer)) return;
    let result;
    try {
      result = auditContrast(renderer.root);
    } catch {
      return; // unmounted or empty
    }
    audited.add(renderer);
    renders += 1;
    measured += result.measured;
    for (const f of result.findings) merged.set(`${f.kind}|${f.fg}|${f.bg}|${f.sample}`, f);
  };
  const created = [];
  const original = TestRenderer.create;
  TestRenderer.create = function create(...args) {
    const renderer = original.apply(this, args);
    created.push(renderer);
    const unmount = renderer.unmount.bind(renderer);
    renderer.unmount = (...rest) => {
      audit(renderer);
      return unmount(...rest);
    };
    return renderer;
  };
  process.on('exit', () => {
    for (const renderer of created) audit(renderer);
    if (renders === 0) return;
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, `${process.pid}.json`), JSON.stringify({ file: process.argv[1] ?? '', renders, measured, findings: [...merged.values()] }));
  });
}

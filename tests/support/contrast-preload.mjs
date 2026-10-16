/**
 * HK-FE-UI-02 rendered-contrast audit preload (opt-in: HK_UI_CONTRAST_AUDIT=<output dir>).
 *
 * Wraps react-test-renderer's `create` so every renderer a test makes is remembered; when the test process exits, each one that is
 * still mounted is audited in its FINAL state (after the test's own interactions) and the findings are written to
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
  const created = [];
  const original = TestRenderer.create;
  TestRenderer.create = function create(...args) {
    const renderer = original.apply(this, args);
    created.push(renderer);
    return renderer;
  };
  process.on('exit', () => {
    const merged = new Map();
    let measured = 0;
    let renders = 0;
    for (const renderer of created) {
      let result;
      try {
        result = auditContrast(renderer.root);
      } catch {
        continue; // unmounted or empty
      }
      renders += 1;
      measured += result.measured;
      for (const f of result.findings) merged.set(`${f.kind}|${f.fg}|${f.bg}|${f.sample}`, f);
    }
    if (renders === 0) return;
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, `${process.pid}.json`), JSON.stringify({ file: process.argv[1] ?? '', renders, measured, findings: [...merged.values()] }));
  });
}

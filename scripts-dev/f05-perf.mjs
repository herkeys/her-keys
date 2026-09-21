// HK-FEATURE-05 - algorithmic performance of the Kids projection.
//   node --import ./tests/support/register-ts.mjs --import ./tests/support/register-jsx.mjs scripts-dev/f05-perf.mjs
//
// HONEST SCOPE: this measures the PURE projection under Node on the machine it runs on. It is useful algorithmic evidence. It is NOT
// device-rendering performance: no Hermes, no React Native, no layout, no Metro production bundle. Soft targets (owner): hub < 100 ms
// median, child detail < 50 ms median, in the documented environment. No architecture was bent, and nothing cached, to reach them.
import os from 'node:os';
import { buildChildDetail, buildKidsView } from '../src/features/kids/projection.ts';
import { denseHousehold } from '../tests/kids/dense.mjs';

const NOW = Date.UTC(2026, 8, 21, 15, 0, 0);
const WARMUPS = 10;
const SAMPLES = 60;

const stats = (samples) => {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return { median: at(0.5), p95: at(0.95), min: sorted[0], max: sorted[sorted.length - 1] };
};
const time = (fn) => {
  const t0 = performance.now();
  fn();
  return performance.now() - t0;
};

function measure(label, state) {
  const clock = { nowMs: NOW };
  const householdId = state.household.id;
  const cards = buildKidsView(state, householdId, clock).children;
  // the busiest child: the most open + upcoming items
  const busiest = cards
    .map((card) => ({ id: card.childId, size: (() => { const d = buildChildDetail(state, householdId, card.childId, clock); return d.upcoming.length + Object.values(d.openWork).flat().length; })() }))
    .sort((a, b) => b.size - a.size)[0];

  const childLinked = [...state.tasks, ...state.events].filter((r) => state.children.some((k) => k.id === r.subjectMemberId)).length;
  const cold = { hub: time(() => buildKidsView(state, householdId, clock)) };
  const freshState = { ...state }; // a new object, same rows: nothing about the projection is cached between calls
  cold.detail = time(() => buildChildDetail(freshState, householdId, busiest.id, clock));

  for (let i = 0; i < WARMUPS; i += 1) {
    buildKidsView(state, householdId, clock);
    buildChildDetail(state, householdId, busiest.id, clock);
  }
  const hub = stats(Array.from({ length: SAMPLES }, () => time(() => buildKidsView(state, householdId, clock))));
  const detail = stats(Array.from({ length: SAMPLES }, () => time(() => buildChildDetail(state, householdId, busiest.id, clock))));
  const f = (n) => n.toFixed(2).padStart(7);
  console.log(`\n${label}
  fixture     children=${state.children.length} tasks=${state.tasks.length} events=${state.events.length} child-linked=${childLinked} responsibilities=${state.responsibilities.length} dependencies=${state.dependencies.length} people=${state.people.length}
  busiest child: ${busiest.size} open/upcoming items
  cold (1st call)      hub ${f(cold.hub)} ms   detail ${f(cold.detail)} ms
  warm (${SAMPLES} samples)     hub median ${f(hub.median)} ms  p95 ${f(hub.p95)} ms  (min ${f(hub.min)}, max ${f(hub.max)})
                       detail median ${f(detail.median)} ms  p95 ${f(detail.p95)} ms  (min ${f(detail.min)}, max ${f(detail.max)})`);
  return { hubMedian: hub.median, detailMedian: detail.median };
}

const cpus = os.cpus();
console.log('HK-FEATURE-05 performance - environment');
console.log(`  runtime     Node ${process.version} (V8 ${process.versions.v8}), types stripped by Node, NOT Hermes / React Native; test mode, not a production bundle`);
console.log(`  machine     ${os.platform()} ${os.arch()} ${cpus[0]?.model ?? 'unknown cpu'} x${cpus.length}, ${(os.totalmem() / 2 ** 30).toFixed(1)} GB RAM (${(os.freemem() / 2 ** 30).toFixed(2)} GB free at start; the host is shared and memory-starved)`);
console.log(`  method      ${WARMUPS} warm-up calls, then ${SAMPLES} timed samples per figure; median and p95; performance.now(); one process`);

const a = measure('DENSE  (6 children, 150+ child-linked records)', denseHousehold());
const b = measure('LARGE  (the dense household plus 450 more open child-linked tasks)', denseHousehold({ extraTasks: 450 }));

const ok = a.hubMedian < 100 && a.detailMedian < 50;
console.log(`\nsoft targets (dense fixture): hub median < 100 ms: ${a.hubMedian < 100 ? 'MET' : 'NOT MET'} (${a.hubMedian.toFixed(2)}) - detail median < 50 ms: ${a.detailMedian < 50 ? 'MET' : 'NOT MET'} (${a.detailMedian.toFixed(2)})`);
console.log(`large fixture (informational): hub median ${b.hubMedian.toFixed(2)} ms, detail median ${b.detailMedian.toFixed(2)} ms`);
process.exit(ok ? 0 : 1);

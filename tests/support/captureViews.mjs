import { buildCaptureVM, buildLifeInbox } from '../../src/features/talk-it-out/capture/viewModel.ts';

/** The screen, as the world would render it right now. */
export function review(world, captureId, extra = {}) {
  return buildCaptureVM({
    state: world.state(),
    captureId,
    nowMs: world.clock.now,
    text: world.coordinator.textOf(captureId),
    session: world.coordinator.sessionOf(captureId),
    ...extra,
  });
}

export function inbox(world) {
  const snap = world.store.getSnapshot();
  return buildLifeInbox({
    status: snap.status,
    recovery: snap.recovery,
    state: snap.state,
    nowMs: world.clock.now,
    textAvailable: (id) => world.coordinator.textOf(id) !== null,
    sessionOf: (id) => world.coordinator.sessionOf(id),
  });
}

/**
 * A deterministic text tree of a view model — the structural evidence for a screen when a screenshot is not
 * available: phase, source, proposals, confidence, unresolved reason, available actions.
 */
export function tree(vm) {
  const lines = [];
  if ('captureId' in vm && 'proposals' in vm) {
    lines.push(`CAPTURE phase=${vm.phase} told=${vm.receivedLabel} decided=${vm.progress.decided}/${vm.progress.total}${vm.hollow ? ' HOLLOW' : ''}`);
    lines.push(vm.source.kind === 'echo' ? `  SOURCE “${vm.source.text}”${vm.source.long ? ' [collapsible]' : ''}` : `  SOURCE unavailable — ${vm.source.message}`);
    for (const p of vm.proposals) {
      lines.push(`  PROPOSAL [${p.phase}] ${p.kindLabel}: ${p.title}${p.confidence ? `  · ${p.confidence.toUpperCase()}` : ''}  · from ${p.provenance}`);
      for (const f of p.fields) lines.push(`    ${f.label}: ${f.value}`);
      if (p.question) {
        lines.push(`    QUESTION ${p.question.prompt}${p.question.remainingLabel ? ` (${p.question.remainingLabel})` : ''}`);
        for (const o of p.question.options) lines.push(`      ( ) ${o.label}`);
      }
      if (p.area) lines.push(`    AREA ${p.area.needed ? 'NEEDED' : `selected=${p.area.selectedId}`}`);
      for (const n of p.notes) lines.push(`    note: ${n}`);
      for (const e of p.evidence) lines.push(`    why: ${e}`);
      if (p.outcomeLine) lines.push(`    ${p.outcomeLine}`);
      const actions = Object.entries(p.actions).filter(([, on]) => on).map(([name]) => name.replace(/^can/, '').toLowerCase());
      lines.push(`    actions: ${actions.join(', ') || '(none)'}`);
    }
    for (const n of vm.sessionNotes) lines.push(`  NOTE ${n}`);
    lines.push(`  capture actions: ${Object.entries(vm.actions).filter(([, on]) => on).map(([name]) => name.replace(/^can/, '').toLowerCase()).join(', ') || '(none)'}`);
  } else {
    lines.push(`INBOX phase=${vm.phase}${'count' in vm ? ` count=${vm.count}` : ''}`);
    if ('message' in vm) lines.push(`  ${vm.message}`);
    for (const item of vm.items ?? []) {
      lines.push(`  ITEM [${item.urgency}${item.passed ? ', passed' : ''}] ${item.headline} — ${item.phaseLabel}${item.progressLabel ? ` (${item.progressLabel})` : ''}${item.whenLabel ? ` · ${item.whenLabel}` : ''}${item.hollow ? ' · HOLLOW' : ''}`);
    }
  }
  return lines;
}

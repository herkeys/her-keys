/**
 * Render tests for the Feature 02 UI, on the real providers, the real store and the real coordinator.
 *
 * Honest scope (see tests/support/rn-stub.tsx): these prove structure, copy, accessibility roles and
 * labels, and behaviour through the real components. Layout, native keyboard behaviour and pixels are
 * verified in the running app (ledger §19), not here.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import React, { useEffect } from 'react';
import { after, describe, test } from 'node:test';
import TestRenderer from 'react-test-renderer';
import { transformSync } from 'esbuild';
import { CaptureGroup } from '../src/features/talk-it-out/capture/CaptureCards.tsx';
import { CaptureProvider, useCapture } from '../src/features/talk-it-out/capture/CaptureContext.tsx';
import { LifeInboxView } from '../src/features/talk-it-out/capture/LifeInboxView.tsx';
import { copy } from '../src/features/talk-it-out/capture/copy.ts';
import { AppStateProvider } from '../src/store/AppStateProvider.tsx';
import { startWorld } from './support/captureWorld.mjs';
import { render } from './support/render.tsx';
import { windowMetrics } from './support/rn-stub.tsx';
import { fixSheetFieldsMaxHeight } from '../src/features/talk-it-out/capture/fixForm.ts';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const settle = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));

// The store provider keeps a 60-second interval running while mounted. Anything left mounted keeps the test
// process alive forever, so every renderer is unmounted when the file is done.
const mounted = [];
after(() => {
  for (const r of mounted) {
    try {
      r.unmount();
    } catch {
      // already unmounted
    }
  }
});

/** Mounts the real providers around `children` and hands back the coordinator the app would be using. */
async function mount(world, children = () => null) {
  let cap;
  const now = () => world.clock.now; // one clock, shared with the store, so "today" means one thing
  const Ready = () => {
    const c = useCapture();
    useEffect(() => {
      cap = c;
    }, [c]);
    return null;
  };
  const tree = (kids) => (
    <AppStateProvider store={world.store}>
      <CaptureProvider now={now}>
        <Ready />
        {kids}
      </CaptureProvider>
    </AppStateProvider>
  );
  const renderer = await render(tree(children(null)));
  mounted.push(renderer);
  // The store re-renders subscribers when it changes, so anything that changes it runs inside act().
  const coordinator = Object.fromEntries(
    Object.entries(cap.coordinator).map(([name, fn]) => [
      name,
      async (...args) => {
        let result;
        await TestRenderer.act(async () => {
          result = await fn(...args);
        });
        return result;
      },
    ])
  );
  coordinator.textOf = cap.coordinator.textOf;
  coordinator.sessionOf = cap.coordinator.sessionOf;
  coordinator.preview = cap.coordinator.preview;
  return {
    renderer,
    coordinator,
    show: async (kids) => TestRenderer.act(async () => renderer.update(tree(kids))),
  };
}

const texts = (renderer) =>
  renderer.root
    .findAllByType('Text')
    .map((n) => [n.props.children].flat(Infinity).filter((c) => typeof c === 'string' || typeof c === 'number').join(''))
    .filter(Boolean);
// Eyebrow labels are rendered in capitals by the design system, so text is compared without regard to case.
const has = (renderer, needle) => texts(renderer).some((t) => t.toLowerCase().includes(needle.toLowerCase()));
const pressables = (renderer) => renderer.root.findAllByType('Pressable');
const named = (renderer, label) => pressables(renderer).filter((p) => p.props.accessibilityLabel === label);

async function press(renderer, label) {
  const target = named(renderer, label).find((p) => !p.props.disabled);
  assert.ok(target, `no enabled control named “${label}”; controls: ${pressables(renderer).map((p) => p.props.accessibilityLabel).join(' | ')}`);
  await TestRenderer.act(async () => {
    target.props.onPress();
    await settle();
  });
}

async function type(renderer, label, value) {
  const field = renderer.root.findAllByType('TextInput').find((n) => n.props.accessibilityLabel === label);
  assert.ok(field, `no field “${label}”`);
  await TestRenderer.act(async () => field.props.onChangeText(value));
}

// ---------------------------------------------------------------- the review ---

describe('the review of a capture, as she sees and operates it', () => {
  test('shows her words, what was understood, the uncertainty, and the three honest actions', async () => {
    const world = await startWorld();
    const ui = await mount(world);
    const out = await ui.coordinator.submit({ text: 'Dentist Friday at 3pm', submissionKey: 'a' });
    await ui.show(<CaptureGroup captureId={out.captureId} />);

    for (const expected of [copy.review.sourceLabel, 'Dentist Friday at 3pm', copy.review.eyebrow, 'Fri, Sep 18 · 3:00 PM–3:30 PM', 'POSSIBLE', 'Her Keys inferred this', copy.review.assumption('end-time-assumed')]) {
      assert.ok(has(ui.renderer, expected), `missing “${expected}”; screen: ${texts(ui.renderer).join(' / ')}`);
    }
    for (const label of [copy.review.accept, copy.review.reject, copy.review.fix, copy.inbox.dismiss]) assert.ok(named(ui.renderer, label).length > 0, label);
    assert.equal(world.state().events.length, 0, 'showing a review saves nothing');
  });

  test('opening, waiting and leaving change nothing; only an explicit accept materialises, and the screen then says so', async () => {
    const world = await startWorld();
    const ui = await mount(world);
    const out = await ui.coordinator.submit({ text: 'Dentist Friday at 3pm', submissionKey: 'a' });
    await ui.show(<CaptureGroup captureId={out.captureId} />);
    await settle(80);
    await ui.show(null);
    await ui.show(<CaptureGroup captureId={out.captureId} />);
    assert.equal(world.state().events.length, 0);

    await press(ui.renderer, copy.review.accept);
    assert.equal(world.state().events.length, 1);
    assert.ok(has(ui.renderer, 'Saved as an appointment.'));
    assert.equal(named(ui.renderer, copy.review.accept).length, 0, 'nothing left to accept twice');
  });

  test('a second tap on Save while it is being saved cannot make a second event', async () => {
    const world = await startWorld();
    const ui = await mount(world);
    const out = await ui.coordinator.submit({ text: 'Dentist Friday at 3pm', submissionKey: 'a' });
    await ui.show(<CaptureGroup captureId={out.captureId} />);
    const button = named(ui.renderer, copy.review.accept)[0];
    await TestRenderer.act(async () => {
      button.props.onPress();
      button.props.onPress();
      button.props.onPress();
      await settle(80);
    });
    assert.equal(world.state().events.length, 1);
  });

  test('rejecting saves nothing, says so, and the reading is not offered again', async () => {
    const world = await startWorld();
    const ui = await mount(world);
    const out = await ui.coordinator.submit({ text: 'Dentist Friday at 3pm', submissionKey: 'a' });
    await ui.show(<CaptureGroup captureId={out.captureId} />);
    await press(ui.renderer, copy.review.reject);
    assert.equal(world.state().events.length, 0);
    assert.ok(has(ui.renderer, copy.review.rejected));
    assert.equal(named(ui.renderer, copy.review.accept).length, 0);
  });

  test('a to-do with no area cannot be saved until she chooses one, and choosing one enables it', async () => {
    const world = await startWorld();
    const ui = await mount(world);
    const out = await ui.coordinator.submit({ text: 'I need to send $20', submissionKey: 'a' });
    await ui.show(<CaptureGroup captureId={out.captureId} />);
    assert.ok(has(ui.renderer, copy.review.areaNeeded));
    assert.ok(pressables(ui.renderer).find((p) => p.props.accessibilityLabel === copy.review.accept).props.disabled, 'Save is disabled without an area');
    await press(ui.renderer, 'Money');
    await press(ui.renderer, copy.review.accept);
    assert.equal(world.state().tasks.length, 1);
    assert.equal(world.state().categories.find((c) => c.id === world.state().tasks[0].categoryId).systemRole, 'money');
  });

  test('a long source is collapsed by the screen and can be expanded, and is never shortened', async () => {
    const world = await startWorld();
    const ui = await mount(world);
    const words = `Dentist Friday at 3pm. ${'and more words '.repeat(40)}`.trim(); // the coordinator holds exactly what was sent, trimmed
    const out = await ui.coordinator.submit({ text: words, submissionKey: 'a' });
    await ui.show(<CaptureGroup captureId={out.captureId} />);
    const quote = () => ui.renderer.root.findAllByType('Text').find((n) => n.props.children === words);
    assert.equal(quote().props.numberOfLines, 3, 'collapsed by the screen');
    await press(ui.renderer, copy.review.sourceExpand);
    assert.equal(quote().props.numberOfLines, undefined, 'expanded');
    assert.equal(quote().props.children, words, 'the words are exactly what she sent');
  });
});

describe('a question, answered by choosing or by saying it', () => {
  test('two children: the question lists them, nothing can be saved, and choosing one lets the review proceed', async () => {
    const world = await startWorld();
    const ui = await mount(world);
    const out = await ui.coordinator.submit({ text: 'Pick him up from practice at 5pm', submissionKey: 'a' });
    await ui.show(<CaptureGroup captureId={out.captureId} />);
    assert.ok(has(ui.renderer, copy.clarify.eyebrow));
    assert.ok(has(ui.renderer, 'Which child do you mean?'));
    for (const label of ['Alexa', 'Ayden', copy.clarify.optionNoChild]) assert.ok(named(ui.renderer, label).length > 0, label);
    assert.equal(named(ui.renderer, copy.review.accept).length, 0, 'no Save while the question is open');
    assert.equal(has(ui.renderer, '5:00 PM'), false, 'a provisional time is not presented as a fact');

    await press(ui.renderer, 'Ayden');
    assert.ok(has(ui.renderer, copy.review.eyebrow));
    assert.ok(has(ui.renderer, 'Ayden'));
    await press(ui.renderer, copy.review.accept);
    assert.equal(world.state().events[0].subjectMemberId, 'kid-ayden');
  });

  test('a free-text answer she cannot be understood by leaves the question open, says so, and stops asking after three', async () => {
    const world = await startWorld();
    const ui = await mount(world);
    const out = await ui.coordinator.submit({ text: 'Pick him up from practice at 5pm', submissionKey: 'a' });
    await ui.show(<CaptureGroup captureId={out.captureId} />);
    for (let i = 0; i < 3; i += 1) {
      await type(ui.renderer, copy.clarify.answerPlaceholder, 'whichever');
      await press(ui.renderer, copy.clarify.send);
    }
    assert.ok(has(ui.renderer, copy.clarify.exhausted));
    assert.equal(world.state().interpretations[0].state, 'clarifying', 'still unresolved, and kept');
    assert.equal(world.state().events.length, 0);
    assert.ok(named(ui.renderer, copy.review.fix).length > 0, 'a way out that is hers: fix it herself');
  });
});

describe('Fix it: one operation, reachable by structured edit or by saying it', () => {
  test('telling it what to change ("No, I meant next Friday at 4pm") revises the reading; the earlier one stays as history', async () => {
    const world = await startWorld();
    const ui = await mount(world);
    const out = await ui.coordinator.submit({ text: 'Dentist this Friday at 3pm', submissionKey: 'a' });
    await ui.show(<CaptureGroup captureId={out.captureId} />);
    await press(ui.renderer, copy.review.fix);
    assert.ok(has(ui.renderer, copy.fix.title));
    await type(ui.renderer, copy.fix.sayIt, 'No, I meant next Friday at 4pm');
    await press(ui.renderer, copy.fix.apply);

    const [v1, v2] = world.state().interpretations;
    assert.equal(v1.state, 'superseded');
    assert.equal(v2.supersedesId, v1.id);
    assert.match(v2.startsAt, /^2026-09-25T20:00/);
    assert.ok(has(ui.renderer, 'Fri, Sep 25 · 4:00 PM–4:30 PM'));
    assert.equal(world.state().events.length, 0, 'fixing is still not saving');
  });

  test('a structured edit (choosing a day chip) goes through the same operation', async () => {
    const world = await startWorld();
    const ui = await mount(world);
    const out = await ui.coordinator.submit({ text: 'Dentist Friday at 3pm', submissionKey: 'a' });
    await ui.show(<CaptureGroup captureId={out.captureId} />);
    await press(ui.renderer, copy.review.fix);
    await press(ui.renderer, 'Tomorrow');
    await press(ui.renderer, copy.fix.apply);
    const [v1, v2] = world.state().interpretations;
    assert.equal(v1.state, 'superseded');
    assert.match(v2.startsAt, /^2026-09-17T19:00/);
  });

  test('a correction it cannot follow says so and changes nothing', async () => {
    const world = await startWorld();
    const ui = await mount(world);
    const out = await ui.coordinator.submit({ text: 'Dentist Friday at 3pm', submissionKey: 'a' });
    await ui.show(<CaptureGroup captureId={out.captureId} />);
    await press(ui.renderer, copy.review.fix);
    await type(ui.renderer, copy.fix.sayIt, 'hmm not quite right');
    await press(ui.renderer, copy.fix.apply);
    assert.ok(has(ui.renderer, copy.fix.notUnderstood));
    assert.equal(world.state().interpretations.length, 1);
  });
});

describe('SC-06: the Fix sheet scrolls, avoids the keyboard and keeps Apply reachable', () => {
  const fieldLabels = () => [copy.fix.sayIt, copy.fix.labelTitle, copy.fix.labelTime, copy.fix.labelAmount];
  const insideScroll = (renderer, label) => renderer.root.findAllByType('ScrollView').some((sv) => sv.findAll((n) => n.props.accessibilityLabel === label).length > 0);

  async function openFix(text = 'Dentist Friday at 3pm') {
    const world = await startWorld();
    const ui = await mount(world);
    const out = await ui.coordinator.submit({ text, submissionKey: 'sc06' });
    await ui.show(<CaptureGroup captureId={out.captureId} />);
    await press(ui.renderer, copy.review.fix);
    return { world, ui };
  }

  test('every field lives in one keyboard-aware ScrollView; Apply and Cancel are outside it, so they are always reachable', async () => {
    const { ui } = await openFix();
    const scrolls = ui.renderer.root.findAllByType('ScrollView');
    assert.equal(scrolls.length, 1, 'one scroll region');
    const props = scrolls[0].props;
    assert.equal(props.keyboardShouldPersistTaps, 'handled', 'a tap on Apply while a field is focused is not swallowed');
    assert.equal(props.automaticallyAdjustKeyboardInsets, true, 'iOS keeps the focused field above the keyboard');
    assert.equal(typeof props.style.maxHeight, 'number');
    for (const label of fieldLabels()) assert.ok(insideScroll(ui.renderer, label), 'field “' + label + '” scrolls');
    for (const label of [copy.fix.apply, copy.fix.cancel]) {
      assert.equal(named(ui.renderer, label).length, 1);
      assert.equal(insideScroll(ui.renderer, label), false, '“' + label + '” is pinned outside the scroll area');
    }
  });

  for (const [name, metrics] of [
    ['a small phone (568pt)', { height: 568, fontScale: 1 }],
    ['a small phone with 2x text', { height: 568, fontScale: 2 }],
    ['a large phone with 1.3x text', { height: 926, fontScale: 1.3 }],
  ]) {
    test('on ' + name + ' the scroll area is bounded and Apply still works', async () => {
      const before = { ...windowMetrics };
      Object.assign(windowMetrics, metrics);
      try {
        const { world, ui } = await openFix();
        const bound = ui.renderer.root.findByType('ScrollView').props.style.maxHeight;
        assert.equal(bound, fixSheetFieldsMaxHeight(metrics.height, metrics.fontScale));
        assert.ok(bound >= 120 && bound <= 560);
        // The bounded fields plus the reserved chrome (handle, padding, the pinned action row at this text size) fit the window.
        assert.ok(bound + 120 + 112 * Math.max(1, metrics.fontScale) <= metrics.height);
        await press(ui.renderer, 'Tomorrow');
        await press(ui.renderer, copy.fix.apply);
        const [v1, v2] = world.state().interpretations;
        assert.equal(v1.state, 'superseded', 'Apply keeps the one-operation correction semantics');
        assert.match(v2.startsAt, /^2026-09-17T19:00/);
      } finally {
        Object.assign(windowMetrics, before);
      }
    });
  }

  test('the note kind (fewest fields) and the event kind (most) both keep the same structure', async () => {
    const { ui } = await openFix('Remember to call Mom');
    assert.equal(ui.renderer.root.findAllByType('ScrollView').length, 1);
    assert.equal(insideScroll(ui.renderer, copy.fix.apply), false);
    await press(ui.renderer, copy.fix.kindEvent);
    assert.ok(insideScroll(ui.renderer, copy.fix.labelTime), 'the time field appears inside the scroll area');
    assert.equal(insideScroll(ui.renderer, copy.fix.apply), false);
  });

  test('the height rule: bounded, monotonic in text size, never below a usable field, and safe on junk input', () => {
    assert.equal(fixSheetFieldsMaxHeight(844, 1), 560, 'tall screens cap at 560');
    assert.equal(fixSheetFieldsMaxHeight(568, 1), 336);
    assert.equal(fixSheetFieldsMaxHeight(568, 2), 224);
    assert.ok(fixSheetFieldsMaxHeight(568, 2) < fixSheetFieldsMaxHeight(568, 1), 'bigger text leaves less room for fields');
    assert.equal(fixSheetFieldsMaxHeight(320, 3), 120, 'never collapses below a usable field');
    assert.equal(fixSheetFieldsMaxHeight(568, 0.5), fixSheetFieldsMaxHeight(568, 1), 'a sub-1 font scale does not enlarge the area');
    assert.equal(fixSheetFieldsMaxHeight(Number.NaN, Number.NaN), 120);
  });
});

// ------------------------------------------------------------ the Life Inbox ---

describe('Life Inbox screen', () => {
  test('N — empty is calm: a fact, no action to add anything, no celebration', async () => {
    const world = await startWorld();
    const ui = await mount(world, () => <LifeInboxView onSayAgain={() => {}} />);
    await ui.show(<LifeInboxView onSayAgain={() => {}} />);
    assert.ok(has(ui.renderer, copy.inbox.empty));
    assert.ok(has(ui.renderer, copy.inbox.emptyBody));
    assert.equal(pressables(ui.renderer).length, 0, 'no button asks her to add or fix anything');
    assert.equal(texts(ui.renderer).some((t) => /!|zero|streak|great/i.test(t)), false);
  });

  test('T — a household recovered from unreadable stored state is NOT shown as "nothing is waiting"', async () => {
    const world = await startWorld({ kids: [], initial: { 'herkeys.appState': '{ not json' } });
    const ui = await mount(world);
    await ui.show(<LifeInboxView onSayAgain={() => {}} />);
    assert.ok(has(ui.renderer, copy.inbox.recovery));
    assert.equal(has(ui.renderer, copy.inbox.empty), false);
  });

  test('a list of unresolved captures, most pressing first, each opening the same review; resolving one removes it', async () => {
    const world = await startWorld();
    const ui = await mount(world);
    await ui.coordinator.submit({ text: 'Call the school tomorrow', submissionKey: 'a' });
    world.clock.now += 1000;
    await ui.coordinator.submit({ text: 'Call the plumber', submissionKey: 'b' });
    world.clock.now += 1000;
    await ui.coordinator.submit({ text: 'asdf qwerty', submissionKey: 'c' });
    await ui.show(<LifeInboxView onSayAgain={() => {}} />);

    const order = texts(ui.renderer).filter((t) => ['Call the school', 'Call the plumber', copy.inbox.hollowTitle].includes(t));
    assert.deepEqual(order, ['Call the school', 'Call the plumber', copy.inbox.hollowTitle], 'due tomorrow first, then reviewable, then the unread source');
    assert.ok(has(ui.renderer, copy.inbox.phaseFailed), 'the unread one says it could not be turned into anything');

    await press(ui.renderer, copy.inbox.open);
    assert.ok(has(ui.renderer, copy.review.eyebrow), 'the row opens the same review');
    await press(ui.renderer, copy.review.reject);
    assert.equal(texts(ui.renderer).includes('Call the school'), false, 'resolved work leaves the active inbox');
  });

  test('a source whose words are gone after a restart is listed honestly, and can be re-said or dismissed', async () => {
    const world = await startWorld();
    const first = await mount(world);
    await first.coordinator.submit({ text: 'asdf qwerty', submissionKey: 'a' });
    await world.store.flush();
    await world.restart();
    let said = 0;
    const ui = await mount(world);
    await ui.show(<LifeInboxView onSayAgain={() => (said += 1)} />);
    assert.ok(texts(ui.renderer).some((t) => t.startsWith('You told Her Keys something')));
    await press(ui.renderer, copy.inbox.sayAgain);
    assert.equal(said, 1);
    await press(ui.renderer, copy.inbox.dismiss);
    assert.ok(has(ui.renderer, copy.inbox.empty));
  });
});

// -------------------------------------------------------------- a11y and hygiene ---

describe('accessibility and hygiene, mechanically', () => {
  test('every control has a role and a label; every field is labelled; the sheet is announced', async () => {
    const world = await startWorld();
    const ui = await mount(world);
    const out = await ui.coordinator.submit({ text: 'Pick him up from practice at 5pm', submissionKey: 'a' });
    await ui.show(<CaptureGroup captureId={out.captureId} />);
    await press(ui.renderer, copy.review.fix);
    for (const p of pressables(ui.renderer)) {
      assert.ok(typeof p.props.accessibilityLabel === 'string' && p.props.accessibilityLabel.length > 0, 'every control is labelled');
      // FINDING (for the audit, not fixable here): the permanent Sheet's backdrop "Dismiss" Pressable carries a label but no
      // accessibilityRole. It is a design-system component; Feature 02 does not modify the design system.
      if (p.props.accessibilityLabel === 'Dismiss') continue;
      assert.equal(p.props.accessibilityRole, 'button', `“${p.props.accessibilityLabel}” has no button role`);
    }
    for (const f of ui.renderer.root.findAllByType('TextInput')) assert.ok(f.props.accessibilityLabel);
    const modal = ui.renderer.root.findByType('Modal');
    assert.equal(modal.props.accessibilityViewIsModal, true);
    assert.equal(modal.props.accessibilityLabel, copy.fix.title);
  });

  const FEATURE_UI = ['CaptureCards.tsx', 'LifeInboxView.tsx', 'CaptureContext.tsx'].map((f) => join('src/features/talk-it-out/capture', f));
  const read = (path) => readFileSync(path, 'utf8');

  test('no user-facing sentence is written inside JSX: it all comes from the reviewable copy module', () => {
    // Compile the JSX and look at what is actually passed as text: a string literal given as `children`, `label`,
    // `title`, `body`, `placeholder` or an accessibility label is user-facing copy written in place.
    const userFacing = /\b(children|label|title|body|placeholder|accessibilityLabel|accessibilityHint)\s*:\s*"([^"\\]*[A-Za-z]{3,}[^"\\]*)"/g;
    for (const file of [...FEATURE_UI, 'app/(app)/life/inbox.tsx']) {
      const { code } = transformSync(read(file), { loader: 'tsx', jsx: 'automatic', format: 'esm', target: 'esnext' });
      const scattered = [...code.matchAll(userFacing)].map((m) => `${m[1]}: “${m[2]}”`);
      assert.deepEqual(scattered, [], `${file} writes copy in place: ${scattered.join(' | ')}`);
    }
    // And the strings this feature replaced in the existing conversation view are gone from it.
    const view = read('src/features/talk-it-out/TalkItOutView.tsx');
    for (const old of ['Voice arrives', 'Prototype conversation', 'Voice input', 'Prototype only']) assert.equal(view.includes(old), false, `“${old}” is still in TalkItOutView`);
  });

  test('§71 — the UI creates no household record: it imports no domain mutation and only ever calls the coordinator', () => {
    const MUTATIONS = /\b(addTask|addEvent|captureNeedsMeItem|acceptInterpretation|rejectInterpretation|proposeInterpretation|supersedeInterpretation|recordArtifact|retractSourceArtifact|correctInterpretation|appendObservation|store\.(dispatch|commit))\b/;
    for (const file of [...FEATURE_UI, 'app/(app)/life/inbox.tsx']) {
      assert.doesNotMatch(read(file), MUTATIONS, `${file} reaches past the coordinator into a domain mutation`);
      assert.doesNotMatch(read(file), /from ['"][^'"]*\/domain\/(tasks|events|needsMe|interpretations|observations)['"]/, `${file} imports a domain mutation module`);
    }
    // The one place that writes on the UI's behalf is the coordinator, and it goes through the store's commit.
    assert.match(read('src/features/talk-it-out/capture/coordinator.ts'), /store\.commit\(/);
  });

  test('the feature uses design tokens only: no hard-coded colour and no second UI vocabulary', () => {
    for (const file of FEATURE_UI) {
      const source = read(file);
      assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}\b|rgba?\(/, `${file} hard-codes a colour`);
      assert.doesNotMatch(source, /fontFamily|fontSize|backgroundColor:/, `${file} styles outside the token system`);
    }
  });

  test('privacy: nothing in the feature logs, serialises or throws with her words', () => {
    const dir = 'src/features/talk-it-out/capture';
    const files = [];
    const walk = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) (e.isDirectory() ? walk(join(d, e.name)) : files.push(join(d, e.name)));
    };
    walk(dir);
    files.push('src/store/TalkItOutContext.tsx', 'src/features/talk-it-out/TalkItOutView.tsx');
    for (const file of files) {
      const source = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      assert.doesNotMatch(source, /\bconsole\./, `${file}: console`);
      assert.doesNotMatch(source, /JSON\.stringify|JSON\.parse/, `${file}: serialisation`);
      // An Error is fine only when its message is a plain literal — never built from, or containing, anything she wrote.
      for (const m of source.matchAll(/new\s+\w*Error\(([^)]*)\)/g)) {
        assert.match(m[1].trim(), /^(['"])[^'"$+`]*\1$/, `${file}: an Error message that is not a plain literal: ${m[0]}`);
      }
      assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|WebSocket|analytics|telemetry|Sentry/i, `${file}: network or telemetry`);
      assert.doesNotMatch(source, /AsyncStorage|SecureStore|localStorage/, `${file}: writes somewhere she did not approve`);
    }
  });

  test('independence: no import from any sibling feature, and no sibling imports this one', () => {
    const files = [];
    const walk = (d) => {
      for (const e of readdirSync(d, { withFileTypes: true })) (e.isDirectory() ? walk(join(d, e.name)) : files.push(join(d, e.name)));
    };
    walk('src/features/talk-it-out');
    for (const file of files) {
      assert.doesNotMatch(read(file), /features\/(today|calendar|systems|daily-load|home|kids|work|money|meals|one-move|life|tasks)\b/, `${file} imports another feature`);
      assert.doesNotMatch(read(file), /from ['"][^'"]*\/(today|calendar|systems)\//, `${file} imports a sibling feature`);
    }
    const shared = [];
    for (const d of ['src/features/today', 'src/features/life', 'src/features/calendar', 'src/features/systems', 'src/features/daily-load']) {
      try {
        const w = (dir) => {
          for (const e of readdirSync(dir, { withFileTypes: true })) (e.isDirectory() ? w(join(dir, e.name)) : shared.push(join(dir, e.name)));
        };
        w(d);
      } catch {
        // a sibling directory this branch does not have
      }
    }
    for (const file of shared) assert.doesNotMatch(read(file), /talk-it-out\/capture/, `${file} depends on Feature 02's capture code`);
  });
});

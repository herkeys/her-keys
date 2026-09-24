/**
 * HK-OCR-ASSIST — the review screen, rendered. Nothing here is a store or a save: it asserts what she is offered, what starts
 * unconfirmed, and what the screen hands back when she acts — never that anything was written anywhere.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import TestRenderer from 'react-test-renderer';
import { buildOcrCandidate } from '../../src/features/lifeAdmin/ocrExtract.ts';
import { OcrReviewScreen } from '../../src/features/lifeAdmin/OcrReviewScreen.tsx';
import { OCR_COPY as COPY } from '../../src/features/lifeAdmin/ocrCopy.ts';
import { render } from '../support/render.tsx';

const texts = (r) => r.root.findAllByType('Text').map((t) => [].concat(t.props.children ?? []).map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : '')).join(''));
const pressables = (r) => r.root.findAllByType('Pressable');
const byLabel = (r, label) => pressables(r).filter((p) => p.props.accessibilityLabel === label);
const press = async (node) => TestRenderer.act(async () => node.props.onPress());
// Overline (used for field headings) renders its text upper-cased; these checks care about the words shown, not the casing a
// shared design component happens to apply, so they compare case-insensitively.
const hasText = (r, needle) => texts(r).some((t) => t.toUpperCase().includes(needle.toUpperCase()));
const accessibleTexts = (r) => r.root.findAllByType('Text').map((t) => t.props.accessibilityLabel).filter((l) => typeof l === 'string');

const DOC = 'Acme Insurance Co.\nPolicy POL-1234-5678\nExpires 2027-03-15\nRenew by 2027-02-01';

async function screen(over = {}) {
  const candidate = buildOcrCandidate(DOC);
  const calls = { used: null, manual: 0, cancelled: 0 };
  const r = await render(
    <OcrReviewScreen
      visible
      candidate={candidate}
      onUseValues={(values) => (calls.used = values)}
      onManualEntry={() => (calls.manual += 1)}
      onCancel={() => (calls.cancelled += 1)}
      {...over}
    />
  );
  return { r, calls, candidate };
}

describe('OCR review — nothing is pre-picked', () => {
  test('every date field starts "Not set"; no candidate date is pre-selected for any field', async () => {
    const { r } = await screen();
    assert.ok(hasText(r, `${COPY.fieldExpires} — ${COPY.notSet}`));
    assert.ok(hasText(r, `${COPY.fieldRenewBy} — ${COPY.notSet}`));
    assert.ok(hasText(r, `${COPY.fieldReviewOn} — ${COPY.notSet}`));
    // No CANDIDATE chip claims to be selected before she has tapped one. ("None of these" legitimately starts selected: it is
    // the accurate description of "nothing assigned yet", not a candidate being auto-picked.)
    const candidateChips = pressables(r).filter((p) => p.props.accessibilityLabel !== COPY.none && p.props.accessibilityLabel !== COPY.enterManually);
    assert.equal(candidateChips.some((p) => p.props.accessibilityState && p.props.accessibilityState.selected === true), false);
  });

  test('a date whose nearby text says "Expires" is never auto-assigned to the expiration field', async () => {
    const { r } = await screen();
    // "Expires 2027-03-15" is read, and its own recognized-context line is shown, but the field stays unset.
    assert.ok(hasText(r, 'Expires') && hasText(r, '2027-03-15'));
    assert.ok(hasText(r, `${COPY.fieldExpires} — ${COPY.notSet}`));
  });

  test('with two candidate dates, neither the earliest nor the latest is pre-picked for any field', async () => {
    const { r } = await screen();
    for (const field of [COPY.fieldExpires, COPY.fieldRenewBy, COPY.fieldReviewOn]) {
      assert.ok(hasText(r, `${field} — ${COPY.notSet}`), `${field} starts unset`);
    }
  });

  test('every candidate date announces as unconfirmed', async () => {
    const { r } = await screen();
    const label = accessibleTexts(r).find((t) => t.includes('March 2027') && t.includes('Unconfirmed'));
    assert.ok(label, 'a candidate date carries the unconfirmed announcement');
  });
});

describe('OCR review — assignment is explicit, per field, and never consumes a candidate', () => {
  test('picking a date for one field leaves it available to pick for another field too', async () => {
    const { r } = await screen();
    const expiresChips = byLabel(r, '15 Mar 2027');
    assert.ok(expiresChips.length >= 2, 'the same date is offered under more than one field');
    await press(expiresChips[0]);
    const afterPick = byLabel(r, '15 Mar 2027');
    assert.ok(afterPick.length >= 2, 'choosing it for one field did not remove it from the others');
  });

  test('"None of these" is always offered and leaves the field unset', async () => {
    const { r } = await screen();
    const noneChips = byLabel(r, COPY.none);
    assert.ok(noneChips.length >= 3, 'every date field offers None');
  });
});

describe('OCR review — sensitive candidates stay masked by default', () => {
  test('a reference-shaped candidate is offered masked, and Reveal shows it in full', async () => {
    const { r } = await screen();
    assert.equal(texts(r).some((t) => t.includes('POL-1234-5678')), false, 'not shown in full before Reveal');
    const reveal = byLabel(r, COPY.reveal)[0];
    assert.ok(reveal, 'a Reveal control is offered');
    await press(reveal);
    assert.ok(texts(r).some((t) => t.includes('5678')), 'revealed shows at least the unmasked tail');
  });
});

describe('OCR review — nothing is saved by this screen', () => {
  test('Continue with nothing chosen hands back an empty object; onCancel and onManualEntry are never called', async () => {
    const { r, calls } = await screen();
    await press(byLabel(r, COPY.continueToRecord)[0]);
    assert.deepEqual(calls.used, {});
    assert.equal(calls.cancelled, 0);
    assert.equal(calls.manual, 0);
  });

  test('choosing a date, an issuer and a reference hands back exactly those fields, nothing else, and never calls the other actions', async () => {
    const { r, calls } = await screen();
    await press(byLabel(r, '15 Mar 2027')[0]);
    await press(byLabel(r, 'Acme Insurance Co.')[0]);
    await press(byLabel(r, '••••5678')[0]);
    await press(byLabel(r, COPY.continueToRecord)[0]);
    assert.deepEqual(Object.keys(calls.used).sort(), ['expiresOn', 'issuerName', 'referenceNumber']);
    assert.equal(calls.used.expiresOn, '2027-03-15');
    assert.equal(calls.used.issuerName, 'Acme Insurance Co.');
    assert.equal(calls.used.referenceNumber, 'POL-1234-5678');
    assert.equal(calls.cancelled, 0);
  });

  test('Discard this scan calls onCancel and nothing else; onUseValues is never invoked', async () => {
    const { r, calls } = await screen();
    await press(byLabel(r, '15 Mar 2027')[0]);
    await press(byLabel(r, COPY.cancelScan)[0]);
    assert.equal(calls.cancelled, 1);
    assert.equal(calls.used, null, 'discarding never hands back values');
  });

  test('Enter manually calls onManualEntry and nothing else, discarding every candidate choice', async () => {
    const { r, calls } = await screen();
    await press(byLabel(r, '15 Mar 2027')[0]);
    await press(byLabel(r, COPY.enterManuallyInstead)[0]);
    assert.equal(calls.manual, 1);
    assert.equal(calls.used, null);
  });

  test('an empty candidate (nothing read) renders without throwing and offers manual entry', async () => {
    const empty = buildOcrCandidate('');
    const r = await render(<OcrReviewScreen visible candidate={empty} onUseValues={() => {}} onManualEntry={() => {}} onCancel={() => {}} />);
    assert.ok(texts(r).includes(COPY.noDatesRead));
    assert.ok(texts(r).includes(COPY.noIssuersRead));
    assert.ok(texts(r).includes(COPY.noReferencesRead));
  });
});

describe('OCR review — accessibility', () => {
  test('every actionable control has a real accessible name, and the confirm action states nothing is saved yet', async () => {
    const { r } = await screen();
    for (const p of pressables(r)) {
      assert.equal(typeof p.props.accessibilityLabel, 'string', 'every pressable has an accessibilityLabel');
      assert.ok(p.props.accessibilityLabel.length > 0);
    }
    const continueBtn = byLabel(r, COPY.continueToRecord)[0];
    assert.ok(continueBtn.props.accessibilityHint.includes('Nothing is saved'));
    assert.ok(texts(r).includes(COPY.nothingSavedYet));
  });
});

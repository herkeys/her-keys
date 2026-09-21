import type { SystemRole } from '../../../../domain/state';
import { AREA_KEYWORDS, CHILD_ACTIVITY, CHILD_NOUN, RESPONSIBILITY_VERBS } from './lexicon';
import type { Span } from './temporal';
import type { InterpretationContext, RuleId } from '../types';

/**
 * WHO a clause is about. Three separate questions that must never blur:
 *   - a CHILD subject (one of her children — a household member, subject of child-scoped rows)
 *   - a MENTIONED person (a name in the sentence — never becomes a household member)
 *   - a person the responsibility is handed to (a mention, not a lifecycle: nothing here creates one)
 */

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface ChildReading {
  /** The clause is about one of her children (so it must not materialise without a subject). */
  childScoped: boolean;
  subjectMemberId: string | null;
  /** Several children could be meant and nothing says which. */
  needsChoice: boolean;
  /** Several children are named together: about the group, so there is no single subject. */
  group: boolean;
  rule: Extract<RuleId, 'child.named' | 'child.object-pronoun' | 'child.noun' | 'child.activity'> | null;
  span: Span | null;
}

const NO_CHILD: ChildReading = { childScoped: false, subjectMemberId: null, needsChoice: false, group: false, rule: null, span: null };

export function readChild(clause: string, ctx: InterpretationContext): ChildReading {
  if (ctx.children.length === 0) return NO_CHILD;

  // 1. Named. Only exact whole-word first names of children who are actually in her household.
  const named: Array<{ id: string; span: Span }> = [];
  for (const child of ctx.children) {
    const m = new RegExp(`\\b${escapeRegex(child.displayName)}(?:['’]s)?\\b`, 'i').exec(clause);
    if (m) named.push({ id: child.id, span: { start: m.index, end: m.index + m[0].length } });
  }
  if (named.length === 1) return { childScoped: true, subjectMemberId: named[0].id, needsChoice: false, group: false, rule: 'child.named', span: named[0].span };
  if (named.length > 1) {
    // Household order is not text order, so the group's extent is the min start and the max end.
    const start = Math.min(...named.map((n) => n.span.start));
    const end = Math.max(...named.map((n) => n.span.end));
    return { childScoped: false, subjectMemberId: null, needsChoice: false, group: true, rule: 'child.named', span: { start, end } };
  }

  // The group ("the kids") is the household's business, not one child's.
  if (/\b(?:the|my|our|all\s+the)\s+(?:kids|children|boys|girls)\b/i.test(clause)) return { ...NO_CHILD, group: true };

  // 2. An object pronoun after a child-facing verb: "pick HIM up", "drop her off".
  const pronoun = /\b(?:pick|drop|take|bring|get|walk|drive|meet|collect|fetch|watch)\s+(?:up\s+)?(him|her)\b|\b(?:pick|drop)\s+(him|her)\s+(?:up|off)\b/i.exec(clause);
  if (pronoun) return resolveAmong('child.object-pronoun', { start: pronoun.index, end: pronoun.index + pronoun[0].length }, ctx);

  // 3. "my son", "our daughter", "the youngest".
  const noun = CHILD_NOUN.exec(clause);
  if (noun) return resolveAmong('child.noun', { start: noun.index, end: noun.index + noun[0].length }, ctx);

  // 4. An activity that belongs to a child.
  const activity = CHILD_ACTIVITY.exec(clause);
  if (activity) return resolveAmong('child.activity', { start: activity.index, end: activity.index + activity[0].length }, ctx);

  return NO_CHILD;
}

/** One child in the household resolves the reference; more than one cannot be guessed. */
function resolveAmong(rule: NonNullable<ChildReading['rule']>, span: Span, ctx: InterpretationContext): ChildReading {
  if (ctx.children.length === 1) return { childScoped: true, subjectMemberId: ctx.children[0].id, needsChoice: false, group: false, rule, span };
  return { childScoped: true, subjectMemberId: null, needsChoice: true, group: false, rule, span };
}

// ------------------------------------------------------------- responsibility ---

export interface HandoffMention {
  name: string;
  /** Already one of the people in her life. Being mentioned still proves nothing about them. */
  known: boolean;
  span: Span;
}

const NOT_A_NAME = new Set([
  'i', 'we', 'the', 'my', 'our', 'it', 'he', 'she', 'they', 'this', 'that', 'there', 'monday', 'tuesday', 'wednesday', 'thursday',
  'friday', 'saturday', 'sunday', 'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october',
  'november', 'december', 'today', 'tomorrow', 'tonight', 'also', 'then', 'and', 'but', 'so', 'picture', 'school', 'practice',
]);

const HANDOFF_SUBJECT = new RegExp(
  String.raw`\b([A-Z][a-z]{1,20})(?:\s+(?:is|are|was))?\s+(?:will|is\s+going\s+to|'s\s+going\s+to|’s\s+going\s+to|can|could|'ll|’ll|is|says\s+(?:he|she|they)(?:'|’)?ll|offered\s+to|agreed\s+to)\s+(?:be\s+)?${RESPONSIBILITY_VERBS}`,
);
const HANDOFF_ASK = /\b(?:[Aa]sk(?:ed)?|[Tt]ell|[Tt]old|[Hh]ave|[Gg]et)\s+([A-Z][a-z]{1,20})\s+to\s+\w+/;
const HANDOFF_PRESENT = new RegExp(String.raw`\b([A-Z][a-z]{1,20})\s+(?:is|are)\s+(?:pick|drop|tak|bring|handl|cover|grabb|gett|doing|watch)\w*`);

/**
 * "Jordan will pick up Ayden at 5", "ask Maya to take him", "Maya is picking him up".
 * It only recognises the SHAPE of a handoff. Recognising it creates nothing: no person, no role, no
 * account, no responsibility — the mention stays words in the title, and the review says so.
 */
export function findHandoff(clause: string, ctx: InterpretationContext): HandoffMention | null {
  for (const rx of [HANDOFF_SUBJECT, HANDOFF_ASK, HANDOFF_PRESENT]) {
    const m = rx.exec(clause);
    if (!m) continue;
    const name = m[1];
    if (NOT_A_NAME.has(name.toLowerCase())) continue;
    if (ctx.children.some((c) => c.displayName.toLowerCase() === name.toLowerCase())) continue;
    return { name, known: ctx.people.some((p) => p.displayName.toLowerCase() === name.toLowerCase()), span: { start: m.index, end: m.index + m[0].length } };
  }
  return null;
}

// ------------------------------------------------------------------------ area ---

/** Which of her areas a clause most plainly belongs to, or null. Only an area the household actually has can be named. */
export function hintArea(clause: string, ctx: InterpretationContext, childScoped: boolean): SystemRole | null {
  const scores = new Map<SystemRole, number>();
  for (const role of ctx.areas) {
    const hits = clause.match(new RegExp(AREA_KEYWORDS[role].source, 'gi'));
    if (hits) scores.set(role, hits.length);
  }
  if (childScoped && ctx.areas.includes('kids')) scores.set('kids', (scores.get('kids') ?? 0) + 1);
  let best: SystemRole | null = null;
  let bestScore = 0;
  let tied = false;
  for (const [role, score] of scores) {
    if (score > bestScore) {
      best = role;
      bestScore = score;
      tied = false;
    } else if (score === bestScore) {
      tied = true;
    }
  }
  return tied ? null : best;
}

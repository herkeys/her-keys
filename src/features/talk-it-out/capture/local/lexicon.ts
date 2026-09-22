import type { SystemRole } from '../../../../domain/state';

/**
 * The local reader's vocabulary. Plain data, so the capability envelope can point at exactly what is
 * covered and a reviewer can see what is NOT. Every list is a bounded, hand-written set of rules'
 * inputs — this is not a language model and the lists are not a substitute for one.
 */

export const NUMBER_WORDS: Readonly<Record<string, number>> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12,
};

export const MONTHS: readonly string[] = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Words that make a clause an obligation even when it does not open with "I need to". */
export const OBLIGATION_CUES = /\b(?:needs?\s+to|has\s+to|have\s+to|got\s+to|gotta|must|should|supposed\s+to|needs?\b)/i;

/** "I need to …", "remember to …", "don't forget to …": removed from a title because they are framing, not content. */
export const OBLIGATION_LEAD =
  /^(?:(?:and|also|then|plus|so)\s+)?(?:(?:i|we)\s+(?:(?:really|also|still|just)\s+)?(?:need|have|got|must|should|ought)\s+to|(?:i|we)\s*(?:'|’)?ve\s+got\s+to|i\s*(?:'|’)?d\s+better|remember\s+to|don\s*(?:'|’)?t\s+forget\s+to|make\s+sure\s+(?:to|i|we)|need\s+to|have\s+to|gotta|(?:i|we)\s+(?:want|plan|hope)\s+to)\s+/i;

/** A clause that opens with one of these is an instruction to herself: "Call the school", "Pick him up at 5". */
export const IMPERATIVE_VERBS = [
  'call', 'text', 'email', 'send', 'pay', 'bring', 'pick', 'drop', 'buy', 'book', 'schedule', 'sign', 'return',
  'order', 'pack', 'fill', 'renew', 'cancel', 'ask', 'remind', 'submit', 'register', 'reserve', 'clean', 'wash',
  'fix', 'plan', 'make', 'get', 'take', 'meet', 'grab', 'drive', 'walk', 'mail', 'print', 'sort', 'pay', 'venmo',
  'zelle', 'reply', 'follow', 'confirm', 'update', 'check', 'find', 'set', 'organize', 'wrap', 'donate', 'label',
];

export const HEDGE_WORDS =
  /\b(?:i\s+think|i\s+believe|i\s+guess|i\s*(?:'|’)?m\s+not\s+sure|not\s+sure|maybe|probably|perhaps|might|supposedly|i\s+heard|i\s+hope)\b/i;

/** Something existing has been altered. There is no "update an existing item" reading, so this is kept as a note. */
export const CHANGE_TO_EXISTING =
  /\b(?:moved|changed|rescheduled|switched|pushed|bumped|delayed|postponed|cancel(?:l)?ed|called\s+off|shifted)\b/i;

export const RECURRENCE =
  /\b(?:every\s+(?:other\s+)?(?:day|week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|tues|wed|thu|thurs|fri|sat|sun|morning|evening|night|weekday|weekend)|each\s+(?:day|week|month|year)|daily|weekly|monthly|yearly|annually|every\s+\d+\s+(?:days|weeks|months))\b/i;

/** "next week", "this weekend": a real reference the reader will not turn into a specific day. */
export const IMPRECISE_DATE =
  /\b(?:next\s+week|this\s+week|later\s+this\s+week|this\s+weekend|next\s+weekend|next\s+month|this\s+month|end\s+of\s+(?:the\s+)?(?:week|month|year)|next\s+year)\b/i;

/** Verbs that hand something to somebody else, used to spot "Jordan will pick up …". */
export const RESPONSIBILITY_VERBS =
  '(?:pick(?:s|ing)?\\s+(?:him|her|them|\\w+)\\s+up|pick(?:s|ing)?\\s+up|drop(?:s|ping)?\\s+(?:him|her|them|\\w+)\\s+off|drop(?:s|ping)?\\s+off|tak(?:e|es|ing)|bring(?:s|ing)?|hand(?:le|les|ling)|cover(?:s|ing)?|grab(?:s|bing)?|get(?:s|ting)?|do(?:es|ing)?|call(?:s|ing)?|watch(?:es|ing)?)';

/** Object pronouns that, after a child-facing verb, name a child: "pick HIM up", "drop HER off". */
export const CHILD_FACING_VERBS = /\b(?:pick|drop|take|bring|get|walk|drive|meet|collect|fetch|watch|sign\s+up)\b/i;

/** Words that say a child is being talked about even when no name or pronoun does. */
export const CHILD_NOUN = /\b(?:my|our)\s+(?:son|daughter|kid|child|boy|girl|baby|toddler|teen(?:ager)?|little\s+one|youngest|oldest|middle\s+one)\b/i;

/**
 * Activities that belong to a child: "practice", "piano lesson", "recital". A clause about one of these,
 * with no child named, is about somebody — so with several children the reader asks which. Deliberately
 * excludes school-wide occasions (picture day, field trip) that concern the household or the class.
 */
export const CHILD_ACTIVITY =
  /\b(?:practice|lesson|lessons|recital|tutor(?:ing)?|homework|coach|game|match|tournament|rehearsal|therapy\s+session|sleepover|playdate|play\s+date|daycare|preschool|pickup|pick-up|drop-off|dropoff|swim(?:ming)?|dance|karate|gymnastics|soccer|basketball|baseball|piano|violin|band|orchestra|scouts?|cub\s+scouts?|girl\s+scouts?)\b/i;

export const AREA_KEYWORDS: Readonly<Record<SystemRole, RegExp>> = {
  kids:
    /\b(?:school|teacher|pta|permission\s+slip|field\s+trip|picture\s+day|report\s+card|conference|daycare|preschool|pediatrician|kids?|children|homework|recital|practice|lesson|playdate|classroom|bus|uniform|sports?\s+physical)\b/i,
  home:
    /\b(?:plumber|electrician|repair|contractor|trash|garbage|recycling|laundry|lawn|mow|gutters?|landlord|hvac|furnace|filter|leak|cleaner|cleaning|declutter|garage|oil\s+change|car\s+(?:service|inspection|registration)|mail\s+the|handyman|pest)\b/i,
  money:
    /\b(?:bill|bills|rent|mortgage|insurance|taxes?|invoice|venmo|zelle|reimburse|refund|deposit|budget|payment|owes?|owed|owe|paycheck|subscription|autopay)\b/i,
  meals: /\b(?:groceries|grocery|meal\s+prep|meal\s+plan|cook|cooking|lunch\s*box|lunches|menu|takeout|order\s+food|potluck|bake|baking)\b/i,
  work: /\b(?:meeting|client|deadline|boss|office|presentation|conference\s+call|standup|stand-up|project|report\s+due|manager|coworker|colleague|interview|shift|invoice\s+client)\b/i,
  wellbeing:
    /\b(?:dentist|dental|doctor|dr\.?|appointment|therapy|therapist|checkup|check-up|prescription|refill|gym|workout|yoga|dermatologist|physical|massage|eye\s+exam|optometrist|counsel(?:or|ing)|vaccine|flu\s+shot|mammogram)\b/i,
  relationships:
    /\b(?:birthday|anniversary|date\s+night|wedding|shower|dinner\s+with|lunch\s+with|coffee\s+with|call\s+(?:mom|dad|mother|father|grandma|grandpa)|thank[-\s]?you\s+note|friend|reunion|book\s+club)\b/i,
  coparenting: /\b(?:custody|exchange|handoff|hand-off|co-?parent|visitation|parenting\s+plan|court\s+date|mediation)\b/i,
};

/**
 * HIGH-STAKES GUARD — a conservative STOPGAP, not a policy (OD-2 in the ledger). It exists only so that
 * text describing danger, abuse, self-harm or coercion is never forced into ordinary household logistics.
 * It errs toward not reading. A false positive costs her one retry; a false negative would turn
 * something serious into a chore, which is the failure this guard prevents.
 */
export const HIGH_STAKES =
  /\b(?:kill(?:ing)?\s+(?:myself|him|her|them|me)|suicid\w*|self[-\s]?harm\w*|hurt(?:ing)?\s+myself|end\s+my\s+life|want\s+to\s+die|abus(?:e|ed|es|ing|ive)|domestic\s+violence|assault(?:ed|ing)?|rap(?:e|ed|ing)|molest\w*|overdos\w*|unsafe\s+(?:at|in)\s+(?:home|my\s+home)|threat(?:en|ens|ened|ening)\w*|stalk(?:er|ed|ing)?|restraining\s+order|protective\s+order|hit\s+me|hits\s+me|beat(?:s|ing)?\s+(?:me|the\s+kids|him|her)|afraid\s+(?:of|for)\s+(?:him|her|my|the\s+kids)|being\s+followed|police\s+report|call\s+911|emergency\s+room|coerc\w+|controlling\s+me|won'?t\s+let\s+me\s+leave)\b/i;

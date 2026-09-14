import type { ClarificationOption, ClarificationQuestion, DiscoveryResult } from '../../types';

export interface DiscoveryBranch {
  /** What choosing this answer tells Her Keys, phrased for the evidence trail. */
  evidence: string;
  refinedHypothesis: string;
  followUp: ClarificationQuestion;
  /**
   * Every conclusion here is labelled "Possible pattern": a conversation is
   * self-report, and a likely pattern also needs behavioral evidence
   * (HER_KEYS_PRODUCT.md section 15).
   */
  outcomes: Record<string, DiscoveryResult>;
  /** Used when the final answer doesn't change the conclusion. */
  fallbackOutcome: DiscoveryResult;
}

export interface DiscoveryTopic {
  id: string;
  keywords: string[];
  openingHypothesis: string;
  firstQuestion: ClarificationQuestion;
  branches: Record<string, DiscoveryBranch>;
}

/** Offered when the conversation starts, and again if nothing matches. */
export const conversationStarters: ClarificationOption[] = [
  { id: 'overload', label: 'I’m always behind', keywords: ['behind'] },
  { id: 'household', label: 'The house is a mess', keywords: ['house', 'mess'] },
  { id: 'money', label: 'Money stresses me out', keywords: ['money'] },
  { id: 'weekend', label: 'Sundays are rough', keywords: ['sunday', 'sundays'] },
];

export const unmatchedReply = 'I’m not sure I understood that yet. Pick one of these, or say a little more.';

export const resolvedReply =
  'That’s as far as this prototype conversation goes. Start over to look at something else.';

const overload: DiscoveryTopic = {
  id: 'overload',
  // Deliberately specific: bare "keep up" would swallow "keep up with the house",
  // which belongs to the household topic.
  keywords: [
    'behind',
    'all day',
    'nothing gets finished',
    'never finished',
    'keep up with everything',
    'keep up with anything',
    'catch up with everything',
    'getting away from me',
    'overwhelmed',
    'exhausted',
    'run ragged',
    'no time',
  ],
  openingHypothesis:
    'This may not be a motivation problem. Your day may be getting overloaded during one particular transition.',
  firstQuestion: {
    id: 'overload-when',
    text: 'When does the day usually start feeling like it’s getting away from you?',
    options: [
      { id: 'before-work', label: 'Before work', keywords: ['before work', 'morning', 'mornings', 'out the door'] },
      { id: 'lunch', label: 'Around lunch', keywords: ['lunch', 'midday', 'middle of the day'] },
      {
        id: 'pickup',
        label: 'After school pickup',
        keywords: ['pickup', 'pick up', 'after school', 'school run', 'afternoon'],
        evidenceLabel: 'The day tips after school pickup',
      },
      { id: 'after-dinner', label: 'After dinner', keywords: ['after dinner', 'evening', 'evenings', 'bedtime'] },
    ],
  },
  branches: {
    pickup: {
      evidence: 'The day tips after school pickup',
      refinedHypothesis:
        'That helps. The pressure may be coming from the handoff between work, pickup, activities and dinner — not from the whole day.',
      followUp: {
        id: 'overload-pickup-first',
        text: 'What usually happens first after pickup?',
        options: [
          {
            id: 'activities',
            label: 'Driving to activities',
            keywords: ['driving', 'drive', 'activities', 'practice', 'sports', 'lessons'],
            evidenceLabel: 'Driving to activities comes first',
          },
          {
            id: 'dinner',
            label: 'Starting dinner',
            keywords: ['dinner', 'cooking', 'cook', 'meal', 'food'],
            evidenceLabel: 'Dinner starts right after pickup',
          },
          {
            id: 'work',
            label: 'Finishing work',
            keywords: ['work', 'emails', 'email', 'laptop'],
            evidenceLabel: 'Work is still running after pickup',
          },
          {
            id: 'errands',
            label: 'Errands',
            keywords: ['errands', 'errand', 'store', 'shopping', 'grocery'],
            evidenceLabel: 'Errands land right after pickup',
          },
          {
            id: 'everything',
            label: 'Everything at once',
            keywords: ['everything at once', 'all at once', 'everything', 'same time', 'all of it'],
            evidenceLabel: 'Everything lands at once after pickup',
          },
        ],
      },
      outcomes: {
        everything: {
          summary:
            'Your day isn’t consistently overloaded from morning to night. The bottleneck is the 4–7 PM transition, when work, transportation, activities and dinner compete for the same time.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Don’t reorganize your whole evening today. Choose tomorrow’s dinner before noon.',
        },
        dinner: {
          summary:
            'Dinner is landing at the exact moment the day is tightest, so it competes with pickup and activities instead of following them.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Choose tomorrow’s dinner before noon, while the decision is cheap.',
        },
        activities: {
          summary:
            'The 4–7 PM window is already spoken for by transport before anything else can start. That reads as a sequencing problem rather than a planning one.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Put tomorrow’s activity bag by the door tonight.',
        },
        work: {
          summary:
            'The workday is running past pickup, so two responsibilities are happening at the same time instead of one after the other.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Pick the one work task that has to finish before 3 PM tomorrow, and write it down.',
        },
        errands: {
          summary:
            'Errands are being absorbed into the tightest part of the day rather than the loosest part of it.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Move one errand to a morning slot tomorrow.',
        },
      },
      fallbackOutcome: {
        summary:
          'Several things are arriving in the same 4–7 PM window, which is why the day feels like it gets away from you at that point rather than earlier.',
        confidenceLabel: 'Possible pattern',
        nextStep: 'Choose tomorrow’s dinner before noon.',
      },
    },

    'before-work': {
      evidence: 'The day tips before work starts',
      refinedHypothesis:
        'That helps. The morning handoff may be starting you off already behind, rather than the day itself being too full.',
      followUp: {
        id: 'overload-morning-hardest',
        text: 'What’s usually the hardest part of the morning?',
        options: [
          { id: 'kids-out', label: 'Getting everyone out', keywords: ['kids', 'everyone out', 'school', 'dressed'] },
          { id: 'my-start', label: 'Starting my own work', keywords: ['my work', 'starting', 'focus', 'begin'] },
          { id: 'nothing-ready', label: 'Nothing’s ready from last night', keywords: ['ready', 'last night', 'prepared', 'night before'] },
        ],
      },
      outcomes: {
        'kids-out': {
          summary:
            'The morning is carrying the whole household’s launch at once, so your own day starts from behind rather than from zero.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Tonight, set out one thing that always causes a scramble — shoes, bags or forms.',
        },
        'my-start': {
          summary:
            'The morning isn’t short of time so much as short of a clean start — your first work block begins after the day has already spent you.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Write down tomorrow’s first work task tonight, so morning-you doesn’t have to choose.',
        },
        'nothing-ready': {
          summary:
            'The morning is absorbing decisions that could have been made the night before, which is why it feels heavier than it looks.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Pick one thing to set out tonight. Just one.',
        },
      },
      fallbackOutcome: {
        summary:
          'The morning seems to be where the day loses its margin, before the calendar even starts.',
        confidenceLabel: 'Possible pattern',
        nextStep: 'Set out one thing tonight that usually causes a scramble.',
      },
    },

    lunch: {
      evidence: 'The day tips around midday',
      refinedHypothesis:
        'That helps. The morning may be running long and pushing everything later, rather than the afternoon being overloaded on its own.',
      followUp: {
        id: 'overload-midday-overrun',
        text: 'What usually overruns first?',
        options: [
          { id: 'meetings', label: 'Meetings', keywords: ['meetings', 'meeting', 'calls', 'call'] },
          { id: 'admin', label: 'Admin and messages', keywords: ['admin', 'messages', 'email', 'emails', 'inbox'] },
          { id: 'errands', label: 'Errands', keywords: ['errands', 'errand', 'store', 'appointments'] },
        ],
      },
      outcomes: {
        meetings: {
          summary:
            'Meetings are running past their edges, so every later block starts late. The afternoon is inheriting the morning’s overrun.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Put a 10-minute gap after tomorrow’s longest meeting.',
        },
        admin: {
          summary:
            'Small admin is expanding into the middle of the day, which is when it’s most expensive — everything after it shifts.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Give messages one 15-minute slot tomorrow instead of all day.',
        },
        errands: {
          summary:
            'Midday errands are costing more than their length, because they push the rest of the day back with them.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Move tomorrow’s errand to either end of the day, not the middle.',
        },
      },
      fallbackOutcome: {
        summary: 'Midday seems to be where the schedule starts sliding, and the afternoon inherits it.',
        confidenceLabel: 'Possible pattern',
        nextStep: 'Put a 10-minute gap after tomorrow’s longest commitment.',
      },
    },

    'after-dinner': {
      evidence: 'The day tips after dinner',
      refinedHypothesis:
        'That helps. The evening may be where everything that didn’t fit earlier arrives at once, rather than the day being too full throughout.',
      followUp: {
        id: 'overload-evening-waiting',
        text: 'What’s usually still waiting after dinner?',
        options: [
          { id: 'tidying', label: 'Tidying up', keywords: ['tidying', 'tidy', 'cleaning', 'clean', 'dishes'] },
          { id: 'paperwork', label: 'Paperwork and admin', keywords: ['paperwork', 'admin', 'forms', 'bills'] },
          { id: 'bedtime', label: 'Bedtime routines', keywords: ['bedtime', 'bed', 'baths', 'stories'] },
        ],
      },
      outcomes: {
        tidying: {
          summary:
            'The evening is absorbing the day’s leftovers, so it reads as the tiring part when it’s really the collection point.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Reset one surface tonight — the counter, not the house.',
        },
        paperwork: {
          summary:
            'Administrative work is landing in the lowest-energy hour of your day, which is likely why it keeps moving rather than getting done.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Move one piece of paperwork to a morning slot tomorrow.',
        },
        bedtime: {
          summary:
            'Bedtime is arriving while the day is still open, so two things are running at once instead of in sequence.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Pick one thing to finish before bedtime starts tomorrow.',
        },
      },
      fallbackOutcome: {
        summary: 'The evening seems to be collecting what the rest of the day couldn’t hold.',
        confidenceLabel: 'Possible pattern',
        nextStep: 'Reset one surface tonight — not the whole room.',
      },
    },
  },
};

const household: DiscoveryTopic = {
  id: 'household',
  keywords: ['house', 'mess', 'messy', 'clutter', 'tidy', 'clean', 'piles', 'piling'],
  openingHypothesis:
    'It might not be about cleaning more — sometimes a messy house means there’s no clear landing spot for the things that come in every day.',
  firstQuestion: {
    id: 'household-where',
    text: 'When things pile up, where does most of it end up?',
    options: [
      {
        id: 'one-spot',
        label: 'One spot',
        keywords: ['one spot', 'counter', 'table', 'same place'],
        evidenceLabel: 'It collects in one spot',
      },
      {
        id: 'all-over',
        label: 'All over the house',
        keywords: ['all over', 'everywhere', 'whole house'],
        evidenceLabel: 'It spreads across the house',
      },
      {
        id: 'kids-drop',
        label: 'Wherever the kids drop it',
        keywords: ['kids', 'drop', 'backpacks', 'shoes', 'bags'],
        evidenceLabel: 'It lands wherever the kids drop it',
      },
    ],
  },
  branches: {
    'one-spot': {
      evidence: 'It collects in one spot',
      refinedHypothesis:
        'That’s useful. One collection point usually means the house has a landing spot — it just doesn’t have anywhere for things to go next.',
      followUp: {
        id: 'household-one-spot-what',
        text: 'What’s usually in that pile?',
        options: [
          { id: 'paper', label: 'Paper and mail', keywords: ['paper', 'mail', 'post', 'letters'] },
          { id: 'school', label: 'School things', keywords: ['school', 'forms', 'homework', 'backpacks'] },
          { id: 'everything', label: 'A bit of everything', keywords: ['everything', 'mixed', 'all sorts'] },
        ],
      },
      outcomes: {
        paper: {
          summary:
            'The pile is mostly paper, which means it isn’t a tidying problem — it’s a decision backlog sitting in a visible place.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Pull only today’s mail out of the pile. Leave the rest.',
        },
        school: {
          summary:
            'School items are arriving daily but have no home, so the same handful of things gets re-sorted every evening.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Put one basket by the door for school bags tonight.',
        },
        everything: {
          summary:
            'One surface is doing the work of several systems, which is why clearing it never holds for long.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Clear one category off that surface — not the whole surface.',
        },
      },
      fallbackOutcome: {
        summary: 'That one surface seems to be absorbing whatever doesn’t have a home yet.',
        confidenceLabel: 'Possible pattern',
        nextStep: 'Clear one category off it — not the whole thing.',
      },
    },

    'all-over': {
      evidence: 'It spreads across the house',
      refinedHypothesis:
        'That’s useful. When things spread rather than collect, it usually means nothing is catching them on the way in.',
      followUp: {
        id: 'household-all-over-when',
        text: 'When does the spreading mostly happen?',
        options: [
          { id: 'after-school', label: 'After school', keywords: ['after school', 'afternoon', 'pickup'] },
          { id: 'weekends', label: 'Weekends', keywords: ['weekend', 'weekends', 'saturday', 'sunday'] },
          { id: 'all-week', label: 'Steadily all week', keywords: ['all week', 'constantly', 'always', 'steadily'] },
        ],
      },
      outcomes: {
        'after-school': {
          summary:
            'The spread is concentrated in one part of the day, which makes it a doorway problem rather than a whole-house problem.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Put one basket by the door before pickup tomorrow.',
        },
        weekends: {
          summary:
            'Weekends are when the house is most used and least reset, so Monday starts from a deficit.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Reset one shared surface on Sunday evening.',
        },
        'all-week': {
          summary:
            'Nothing is catching items at the point they enter, so every room slowly accumulates instead of one doing it.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Choose the single doorway most things come through, and put one basket there.',
        },
      },
      fallbackOutcome: {
        summary: 'Things seem to be entering the house faster than anything is catching them.',
        confidenceLabel: 'Possible pattern',
        nextStep: 'Put one basket by the main door.',
      },
    },

    'kids-drop': {
      evidence: 'It lands wherever the kids drop it',
      refinedHypothesis:
        'That’s useful. That usually points at the landing zone rather than at the kids — there may be nowhere obvious for their things to go.',
      followUp: {
        id: 'household-kids-what',
        text: 'What gets dropped most?',
        options: [
          { id: 'bags', label: 'Bags and shoes', keywords: ['bags', 'backpacks', 'shoes', 'coats'] },
          { id: 'sports', label: 'Sports gear', keywords: ['sports', 'kit', 'gear', 'practice'] },
          { id: 'papers', label: 'School paper', keywords: ['paper', 'papers', 'forms', 'notes'] },
        ],
      },
      outcomes: {
        bags: {
          summary:
            'Bags and shoes are arriving at the same door every day with nowhere to land, so they end up spread through the rooms beyond it.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Put one basket by the door for backpacks tonight.',
        },
        sports: {
          summary:
            'Sports gear moves in and out on a schedule, so it needs a staging spot rather than storage.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Pick one spot by the door for tomorrow’s kit, and put it there tonight.',
        },
        papers: {
          summary:
            'School paper is arriving daily and getting handled more than once, which is what makes it feel constant.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Put one tray where school paper lands, and put today’s in it.',
        },
      },
      fallbackOutcome: {
        summary: 'The things coming in each day don’t have an obvious first stop.',
        confidenceLabel: 'Possible pattern',
        nextStep: 'Put one basket by the door tonight.',
      },
    },
  },
};

const money: DiscoveryTopic = {
  id: 'money',
  keywords: ['money', 'bills', 'bill', 'budget', 'finances', 'financial', 'paying', 'account'],
  openingHypothesis:
    'This might carry more pressure than actual risk — plenty of people manage money fine while still dreading looking at it.',
  firstQuestion: {
    id: 'money-hardest',
    text: 'Which part is hardest?',
    options: [
      {
        id: 'opening',
        label: 'Opening the mail or app',
        keywords: ['opening', 'open', 'mail', 'app', 'looking', 'look'],
        evidenceLabel: 'The hard part is opening it at all',
      },
      {
        id: 'numbers',
        label: 'The numbers themselves',
        keywords: ['numbers', 'maths', 'math', 'amount', 'balance'],
        evidenceLabel: 'The hard part is the numbers',
      },
      {
        id: 'deciding',
        label: 'Deciding what to pay first',
        keywords: ['deciding', 'decide', 'priority', 'first', 'order'],
        evidenceLabel: 'The hard part is deciding the order',
      },
    ],
  },
  branches: {
    opening: {
      evidence: 'The hard part is opening it at all',
      refinedHypothesis:
        'That’s worth separating out. If opening it is the hard part, the difficulty is arriving before any actual financial problem does.',
      followUp: {
        id: 'money-opening-when',
        text: 'When do you usually try?',
        options: [
          { id: 'evening', label: 'In the evening', keywords: ['evening', 'night', 'late'] },
          { id: 'weekend', label: 'At the weekend', keywords: ['weekend', 'saturday', 'sunday'] },
          { id: 'whenever', label: 'Whenever I remember', keywords: ['whenever', 'remember', 'random', 'no set time'] },
        ],
      },
      outcomes: {
        evening: {
          summary:
            'Financial admin is landing in your lowest-energy hour, which is likely why it keeps getting postponed rather than done.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Open your banking app once tomorrow morning. Just look at the balance.',
        },
        weekend: {
          summary:
            'Money is being handled in the time you have least protection around, so it competes with everything else you were hoping to do.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Open your banking app tomorrow morning and note the balance. Nothing else.',
        },
        whenever: {
          summary:
            'Without a set moment, the decision to look becomes its own task — which is usually the part that gets avoided.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Pick one fixed time this week to look. Write the time down, not the task.',
        },
      },
      fallbackOutcome: {
        summary: 'The barrier looks like it sits before the money itself — at the point of looking.',
        confidenceLabel: 'Possible pattern',
        nextStep: 'Open your banking app tomorrow morning and note the balance.',
      },
    },

    numbers: {
      evidence: 'The hard part is the numbers',
      refinedHypothesis:
        'That’s worth separating out. If the numbers themselves are hard, that’s a clarity problem rather than an avoidance one.',
      followUp: {
        id: 'money-numbers-what',
        text: 'What’s hardest to see clearly?',
        options: [
          { id: 'whats-left', label: 'What’s actually left', keywords: ['left', 'remaining', 'spare', 'balance'] },
          { id: 'whats-due', label: 'What’s due next', keywords: ['due', 'next', 'coming', 'upcoming'] },
          { id: 'where-it-goes', label: 'Where it goes', keywords: ['where', 'goes', 'spending', 'spent'] },
        ],
      },
      outcomes: {
        'whats-left': {
          summary:
            'The uncertainty is about headroom, not arithmetic — which is a much smaller question than it feels like.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Open your checking account and write down the current balance.',
        },
        'whats-due': {
          summary:
            'The pressure is coming from timing rather than totals — not knowing what lands next is doing most of the work.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Write down the next single bill and its date. One line.',
        },
        'where-it-goes': {
          summary:
            'The gap is in visibility after the fact, which is a different problem from not having enough.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Look at yesterday’s transactions only. Nothing older.',
        },
      },
      fallbackOutcome: {
        summary: 'The difficulty seems to sit in seeing the picture clearly, not in the money itself.',
        confidenceLabel: 'Possible pattern',
        nextStep: 'Open your checking account and write down the balance.',
      },
    },

    deciding: {
      evidence: 'The hard part is deciding the order',
      refinedHypothesis:
        'That’s worth separating out. Deciding an order is a judgment problem, and those are heavier when they’re made repeatedly.',
      followUp: {
        id: 'money-deciding-how-often',
        text: 'How often does that decision come up?',
        options: [
          { id: 'monthly', label: 'Once a month', keywords: ['month', 'monthly', 'once a month'] },
          { id: 'weekly', label: 'Most weeks', keywords: ['week', 'weekly', 'most weeks'] },
          { id: 'constantly', label: 'Constantly', keywords: ['constantly', 'always', 'every day', 'daily'] },
        ],
      },
      outcomes: {
        monthly: {
          summary:
            'This is a recurring decision rather than a recurring crisis, which means it can be settled as a rule once instead of remade each time.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Write down which bill always goes first. One line, once.',
        },
        weekly: {
          summary:
            'A judgment call is repeating every week, and repeated decisions cost more than the task itself.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Decide the order once this week and write it where you’ll see it.',
        },
        constantly: {
          summary:
            'The decision is running continuously rather than at set points, which keeps it in your head all week.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Pick one fixed day for money decisions. Write the day down.',
        },
      },
      fallbackOutcome: {
        summary: 'The weight seems to come from making the same call repeatedly.',
        confidenceLabel: 'Possible pattern',
        nextStep: 'Write down which bill always goes first.',
      },
    },
  },
};

const weekend: DiscoveryTopic = {
  id: 'weekend',
  keywords: ['sunday', 'sundays', 'weekend', 'weekends', 'saturday'],
  openingHypothesis: 'Certain days can carry an invisible backlog from the week before.',
  firstQuestion: {
    id: 'weekend-undone',
    text: 'What’s usually still undone when that day starts?',
    options: [
      {
        id: 'laundry',
        label: 'Laundry and tidying',
        keywords: ['laundry', 'washing', 'tidying', 'cleaning'],
        evidenceLabel: 'Laundry and tidying carry over',
      },
      {
        id: 'admin',
        label: 'Paperwork and admin',
        keywords: ['paperwork', 'admin', 'forms', 'bills'],
        evidenceLabel: 'Paperwork carries over',
      },
      {
        id: 'planning',
        label: 'Next week’s planning',
        keywords: ['planning', 'plan', 'next week', 'schedule'],
        evidenceLabel: 'Next week’s planning carries over',
      },
    ],
  },
  branches: {
    laundry: {
      evidence: 'Laundry and tidying carry over',
      refinedHypothesis:
        'That helps. The day may be inheriting the week’s leftovers rather than being difficult in itself.',
      followUp: {
        id: 'weekend-laundry-feel',
        text: 'When does it start feeling heavy?',
        options: [
          { id: 'waking', label: 'As soon as I wake up', keywords: ['wake', 'waking', 'morning', 'start'] },
          { id: 'afternoon', label: 'By the afternoon', keywords: ['afternoon', 'later', 'midday'] },
          { id: 'evening', label: 'In the evening', keywords: ['evening', 'night', 'before monday'] },
        ],
      },
      outcomes: {
        waking: {
          summary:
            'The day starts already owing something, so it never gets a clean beginning — that’s a backlog problem, not a weekend problem.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Start one load on Saturday instead. One.',
        },
        afternoon: {
          summary:
            'The weight builds as the day runs out, which suggests the list is bigger than the hours rather than the task being hard.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Pick the one thing that actually has to be done before Monday.',
        },
        evening: {
          summary:
            'The heaviness is arriving with Monday rather than with the chores — it’s anticipation, not workload.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Write down Monday’s first task on Sunday afternoon, then stop.',
        },
      },
      fallbackOutcome: {
        summary: 'The day seems to be carrying what the week didn’t finish.',
        confidenceLabel: 'Possible pattern',
        nextStep: 'Pick the one thing that actually has to be done before Monday.',
      },
    },

    admin: {
      evidence: 'Paperwork carries over',
      refinedHypothesis:
        'That helps. Administrative work tends to get pushed to the one day with unstructured time, which is also the day with the least structure to hold it.',
      followUp: {
        id: 'weekend-admin-kind',
        text: 'What kind of paperwork is it usually?',
        options: [
          { id: 'school', label: 'School forms', keywords: ['school', 'forms', 'permission'] },
          { id: 'money', label: 'Bills and money', keywords: ['bills', 'money', 'payments'] },
          { id: 'legal', label: 'Official paperwork', keywords: ['official', 'legal', 'documents'] },
        ],
      },
      outcomes: {
        school: {
          summary:
            'School paperwork arrives on weekdays but gets handled at weekends, so it spends the week in your head.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Handle the next school form the day it arrives, not on Sunday.',
        },
        money: {
          summary:
            'Money admin is landing on the day with the least protection around it, so it competes with rest.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Move one money task to a weekday morning.',
        },
        legal: {
          summary:
            'Official paperwork carries more weight per item, so a small number of documents can dominate a whole day.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Open the folder and note what the next deadline actually is.',
        },
      },
      fallbackOutcome: {
        summary: 'Paperwork seems to be collecting on one day rather than moving through the week.',
        confidenceLabel: 'Possible pattern',
        nextStep: 'Move one paperwork task to a weekday morning.',
      },
    },

    planning: {
      evidence: 'Next week’s planning carries over',
      refinedHypothesis:
        'That helps. If planning is what’s outstanding, the day may be heavy because it’s holding the whole week ahead, not just itself.',
      followUp: {
        id: 'weekend-planning-part',
        text: 'Which part of planning is hardest?',
        options: [
          { id: 'calendar', label: 'Working out the week', keywords: ['calendar', 'week', 'schedule', 'diary'] },
          { id: 'meals', label: 'Meals', keywords: ['meals', 'food', 'dinners', 'shopping'] },
          { id: 'logistics', label: 'Who goes where', keywords: ['logistics', 'lifts', 'driving', 'who goes where'] },
        ],
      },
      outcomes: {
        calendar: {
          summary:
            'One day is carrying the full weight of the week ahead, which is why it feels disproportionate to what’s actually on it.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Look at Monday only. Leave the rest of the week alone.',
        },
        meals: {
          summary:
            'Meal decisions for a whole week are being made in one sitting, which is a lot of decisions for one afternoon.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Decide Monday’s dinner. Only Monday’s.',
        },
        logistics: {
          summary:
            'The hard part is coordination rather than time — who goes where is a dependency problem, and those don’t get easier by starting earlier.',
          confidenceLabel: 'Possible pattern',
          nextStep: 'Write down the one journey next week you’re least sure about.',
        },
      },
      fallbackOutcome: {
        summary: 'The day seems to be holding the whole week ahead rather than just itself.',
        confidenceLabel: 'Possible pattern',
        nextStep: 'Look at Monday only.',
      },
    },
  },
};

export const discoveryTopics: DiscoveryTopic[] = [overload, household, money, weekend];

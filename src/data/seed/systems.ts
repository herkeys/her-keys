export interface HouseholdSystem {
  id: string;
  name: string;
  description: string;
  domain: 'home' | 'money';
}

/**
 * Systems already working for this fictional household. Her Keys should
 * protect these rather than replace them with something new.
 */
export const householdSystems: HouseholdSystem[] = [
  {
    id: 'sys-1',
    name: 'Backpack landing zone',
    description: 'One basket by the door catches backpacks and shoes before they spread through the house.',
    domain: 'home',
  },
  {
    id: 'sys-2',
    name: 'Sunday reset',
    description: '20 minutes each Sunday to reset shared spaces before the week starts.',
    domain: 'home',
  },
  {
    id: 'sys-3',
    name: 'Bill envelope',
    description: 'Paper bills get sorted into a single envelope every Sunday instead of scattering across the counter.',
    domain: 'money',
  },
  {
    id: 'sys-4',
    name: 'Autopay for utilities',
    description: 'Electric, water, and internet are on autopay — one less thing to track.',
    domain: 'money',
  },
];

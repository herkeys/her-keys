export type MemberRole = 'parent' | 'child' | 'co-parent';

export interface HouseholdMember {
  id: string;
  name: string;
  role: MemberRole;
}

export interface Child extends HouseholdMember {
  role: 'child';
  age: number;
}

export interface Household {
  id: string;
  name: string;
  user: HouseholdMember;
  children: Child[];
  coParent?: HouseholdMember;
}

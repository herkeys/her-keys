export type ConfidenceLevel = 'possible' | 'likely' | 'established';

export interface OnboardingAnswers {
  goals: string[];
  strengths: string[];
  struggles: string[];
}

export interface OperatingProfileInsight {
  label: string;
  confidence: ConfidenceLevel;
  detail: string;
}

export interface OperatingProfile {
  insights: OperatingProfileInsight[];
  /** What Her Keys explicitly does not know yet — see contract section 15. */
  stillLearning: string;
}

import { createContext, useContext, useState, type ReactNode } from 'react';
import type { OnboardingAnswers } from '../types';

interface OnboardingContextValue {
  answers: OnboardingAnswers;
  toggleGoal: (goal: string) => void;
  toggleStrength: (strength: string) => void;
  toggleStruggle: (struggle: string) => void;
}

const emptyAnswers: OnboardingAnswers = { goals: [], strengths: [], struggles: [] };

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [answers, setAnswers] = useState<OnboardingAnswers>(emptyAnswers);

  const value: OnboardingContextValue = {
    answers,
    toggleGoal: (goal) => setAnswers((a) => ({ ...a, goals: toggle(a.goals, goal) })),
    toggleStrength: (strength) => setAnswers((a) => ({ ...a, strengths: toggle(a.strengths, strength) })),
    toggleStruggle: (struggle) => setAnswers((a) => ({ ...a, struggles: toggle(a.struggles, struggle) })),
  };

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error('useOnboarding must be used within OnboardingProvider');
  return ctx;
}

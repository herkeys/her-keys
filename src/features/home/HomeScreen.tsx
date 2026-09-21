import { router } from 'expo-router';
import { useState } from 'react';
import { restoreHomeArea } from './model/mutations';
import type { HomeSectionKey } from './model/types';
import { HomeScreenView } from './ui/HomeScreenView';
import { useHomeCommit, useHomeView } from './useHomeView';

/**
 * Home OS behind the existing `/life/home` route. It wires the projection, the store and the router to the presentational
 * `HomeScreenView`; it contains no domain reasoning. Home is reached through the Life hub exactly as before — no hub or
 * registration change.
 */
export function HomeScreen() {
  const { readiness, view, screen, copyContext } = useHomeView();
  const { run, busy, error } = useHomeCommit();
  const [expanded, setExpanded] = useState<Partial<Record<HomeSectionKey, boolean>>>({});

  return (
    <HomeScreenView
      screen={screen}
      view={view}
      readiness={readiness}
      copyContext={copyContext}
      expanded={expanded}
      busy={busy}
      error={error}
      onToggleSection={(key) => setExpanded((current) => ({ ...current, [key]: !current[key] }))}
      onOpenItem={(homeItemId) => router.push({ pathname: '/life/home-item', params: { itemId: homeItemId } })}
      onAddTask={() => router.push('/life/home-task-editor')}
      onAddVisit={() => router.push('/life/home-visit-editor')}
      onRestoreArea={() => void run((state) => restoreHomeArea(state))}
      onOpenSystems={() => router.push('/systems')}
    />
  );
}

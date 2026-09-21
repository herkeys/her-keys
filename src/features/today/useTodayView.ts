import { useEffect, useMemo, useState } from 'react';
import { AppState as NativeAppState } from 'react-native';
import { useAppStore, useStoreSnapshot } from '../../store/AppStateProvider';
import { buildTodayView, type TodayView } from './model';

/**
 * The one place the Today screen reads the clock.
 *
 * The projection is pure and takes `nowMs` from here; nothing under it touches the
 * system clock. It advances once a minute and whenever the app returns to the
 * foreground. Each advance first asks the store to pick up a new logical day, so a
 * screen left open across midnight re-derives against the new day — with the new
 * day's One Move already decided — instead of showing yesterday's. `nowMs` may be
 * supplied to hold the screen at an instant (the dev gallery and tests do).
 */
export function useTodayView(nowMs?: number): TodayView {
  const store = useAppStore();
  const snapshot = useStoreSnapshot();
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    if (nowMs !== undefined) return;
    const advance = () => {
      store.refreshDay();
      setTick(Date.now());
    };
    const subscription = NativeAppState.addEventListener('change', (next) => {
      if (next === 'active') advance();
    });
    const timer = setInterval(advance, 60_000);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [store, nowMs]);

  const now = nowMs ?? tick;
  const { state, status, recovery, persistence } = snapshot;
  return useMemo(() => buildTodayView({ state, nowMs: now, runtime: { status, recovery, persistence } }), [state, status, recovery, persistence, now]);
}

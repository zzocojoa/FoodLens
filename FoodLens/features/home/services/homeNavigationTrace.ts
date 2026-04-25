export type HomeNavigationTraceTarget = 'allergies' | 'history' | 'trip_stats';

export type HomeNavigationTracePhase =
  | 'card_press'
  | 'handler_entry'
  | 'navigation_dispatch'
  | 'screen_mount'
  | 'first_content'
  | 'async_load_start'
  | 'async_load_end';

export type HomeNavigationTraceMarker = Readonly<{
  label: `home_card_navigation.${HomeNavigationTraceTarget}.${HomeNavigationTracePhase}`;
  timestampMs: number;
}>;

export const markHomeNavigationTrace = (
  target: HomeNavigationTraceTarget,
  phase: HomeNavigationTracePhase
): void => {
  if (!__DEV__) {
    return;
  }

  const marker: HomeNavigationTraceMarker = {
    label: `home_card_navigation.${target}.${phase}`,
    timestampMs: Date.now(),
  };

  console.log('[HomeCardNavigationTrace]', marker);
};

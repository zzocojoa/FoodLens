import { FloatingBottomNavItemKey } from './floatingBottomNav.constants';

type TabSwitchTraceDetailValue = boolean | number | string | null | undefined;

type TabSwitchTraceDetails = Record<string, TabSwitchTraceDetailValue>;

type PendingTabSwitchTrace = Readonly<{
  id: number;
  source: FloatingBottomNavItemKey | null;
  startedAtMs: number;
  target: FloatingBottomNavItemKey;
}>;

let pendingTraceId = 0;
let pendingTabSwitchTrace: PendingTabSwitchTrace | null = null;

export const startTopLevelTabSwitchTrace = (params: {
  source: FloatingBottomNavItemKey | null;
  target: FloatingBottomNavItemKey;
}): void => {
  pendingTraceId += 1;
  pendingTabSwitchTrace = {
    id: pendingTraceId,
    source: params.source,
    startedAtMs: Date.now(),
    target: params.target,
  };

  console.log('[TabSwitchTrace] start', pendingTabSwitchTrace);
};

export const completeTopLevelTabSwitchTrace = (params: {
  details: TabSwitchTraceDetails;
  target: FloatingBottomNavItemKey;
}): void => {
  if (!pendingTabSwitchTrace) {
    return;
  }

  if (pendingTabSwitchTrace.target !== params.target) {
    return;
  }

  const completedAtMs = Date.now();
  const durationMs = completedAtMs - pendingTabSwitchTrace.startedAtMs;
  const trace = pendingTabSwitchTrace;

  pendingTabSwitchTrace = null;

  console.log('[TabSwitchTrace] ready', {
    traceId: trace.id,
    source: trace.source,
    target: trace.target,
    startedAtMs: trace.startedAtMs,
    completedAtMs,
    durationMs,
    ...params.details,
  });
};

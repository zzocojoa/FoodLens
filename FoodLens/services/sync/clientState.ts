import type {
  SyncedClientState,
  SyncedHistoryFilter,
  SyncedHistoryMode,
  SyncedMapRegion,
} from '@/models/User';
import type { MeSettingsClientState } from './phase2Sync.types';

const HISTORY_MODES = new Set<SyncedHistoryMode>(['list', 'map']);
const HISTORY_FILTERS = new Set<SyncedHistoryFilter>(['all', 'ok', 'avoid', 'ask']);
const hasOwn = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const normalizeString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeHistoryMode = (value: unknown): SyncedHistoryMode | undefined => {
  if (typeof value !== 'string') return undefined;
  return HISTORY_MODES.has(value as SyncedHistoryMode) ? (value as SyncedHistoryMode) : undefined;
};

const normalizeHistoryFilter = (value: unknown): SyncedHistoryFilter | undefined => {
  if (typeof value !== 'string') return undefined;
  return HISTORY_FILTERS.has(value as SyncedHistoryFilter)
    ? (value as SyncedHistoryFilter)
    : undefined;
};

const normalizeMapRegion = (value: unknown): SyncedMapRegion | null | undefined => {
  if (value === null) return null;
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Record<string, unknown>;
  const latitude = candidate['latitude'];
  const longitude = candidate['longitude'];
  const latitudeDelta = candidate['latitudeDelta'];
  const longitudeDelta = candidate['longitudeDelta'];
  if (
    typeof latitude !== 'number' ||
    !Number.isFinite(latitude) ||
    typeof longitude !== 'number' ||
    !Number.isFinite(longitude) ||
    typeof latitudeDelta !== 'number' ||
    !Number.isFinite(latitudeDelta) ||
    typeof longitudeDelta !== 'number' ||
    !Number.isFinite(longitudeDelta)
  ) {
    return undefined;
  }
  return {
    latitude,
    longitude,
    latitudeDelta,
    longitudeDelta,
  };
};

const isEmptyObject = (value: Record<string, unknown>): boolean => Object.keys(value).length === 0;

const normalizeOnboardingState = (
  value: SyncedClientState['onboarding'] | null | undefined
): SyncedClientState['onboarding'] | undefined => {
  if (!value) return undefined;
  const onboarding: NonNullable<SyncedClientState['onboarding']> = {};
  if (hasOwn(value, 'completedAt')) {
    onboarding.completedAt = normalizeString(value.completedAt);
  }
  return isEmptyObject(onboarding as Record<string, unknown>) ? undefined : onboarding;
};

const normalizeHomeState = (
  value: SyncedClientState['home'] | null | undefined
): SyncedClientState['home'] | undefined => {
  if (!value) return undefined;
  const home: NonNullable<SyncedClientState['home']> = {};
  if (hasOwn(value, 'selectedDate')) {
    home.selectedDate = normalizeString(value.selectedDate);
  }
  return isEmptyObject(home as Record<string, unknown>) ? undefined : home;
};

const normalizeHistoryState = (
  value: SyncedClientState['history'] | null | undefined
): SyncedClientState['history'] | undefined => {
  if (!value) return undefined;
  const history: NonNullable<SyncedClientState['history']> = {};

  if (hasOwn(value, 'archiveMode')) {
    const archiveMode = normalizeHistoryMode(value.archiveMode);
    if (archiveMode !== undefined) {
      history.archiveMode = archiveMode;
    }
  }

  if (hasOwn(value, 'filter')) {
    const filter = normalizeHistoryFilter(value.filter);
    if (filter !== undefined) {
      history.filter = filter;
    }
  }

  if (hasOwn(value, 'mapRegion')) {
    const mapRegion = normalizeMapRegion(value.mapRegion);
    if (mapRegion !== undefined) {
      history.mapRegion = mapRegion;
    }
  }

  return isEmptyObject(history as Record<string, unknown>) ? undefined : history;
};

export const normalizeSyncedClientState = (
  value: SyncedClientState | Partial<SyncedClientState> | null | undefined
): SyncedClientState => {
  if (!value) return {};

  const onboarding = normalizeOnboardingState(value.onboarding);
  const home = normalizeHomeState(value.home);
  const history = normalizeHistoryState(value.history);

  return {
    ...(onboarding ? { onboarding } : {}),
    ...(home ? { home } : {}),
    ...(history ? { history } : {}),
  };
};

export const mergeSyncedClientState = (
  base: SyncedClientState | null | undefined,
  patch: SyncedClientState | Partial<SyncedClientState> | null | undefined
): SyncedClientState => {
  const normalizedBase = normalizeSyncedClientState(base);
  if (!patch) return normalizedBase;

  const next: SyncedClientState = {
    ...normalizedBase,
  };

  if (patch.onboarding) {
    next.onboarding = {
      ...(normalizedBase.onboarding || {}),
      ...normalizeSyncedClientState({ onboarding: patch.onboarding }).onboarding,
    };
  }

  if (patch.home) {
    next.home = {
      ...(normalizedBase.home || {}),
      ...normalizeSyncedClientState({ home: patch.home }).home,
    };
  }

  if (patch.history) {
    next.history = {
      ...(normalizedBase.history || {}),
      ...normalizeSyncedClientState({ history: patch.history }).history,
    };
  }

  return normalizeSyncedClientState(next);
};

export const parseRemoteClientState = (
  value: MeSettingsClientState | null | undefined
): SyncedClientState => {
  if (!value) return {};
  return normalizeSyncedClientState({
    onboarding: value.onboarding
      ? {
          completedAt:
            'completed_at' in value.onboarding ? value.onboarding.completed_at ?? null : undefined,
        }
      : undefined,
    home: value.home
      ? {
          selectedDate:
            'selected_date' in value.home ? value.home.selected_date ?? null : undefined,
        }
      : undefined,
    history: value.history
      ? {
          archiveMode:
            'archive_mode' in value.history ? value.history.archive_mode ?? undefined : undefined,
          filter: 'filter' in value.history ? value.history.filter ?? undefined : undefined,
          mapRegion:
            'map_region' in value.history
              ? value.history.map_region
                ? {
                    latitude: value.history.map_region.latitude,
                    longitude: value.history.map_region.longitude,
                    latitudeDelta: value.history.map_region.latitudeDelta,
                    longitudeDelta: value.history.map_region.longitudeDelta,
                  }
                : null
              : undefined,
        }
      : undefined,
  });
};

export const buildRemoteClientState = (
  value: SyncedClientState | null | undefined
): MeSettingsClientState | undefined => {
  const normalized = normalizeSyncedClientState(value);
  if (Object.keys(normalized).length === 0) {
    return undefined;
  }

  return {
    ...(normalized.onboarding
      ? {
          onboarding: {
            ...(Object.prototype.hasOwnProperty.call(normalized.onboarding, 'completedAt')
              ? { completed_at: normalized.onboarding.completedAt ?? null }
              : {}),
          },
        }
      : {}),
    ...(normalized.home
      ? {
          home: {
            ...(Object.prototype.hasOwnProperty.call(normalized.home, 'selectedDate')
              ? { selected_date: normalized.home.selectedDate ?? null }
              : {}),
          },
        }
      : {}),
    ...(normalized.history
      ? {
          history: {
            ...(normalized.history.archiveMode
              ? { archive_mode: normalized.history.archiveMode }
              : {}),
            ...(normalized.history.filter ? { filter: normalized.history.filter } : {}),
            ...(Object.prototype.hasOwnProperty.call(normalized.history, 'mapRegion')
              ? {
                  map_region: normalized.history.mapRegion
                    ? {
                        latitude: normalized.history.mapRegion.latitude,
                        longitude: normalized.history.mapRegion.longitude,
                        latitudeDelta: normalized.history.mapRegion.latitudeDelta,
                        longitudeDelta: normalized.history.mapRegion.longitudeDelta,
                      }
                    : null,
                }
              : {}),
          },
        }
      : {}),
  };
};

export const toLocalDateString = (value: Date): string => {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const fromLocalDateString = (value: string | null | undefined): Date | null => {
  const normalized = normalizeString(value);
  if (!normalized) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  return new Date(year, month - 1, day);
};

import type { UserProfile } from '@/models/User';
import type { AnalysisRecord } from '@/services/analysis/types_Structure';
import { buildDefaultProfile } from '@/services/user/profileFactory_Logic';
import type { AllergySeverity } from '@/features/profile/types/profile.types';
import type {
  MeAllergiesResponse,
  MeHistoryItemResponse,
  MeProfileResponse,
  MeSettingsResponse,
} from './phase2Sync.types_Structure';

type UserSnapshotInput = {
  profile?: MeProfileResponse;
  allergies?: MeAllergiesResponse;
  settings?: MeSettingsResponse;
};

const toStringOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeStringArray = (values: unknown): string[] => {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter((value) => value.length > 0);
};

const toSeverity = (value: unknown): AllergySeverity | null => {
  if (value === 'mild' || value === 'moderate' || value === 'severe') {
    return value;
  }
  return null;
};

const normalizeSeverityMap = (value: unknown): Record<string, AllergySeverity> => {
  if (!value || typeof value !== 'object') return {};
  const result: Record<string, AllergySeverity> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, rawValue]) => {
    const normalizedKey = key.trim();
    const severity = toSeverity(typeof rawValue === 'string' ? rawValue.trim() : rawValue);
    if (normalizedKey.length > 0 && severity) {
      result[normalizedKey] = severity;
    }
  });
  return result;
};

const parseTimestamp = (value: unknown): Date => {
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return new Date();
};

const normalizeLocation = (value: unknown): AnalysisRecord['location'] | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const payload = value as Record<string, unknown>;
  const latitude = typeof payload['latitude'] === 'number' ? payload['latitude'] : null;
  const longitude = typeof payload['longitude'] === 'number' ? payload['longitude'] : null;
  if (latitude === null || longitude === null) return undefined;
  return {
    latitude,
    longitude,
    country: toStringOrNull(payload['country']) ?? undefined,
    city: toStringOrNull(payload['city']) ?? undefined,
    district: toStringOrNull(payload['district']) ?? undefined,
    subregion: toStringOrNull(payload['subregion']) ?? undefined,
    formattedAddress: toStringOrNull(payload['formattedAddress']) ?? undefined,
    isoCountryCode: toStringOrNull(payload['isoCountryCode']) ?? undefined,
  };
};

export const mergeRemoteUserSnapshot = (
  userId: string,
  currentProfile: UserProfile | null,
  input: UserSnapshotInput
): UserProfile => {
  const fallback = currentProfile ?? buildDefaultProfile(userId);
  const next = { ...fallback };

  next.uid = userId;
  next.email = input.profile?.email || fallback.email;
  next.name = input.profile?.display_name ?? fallback.name;

  next.safetyProfile = {
    ...fallback.safetyProfile,
    allergies: input.allergies?.allergies ?? fallback.safetyProfile.allergies ?? [],
    dietaryRestrictions:
      input.allergies?.dietary_restrictions ?? fallback.safetyProfile.dietaryRestrictions ?? [],
    severityMap: {
      ...(fallback.safetyProfile.severityMap || {}),
      ...normalizeSeverityMap(input.allergies?.severity_map || {}),
    },
  };

  next.settings = {
    ...fallback.settings,
    language: input.settings?.language || fallback.settings.language || 'auto',
    targetLanguage:
      input.settings?.target_language === undefined
        ? fallback.settings.targetLanguage
        : input.settings.target_language || undefined,
    autoPlayAudio: input.settings?.auto_play_audio ?? fallback.settings.autoPlayAudio ?? false,
    selectedEmoji:
      input.settings?.selected_emoji === undefined
        ? fallback.settings.selectedEmoji
        : input.settings.selected_emoji || undefined,
  };

  next.createdAt = input.profile?.created_at || fallback.createdAt;
  next.updatedAt = input.profile?.updated_at || new Date().toISOString();
  return next;
};

export const buildProfileWritePayload = (profile: UserProfile): {
  profile: {
    display_name?: string | null;
    locale?: string | null;
    timezone?: string | null;
  };
  allergies: {
    allergies: string[];
    dietary_restrictions: string[];
    severity_map: Record<string, string>;
  };
  settings: {
    language?: string | null;
    target_language?: string | null;
    auto_play_audio: boolean;
    selected_emoji?: string | null;
  };
} => {
  const locale = profile.settings.language || 'auto';
  return {
    profile: {
      display_name: profile.name || null,
      locale: locale || null,
      timezone: 'UTC',
    },
    allergies: {
      allergies: profile.safetyProfile.allergies || [],
      dietary_restrictions: profile.safetyProfile.dietaryRestrictions || [],
      severity_map: (profile.safetyProfile.severityMap || {}) as Record<string, string>,
    },
    settings: {
      language: profile.settings.language || null,
      target_language: profile.settings.targetLanguage || null,
      auto_play_audio: !!profile.settings.autoPlayAudio,
      selected_emoji: profile.settings.selectedEmoji || null,
    },
  };
};

export const serializeHistoryRecord = (record: AnalysisRecord): Record<string, unknown> => ({
  ...record,
  timestamp: record.timestamp.toISOString(),
});

export const deserializeHistoryItem = (item: MeHistoryItemResponse): AnalysisRecord | null => {
  if (!item.entry || typeof item.entry !== 'object') return null;
  const entry = item.entry as Record<string, unknown>;

  const id = toStringOrNull(entry['id']) || item.id;
  const foodName = toStringOrNull(entry['foodName']);
  const safetyStatus = toStringOrNull(entry['safetyStatus']);
  const ingredientsRaw = entry['ingredients'];

  if (!foodName || !safetyStatus || !Array.isArray(ingredientsRaw)) {
    return null;
  }

  const ingredients = ingredientsRaw.filter((value) => typeof value === 'object' && value !== null) as AnalysisRecord['ingredients'];
  return {
    id,
    foodName,
    foodName_en: toStringOrNull(entry['foodName_en']) ?? undefined,
    foodName_ko: toStringOrNull(entry['foodName_ko']) ?? undefined,
    safetyStatus: safetyStatus as AnalysisRecord['safetyStatus'],
    confidence: typeof entry['confidence'] === 'number' ? entry['confidence'] : undefined,
    ingredients,
    nutrition: (entry['nutrition'] as AnalysisRecord['nutrition']) || undefined,
    translationCard: (entry['translationCard'] as AnalysisRecord['translationCard']) || undefined,
    raw_result: toStringOrNull(entry['raw_result']) ?? undefined,
    raw_result_en: toStringOrNull(entry['raw_result_en']) ?? undefined,
    raw_result_ko: toStringOrNull(entry['raw_result_ko']) ?? undefined,
    raw_data: (entry['raw_data'] as Record<string, unknown>) || undefined,
    used_model: toStringOrNull(entry['used_model']) ?? undefined,
    isBarcode: typeof entry['isBarcode'] === 'boolean' ? entry['isBarcode'] : undefined,
    imageUri: toStringOrNull(entry['imageUri']) ?? undefined,
    location: normalizeLocation(entry['location']),
    timestamp: parseTimestamp(entry['timestamp']),
  };
};

export const mergeRemoteHistory = (
  current: AnalysisRecord[],
  remoteItems: MeHistoryItemResponse[]
): AnalysisRecord[] => {
  const parsed = remoteItems
    .map((item) => deserializeHistoryItem(item))
    .filter((item): item is AnalysisRecord => item !== null);
  if (parsed.length === 0) return current;

  const byId = new Map<string, AnalysisRecord>();
  [...parsed, ...current].forEach((item) => {
    byId.set(item.id, item);
  });
  return [...byId.values()].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
};

export const normalizeLegacyProfileForUser = (userId: string, profile: UserProfile): UserProfile => {
  return {
    ...profile,
    uid: userId,
    safetyProfile: {
      allergies: normalizeStringArray(profile.safetyProfile.allergies),
      dietaryRestrictions: normalizeStringArray(profile.safetyProfile.dietaryRestrictions),
      severityMap: normalizeSeverityMap(profile.safetyProfile.severityMap || {}),
    },
    settings: {
      language: profile.settings?.language || 'auto',
      targetLanguage: profile.settings?.targetLanguage || undefined,
      autoPlayAudio: !!profile.settings?.autoPlayAudio,
      selectedEmoji: profile.settings?.selectedEmoji || undefined,
    },
    updatedAt: new Date().toISOString(),
  };
};

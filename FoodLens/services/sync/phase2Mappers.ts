import type { UserProfile } from '@/models/User';
import type { AnalysisRecord } from '@/services/analysis/types_Structure';
import {
  normalizeCanonicalLocale,
  normalizeLanguageSettings,
  resolveEffectiveLocale,
} from '@/features/i18n/services/languageService_Logic';
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

const normalizeLanguageValue = (value: string | null | undefined) => normalizeCanonicalLocale(value);

const normalizeTargetLanguageValue = (value: string | null | undefined) => {
  const normalized = normalizeCanonicalLocale(value);
  return normalized === 'auto' ? null : normalized;
};

const resolveDeviceTimezone = (): string => {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (typeof timeZone === 'string' && timeZone.trim().length > 0) {
      return timeZone;
    }
  } catch {
    // Keep UTC fallback when Intl timezone resolution is unavailable.
  }
  return 'UTC';
};

const toStringOrNull = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeProfileImageForSync = (value: string | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://')) return trimmed;
  return null;
};

const normalizeProfileImageForUpload = (value: string | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('http://') || lower.startsWith('https://')) return null;
  if (lower.startsWith('barcode://')) return null;
  return trimmed;
};

const normalizeGender = (value: unknown): UserProfile['gender'] | undefined => {
  if (value === 'male' || value === 'female') return value;
  return undefined;
};

const normalizeBirthYear = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const asInt = Math.trunc(value);
  if (asInt < 1900 || asInt > 2100) return undefined;
  return asInt;
};

const normalizeTripCoordinates = (
  value: unknown
): UserProfile['currentTripCoordinates'] | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const payload = value as Record<string, unknown>;
  const latitude = typeof payload['latitude'] === 'number' ? payload['latitude'] : null;
  const longitude = typeof payload['longitude'] === 'number' ? payload['longitude'] : null;
  if (latitude === null || longitude === null) return undefined;
  return { latitude, longitude };
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
  const mergedLanguageSettings = normalizeLanguageSettings({
    language: normalizeLanguageValue(input.settings?.language ?? fallback.settings.language),
    targetLanguage:
      input.settings?.target_language === undefined
        ? normalizeTargetLanguageValue(fallback.settings.targetLanguage)
        : normalizeTargetLanguageValue(input.settings.target_language),
  });

  next.uid = userId;
  next.email = input.profile?.email || fallback.email;
  next.name = input.profile?.display_name ?? fallback.name;
  next.profileImageAssetId = input.profile?.profile_image_asset_id ?? fallback.profileImageAssetId;
  next.profileImage =
    input.profile?.profile_image_render_url ??
    input.profile?.profile_image_url ??
    fallback.profileImage;
  next.photoURL = next.profileImage;
  next.gender = normalizeGender(input.profile?.gender) ?? fallback.gender;
  next.birthYear = normalizeBirthYear(input.profile?.birth_year) ?? fallback.birthYear;
  next.currentTripStart = input.profile?.current_trip_start ?? fallback.currentTripStart;
  next.currentTripLocation = input.profile?.current_trip_location ?? fallback.currentTripLocation;
  next.currentTripCoordinates =
    normalizeTripCoordinates(input.profile?.current_trip_coordinates) ?? fallback.currentTripCoordinates;

  next.safetyProfile = {
    ...fallback.safetyProfile,
    allergies: input.allergies?.allergies ?? fallback.safetyProfile.allergies ?? [],
    dietaryRestrictions:
      input.allergies?.dietary_restrictions ?? fallback.safetyProfile.dietaryRestrictions ?? [],
    dislikedIngredients:
      input.profile?.disliked_ingredients ?? fallback.safetyProfile.dislikedIngredients ?? [],
    severityMap: {
      ...(fallback.safetyProfile.severityMap || {}),
      ...normalizeSeverityMap(input.allergies?.severity_map || {}),
    },
  };

  next.settings = {
    ...fallback.settings,
    language: mergedLanguageSettings.language,
    targetLanguage: mergedLanguageSettings.targetLanguage || undefined,
    autoPlayAudio: input.settings?.auto_play_audio ?? fallback.settings.autoPlayAudio ?? false,
    selectedEmoji:
      input.settings?.selected_emoji === undefined
        ? fallback.settings.selectedEmoji
        : input.settings.selected_emoji || undefined,
  };

  next.createdAt = input.profile?.created_at || fallback.createdAt;
  next.updatedAt = input.profile?.updated_at || new Date().toISOString();
  next.syncVersions = {
    ...(fallback.syncVersions || {}),
    ...(input.profile?.updated_at ? { profileUpdatedAt: input.profile.updated_at } : {}),
    ...(input.allergies?.updated_at ? { allergiesUpdatedAt: input.allergies.updated_at } : {}),
    ...(input.settings?.updated_at ? { settingsUpdatedAt: input.settings.updated_at } : {}),
  };
  return next;
};

export const buildProfileWritePayload = (profile: UserProfile): {
  profile: {
    display_name?: string | null;
    profile_image_url?: string | null;
    profile_image_asset_id?: string | null;
    profile_image_local_uri?: string | null;
    gender?: string | null;
    birth_year?: number | null;
    disliked_ingredients?: string[];
    locale?: string | null;
    timezone?: string | null;
    current_trip_start?: string | null;
    current_trip_location?: string | null;
    current_trip_coordinates?:
      | {
          latitude: number;
          longitude: number;
        }
      | null;
    expected_updated_at?: string;
  };
  allergies: {
    allergies: string[];
    dietary_restrictions: string[];
    severity_map: Record<string, string>;
    expected_updated_at?: string;
  };
  settings: {
    language?: string | null;
    target_language?: string | null;
    auto_play_audio: boolean;
    selected_emoji?: string | null;
    expected_updated_at?: string;
  };
} => {
  const normalizedLanguageSettings = normalizeLanguageSettings({
    language: normalizeLanguageValue(profile.settings.language),
    targetLanguage: normalizeTargetLanguageValue(profile.settings.targetLanguage),
  });
  const resolvedLocale = resolveEffectiveLocale(normalizedLanguageSettings);
  const shouldSyncResolvedProfileLocale = normalizedLanguageSettings.language !== 'auto';
  const resolvedTimezone = resolveDeviceTimezone();
  return {
    profile: {
      display_name: profile.name || null,
      profile_image_url: profile.profileImageAssetId
        ? null
        : normalizeProfileImageForSync(profile.profileImage),
      profile_image_asset_id: profile.profileImageAssetId || null,
      profile_image_local_uri: profile.profileImageAssetId
        ? null
        : normalizeProfileImageForUpload(profile.profileImage),
      gender: profile.gender || null,
      birth_year: profile.birthYear ?? null,
      disliked_ingredients: profile.safetyProfile.dislikedIngredients || [],
      locale: shouldSyncResolvedProfileLocale ? resolvedLocale : null,
      timezone: shouldSyncResolvedProfileLocale ? resolvedTimezone : null,
      current_trip_start: profile.currentTripStart || null,
      current_trip_location: profile.currentTripLocation || null,
      current_trip_coordinates: profile.currentTripCoordinates || null,
      expected_updated_at: profile.syncVersions?.profileUpdatedAt,
    },
    allergies: {
      allergies: profile.safetyProfile.allergies || [],
      dietary_restrictions: profile.safetyProfile.dietaryRestrictions || [],
      severity_map: (profile.safetyProfile.severityMap || {}) as Record<string, string>,
      expected_updated_at: profile.syncVersions?.allergiesUpdatedAt,
    },
    settings: {
      language: normalizedLanguageSettings.language || null,
      target_language: normalizedLanguageSettings.targetLanguage || null,
      auto_play_audio: !!profile.settings.autoPlayAudio,
      selected_emoji: profile.settings.selectedEmoji || null,
      expected_updated_at: profile.syncVersions?.settingsUpdatedAt,
    },
  };
};

export const serializeHistoryRecord = (record: AnalysisRecord): Record<string, unknown> => {
  const payload: Record<string, unknown> = {
    ...record,
    timestamp: record.timestamp.toISOString(),
  };
  if (record.imageAssetId) {
    payload['image_asset_id'] = record.imageAssetId;
  }
  if (record.imageRenderUrl) {
    payload['image_render_url'] = record.imageRenderUrl;
  }
  return payload;
};

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
    imageUri:
      toStringOrNull(entry['image_render_url']) ??
      toStringOrNull(entry['imageUri']) ??
      undefined,
    imageAssetId: toStringOrNull(entry['image_asset_id']) ?? undefined,
    imageRenderUrl: toStringOrNull(entry['image_render_url']) ?? undefined,
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
  [...current, ...parsed].forEach((item) => {
    byId.set(item.id, item);
  });
  return [...byId.values()].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
};

export const normalizeLegacyProfileForUser = (userId: string, profile: UserProfile): UserProfile => {
  const normalizedLegacyLanguageSettings = normalizeLanguageSettings({
    language: normalizeLanguageValue(profile.settings?.language ?? 'auto'),
    targetLanguage: normalizeTargetLanguageValue(profile.settings?.targetLanguage),
  });

  return {
    ...profile,
    uid: userId,
    safetyProfile: {
      allergies: normalizeStringArray(profile.safetyProfile.allergies),
      dietaryRestrictions: normalizeStringArray(profile.safetyProfile.dietaryRestrictions),
      severityMap: normalizeSeverityMap(profile.safetyProfile.severityMap || {}),
    },
    settings: {
      language: normalizedLegacyLanguageSettings.language,
      targetLanguage: normalizedLegacyLanguageSettings.targetLanguage || undefined,
      autoPlayAudio: !!profile.settings?.autoPlayAudio,
      selectedEmoji: profile.settings?.selectedEmoji || undefined,
    },
    updatedAt: new Date().toISOString(),
  };
};

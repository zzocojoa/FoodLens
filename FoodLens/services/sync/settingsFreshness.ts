import type { UserProfile } from '@/models/User';
import type { MeSettingsResponse } from './phase2Sync.types';

const toTimestampMs = (value?: string | null): number | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

export const isRemoteSettingsSnapshotStale = ({
  localProfile,
  remoteSettings,
}: {
  localProfile: Pick<UserProfile, 'syncVersions'> | null | undefined;
  remoteSettings: Pick<MeSettingsResponse, 'updated_at'> | null | undefined;
}): boolean => {
  const localUpdatedAt = toTimestampMs(localProfile?.syncVersions?.settingsUpdatedAt);
  if (localUpdatedAt === null) {
    return false;
  }

  const remoteUpdatedAt = toTimestampMs(remoteSettings?.updated_at);
  if (remoteUpdatedAt === null) {
    return true;
  }

  return remoteUpdatedAt < localUpdatedAt;
};

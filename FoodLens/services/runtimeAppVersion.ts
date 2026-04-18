import Constants from 'expo-constants';

const UNKNOWN_APP_VERSION = 'unknown';

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export const getRuntimeAppVersion = (): string => {
  if (isNonEmptyString(Constants.expoConfig?.version)) {
    return Constants.expoConfig.version;
  }
  if (isNonEmptyString(Constants['nativeApplicationVersion'])) {
    return Constants['nativeApplicationVersion'];
  }
  return UNKNOWN_APP_VERSION;
};

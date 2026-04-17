import { Linking } from 'react-native';

export const MAILTO_UNAVAILABLE_ERROR_CODE = 'MAILTO_UNAVAILABLE';

export const isMailtoUnavailableError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  return error.message === MAILTO_UNAVAILABLE_ERROR_CODE;
};

export const ensureMailAppAvailable = async (): Promise<void> => {
  const canOpenMailto = await Linking.canOpenURL('mailto:');

  if (!canOpenMailto) {
    throw new Error(MAILTO_UNAVAILABLE_ERROR_CODE);
  }
};

export const openMailtoUrl = async (mailtoUrl: string): Promise<void> => {
  await ensureMailAppAvailable();
  await Linking.openURL(mailtoUrl);
};

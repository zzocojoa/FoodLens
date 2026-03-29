import { Linking } from 'react-native';

export const ensureMailAppAvailable = async (): Promise<void> => {
  const canOpenMailto = await Linking.canOpenURL('mailto:');

  if (!canOpenMailto) {
    throw new Error('MAILTO_UNAVAILABLE');
  }
};

export const openMailtoUrl = async (mailtoUrl: string): Promise<void> => {
  await ensureMailAppAvailable();
  await Linking.openURL(mailtoUrl);
};

import { Linking } from 'react-native';
import { ensureMailAppAvailable, openMailtoUrl } from '../supportMail';

describe('supportMail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws when a mail app is unavailable', async () => {
    const canOpenURLSpy = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(false);

    await expect(ensureMailAppAvailable()).rejects.toThrow('MAILTO_UNAVAILABLE');
    expect(canOpenURLSpy).toHaveBeenCalledWith('mailto:');

    canOpenURLSpy.mockRestore();
  });

  it('opens the given mailto URL when a mail app is available', async () => {
    const canOpenURLSpy = jest.spyOn(Linking, 'canOpenURL').mockResolvedValue(true);
    const openURLSpy = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);

    await openMailtoUrl('mailto:support@foodlens.com?subject=test');

    expect(canOpenURLSpy).toHaveBeenCalledWith('mailto:');
    expect(openURLSpy).toHaveBeenCalledWith('mailto:support@foodlens.com?subject=test');

    canOpenURLSpy.mockRestore();
    openURLSpy.mockRestore();
  });
});

import { shouldUseLoginNativeDriver } from '../useLoginMotion';

describe('useLoginMotion regression', () => {
  it('disables the native driver on web', () => {
    expect(shouldUseLoginNativeDriver('web')).toBe(false);
  });

  it('keeps the native driver on native platforms', () => {
    expect(shouldUseLoginNativeDriver('ios')).toBe(true);
    expect(shouldUseLoginNativeDriver('android')).toBe(true);
  });
});

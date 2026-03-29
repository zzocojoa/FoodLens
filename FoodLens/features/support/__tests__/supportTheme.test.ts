import { Colors } from '@/constants/theme';
import { getSupportAccentTextColor } from '../supportTheme';

describe('getSupportAccentTextColor', () => {
  it('returns white text for light mode accent buttons', () => {
    expect(
      getSupportAccentTextColor({
        colorScheme: 'light',
        theme: Colors.light,
      }),
    ).toBe('#FFFFFF');
  });

  it('returns dark text for dark mode accent buttons', () => {
    expect(
      getSupportAccentTextColor({
        colorScheme: 'dark',
        theme: Colors.dark,
      }),
    ).toBe(Colors.dark.background);
  });
});

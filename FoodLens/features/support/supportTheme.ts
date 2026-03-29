import { type ColorSchemeName, type ThemePalette } from '@/constants/theme';

type SupportAccentTextColorParams = {
  colorScheme: ColorSchemeName;
  theme: ThemePalette;
};

export const getSupportAccentTextColor = ({
  colorScheme,
  theme,
}: SupportAccentTextColorParams): string =>
  colorScheme === 'dark' ? theme.background : '#FFFFFF';

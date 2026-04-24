import { useResolvedColorScheme } from '../contexts/ThemeContext';

export function useColorScheme(): 'light' | 'dark' {
  return useResolvedColorScheme();
}

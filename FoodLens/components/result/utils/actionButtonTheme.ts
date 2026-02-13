export const getActionButtonTheme = (colorScheme: 'light' | 'dark') => {
  const isDark = colorScheme === 'dark';
  return {
    backgroundColor: isDark ? 'white' : '#0F172A',
    foregroundColor: isDark ? 'black' : 'white',
  };
};

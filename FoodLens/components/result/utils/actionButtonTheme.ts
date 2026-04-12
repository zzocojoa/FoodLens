export const getActionButtonTheme = (colorScheme: 'light' | 'dark') => {
  const isDark = colorScheme === 'dark';
  return {
    backgroundColor: isDark ? 'rgba(15, 23, 42, 0.88)' : 'rgba(255, 255, 255, 0.92)',
    foregroundColor: isDark ? '#F8FAFC' : '#334155',
  };
};

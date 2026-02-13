import { useCallback, useState } from 'react';

export function useBreakdownState() {
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);

  const openBreakdown = useCallback(() => setIsBreakdownOpen(true), []);
  const closeBreakdown = useCallback(() => setIsBreakdownOpen(false), []);

  return {
    isBreakdownOpen,
    setIsBreakdownOpen,
    openBreakdown,
    closeBreakdown,
  };
}

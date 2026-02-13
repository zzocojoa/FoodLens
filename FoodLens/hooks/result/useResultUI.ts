import { useCallback, useState } from 'react';
import { useResultScrollAnimations } from './resultUiUtils';

export function useResultUI() {
  const { scrollY, scrollHandler, imageAnimatedStyle, headerOverlayStyle } = useResultScrollAnimations();
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);
  const openBreakdown = useCallback(() => setIsBreakdownOpen(true), []);
  const closeBreakdown = useCallback(() => setIsBreakdownOpen(false), []);

  return {
    scrollY,
    scrollHandler,
    imageAnimatedStyle,
    headerOverlayStyle,
    isBreakdownOpen,
    setIsBreakdownOpen,
    openBreakdown,
    closeBreakdown,
  };
}

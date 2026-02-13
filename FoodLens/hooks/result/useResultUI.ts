import { useState } from 'react';
import { useResultScrollAnimations } from './resultUiUtils';

export function useResultUI() {
  const { scrollY, scrollHandler, imageAnimatedStyle, headerOverlayStyle } = useResultScrollAnimations();
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);

  return {
    scrollY,
    scrollHandler,
    imageAnimatedStyle,
    headerOverlayStyle,
    isBreakdownOpen,
    setIsBreakdownOpen
  };
}

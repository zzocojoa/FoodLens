import { useRouter, Href } from 'expo-router';
import { useCallback } from 'react';

/**
 * Custom hook for project-wide typesafe navigation.
 * Wraps expo-router's router to provide a consistent interface.
 */
export const useAppNavigation = () => {
  const router = useRouter();

  const navigate = useCallback((href: Href<any>) => {
    router.push(href);
  }, [router]);

  const replace = useCallback((href: Href<any>) => {
    router.replace(href);
  }, [router]);

  const back = useCallback(() => {
    router.back();
  }, [router]);

  return {
    navigate,
    replace,
    back,
    // Expose original router for edge cases
    rawRouter: router,
  };
};

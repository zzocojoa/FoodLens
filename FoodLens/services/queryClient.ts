import { QueryClient } from '@tanstack/react-query';

/**
 * Global TanStack Query Client
 * Configured with optimized defaults for a mobile environment.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Mobile data optimization: 5 minutes stale time
      staleTime: 1000 * 60 * 5,
      // Cached data persists for 10 minutes
      gcTime: 1000 * 60 * 10,
      // Retry failed requests twice before giving up
      retry: 2,
      // Refetch when the app comes back from background
      refetchOnWindowFocus: true,
      // Refetch when the network reconnects
      refetchOnReconnect: true,
    },
    mutations: {
      // Mutations usually shouldn't be retried automatically
      retry: false,
    },
  },
});

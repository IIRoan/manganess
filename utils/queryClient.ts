import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
    },
  },
});

export type AppQueryClient = typeof queryClient;

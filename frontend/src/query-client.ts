// One QueryClient for the whole app; the provider in app/_layout.tsx uses
// this instance. Data is fetched once and only refetched when explicitly
// invalidated (e.g. the admin Refresh button) to keep Firestore reads minimal.
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

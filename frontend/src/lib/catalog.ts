// Catalog hooks. Users read meta/catalog ONCE per app launch (after a short
// delay so it doesn't compete with startup); admin reads it once and then only
// when the Refresh button is pressed. Admin edits update the cache locally.
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { Catalog, getCatalog, saveCatalogField } from "./firestore";

const EMPTY: Catalog = { banners: [], tasks: [], config: null };
const LAUNCH_DELAY = 1000;

export function useCatalog() {
  return useQuery({
    queryKey: ["catalog"],
    queryFn: async () => {
      await new Promise((r) => setTimeout(r, LAUNCH_DELAY));
      return getCatalog();
    },
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

export function useAdminCatalog() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin", "catalog"],
    queryFn: () => getCatalog(true),
  });

  // Writes one field and mirrors it into the cached admin + user catalogs.
  const save = async <K extends keyof Catalog>(key: K, value: Catalog[K]) => {
    await saveCatalogField(key, value);
    const apply = (old?: Catalog) => ({ ...(old ?? EMPTY), [key]: value });
    qc.setQueryData<Catalog>(["admin", "catalog"], apply);
    if (qc.getQueryData(["catalog"])) qc.setQueryData<Catalog>(["catalog"], apply);
  };

  return { catalog: q.data ?? EMPTY, loading: q.isLoading, save };
}

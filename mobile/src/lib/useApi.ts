import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "./api";

interface State<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  refreshing: boolean;
}

// In-memory cache of the last successful response per path. It makes screens
// re-open instantly (stale-while-revalidate): the cached data paints right away
// and a fresh copy replaces it in the background.
const cache = new Map<string, unknown>();

export function invalidateApiCache(prefix?: string): void {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}

function initial<T>(path: string | null): State<T> {
  const cached = path ? cache.get(path) : undefined;
  return {
    data: (cached as T) ?? null,
    error: null,
    loading: path !== null && cached === undefined,
    refreshing: false,
  };
}

export function useApi<T>(path: string | null) {
  const [state, setState] = useState<State<T>>(() => initial<T>(path));
  const [flag, setFlag] = useState(0);

  const pathRef = useRef(path);
  const lastPath = useRef(path);

  const reload = useCallback(() => setFlag((n) => n + 1), []);
  const setData = useCallback((data: T | null) => {
    if (pathRef.current) cache.set(pathRef.current, data);
    setState((s) => ({ ...s, data }));
  }, []);

  useEffect(() => {
    pathRef.current = path;
    if (!path) return;
    let alive = true;

    // If the path changed (e.g. a detail screen), start from that path's cache.
    const changed = lastPath.current !== path;
    lastPath.current = path;

    const run = async () => {
      if (changed) {
        setState(initial<T>(path));
      } else {
        // Keep any existing data on screen while refreshing — only show the full
        // loading state when there is nothing to display yet.
        setState((s) =>
          s.data === null
            ? { ...s, loading: true, refreshing: false, error: null }
            : { ...s, refreshing: true, error: null }
        );
      }

      try {
        const res = await api<T>(path);
        if (!alive) return;
        cache.set(path, res);
        setState({ data: res, error: null, loading: false, refreshing: false });
      } catch (e) {
        if (!alive) return;
        setState((s) => ({
          ...s,
          error: e instanceof ApiError ? e.message : "Something went wrong",
          loading: false,
          refreshing: false,
        }));
      }
    };

    run();
    return () => {
      alive = false;
    };
  }, [path, flag]);

  return {
    data: state.data,
    error: state.error,
    loading: state.loading,
    refreshing: state.refreshing,
    reload,
    setData,
  };
}

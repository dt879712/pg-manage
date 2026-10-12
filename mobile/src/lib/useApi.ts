import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "./api";

interface State<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export function useApi<T>(path: string | null) {
  const [state, setState] = useState<State<T>>({
    data: null,
    error: null,
    loading: path !== null,
  });
  const [flag, setFlag] = useState(0);

  const reload = useCallback(() => setFlag((n) => n + 1), []);
  const setData = useCallback(
    (data: T | null) => setState((s) => ({ ...s, data })),
    []
  );

  useEffect(() => {
    if (!path) return;
    let alive = true;

    const run = async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const res = await api<T>(path);
        if (alive) setState({ data: res, error: null, loading: false });
      } catch (e) {
        if (alive) {
          setState({
            data: null,
            error: e instanceof ApiError ? e.message : "Something went wrong",
            loading: false,
          });
        }
      }
    };

    run();
    return () => {
      alive = false;
    };
  }, [path, flag]);

  return { data: state.data, error: state.error, loading: state.loading, reload, setData };
}

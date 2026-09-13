import { useEffect, useState } from "react";
import { ApiError, request } from "../api";

interface Result<T> {
  key: string;
  data: T | null;
  error: ApiError | null;
}

export function useApi<T>(url: string | null, refresh = 0) {
  const key = `${url}:${refresh}`;
  const [result, setResult] = useState<Result<T> | null>(null);

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    let active = true;
    const requestKey = `${url}:${refresh}`;
    request<T>(url, { signal: controller.signal }).then(
      (data) => {
        if (active) setResult({ key: requestKey, data, error: null });
      },
      (error) => {
        if (active && !controller.signal.aborted) {
          setResult({
            key: requestKey,
            data: null,
            error:
              error instanceof ApiError
                ? error
                : new ApiError(
                    0,
                    "Unable to reach the server. Check the connection and retry.",
                  ),
          });
        }
      },
    );
    return () => {
      active = false;
      controller.abort();
    };
  }, [url, refresh]);

  // A changed filter never renders the preceding request's data as its own result.
  const current = result?.key === key ? result : null;
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: Boolean(url && !current),
  };
}

"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * localStorage-backed state. `loaded` is false until the stored value has been read (avoids hydration mismatch).
 * Stored data from an older version of the app is made safe: objects are merged over `initial` so new fields
 * keep their defaults, and a value of a different shape (array vs object, primitive vs object) is ignored.
 */
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) {
        const stored: unknown = JSON.parse(raw);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setValue(reconcile(initial, stored));
      }
    } catch {
      /* fall back to initial */
    }
    setLoaded(true);
    // `initial` is only the first-load default; re-reading on identity changes would discard edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (next: T | ((previous: T) => T)) => {
      setValue((previous) => {
        const resolved = typeof next === "function" ? (next as (previous: T) => T)(previous) : next;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          /* ignore */
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, update, loaded] as const;
}

function reconcile<T>(initial: T, stored: unknown): T {
  if (Array.isArray(initial)) return (Array.isArray(stored) ? stored : initial) as T;
  if (initial !== null && typeof initial === "object") {
    if (stored === null || typeof stored !== "object" || Array.isArray(stored)) return initial;
    const merged: Record<string, unknown> = { ...(initial as Record<string, unknown>) };
    for (const [field, fallback] of Object.entries(initial)) {
      const candidate = (stored as Record<string, unknown>)[field];
      if (candidate !== undefined && typeof candidate === typeof fallback) merged[field] = candidate;
    }
    return merged as T;
  }
  return (typeof stored === typeof initial ? stored : initial) as T;
}

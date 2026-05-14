import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "./useCurrentUser";
import { api } from "@/lib/queryClient";

export type BoardTheme = "green" | "wood" | "brown" | "blue" | "gray";

const VALID: BoardTheme[] = ["green", "wood", "brown", "blue", "gray"];
const STORAGE_KEY = "cfp:boardTheme";

function readLocal(): BoardTheme | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v && (VALID as string[]).includes(v) ? (v as BoardTheme) : null;
  } catch {
    return null;
  }
}

function writeLocal(t: BoardTheme): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, t);
  } catch {
    /* localStorage unavailable */
  }
}

/**
 * Returns the user's preferred board theme (resolved from
 * `users.preferences.boardTheme`, falling back to localStorage, then
 * "green") and a setter that persists it both server-side and locally.
 */
export function useBoardTheme(): {
  theme: BoardTheme;
  setTheme: (t: BoardTheme) => void;
  isReady: boolean;
} {
  const qc = useQueryClient();
  const { user } = useCurrentUser();
  const serverTheme = (user?.preferences as { boardTheme?: BoardTheme } | undefined)
    ?.boardTheme;
  const [local, setLocal] = React.useState<BoardTheme>(
    () => readLocal() ?? "green",
  );

  const theme: BoardTheme = serverTheme ?? local;

  const setTheme = React.useCallback(
    (t: BoardTheme) => {
      setLocal(t);
      writeLocal(t);
      // Optimistically update the cached me payload so all consumers
      // re-render immediately, then persist server-side.
      qc.setQueryData(["auth", "me"], (prev: unknown) => {
        if (!prev || typeof prev !== "object") return prev;
        const cur = prev as Record<string, unknown>;
        return {
          ...cur,
          preferences: {
            ...((cur.preferences as Record<string, unknown> | undefined) ?? {}),
            boardTheme: t,
          },
        };
      });
      void api("/api/auth/preferences", {
        method: "POST",
        body: JSON.stringify({ boardTheme: t }),
      }).catch(() => {
        /* offline / not signed in — local copy still applies */
      });
    },
    [qc],
  );

  return { theme, setTheme, isReady: !!user || !!local };
}

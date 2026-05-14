/**
 * /watch/render — headless renderer surface.
 *
 * This page is loaded by the server-side Puppeteer worker (NOT a user
 * browser, normally). Layout is deterministic and chrome-free:
 *   - exact 1080p frame
 *   - no sidebar, no header
 *   - `AnimatedBoardPlayer` with `expose` so the worker can drive
 *     `window.__watchPlayer.seek(t)` and screenshot frame-by-frame.
 *
 * The timeline + render options are fetched via a one-shot token
 * minted by the server when the render job is queued.
 */
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/queryClient";
import {
  AnimatedBoardPlayer,
  type WatchTimeline,
} from "@/components/watch/AnimatedBoardPlayer";

interface RenderPayload {
  timeline: WatchTimeline;
  options: {
    width?: number;
    height?: number;
    theme?: "green" | "wood";
    boardSize?: number;
  };
}

export default function WatchRender() {
  const token = React.useMemo(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("token") ?? "";
  }, []);

  const payload = useQuery({
    queryKey: ["render-payload", token],
    queryFn: () =>
      api<RenderPayload>(
        `/api/watch/studio/render/by-token/${encodeURIComponent(token)}`,
      ),
    enabled: !!token,
    retry: false,
  });

  if (!token) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-950 text-zinc-100">
        Missing render token.
      </div>
    );
  }
  if (payload.isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-950 text-zinc-100">
        Loading timeline…
      </div>
    );
  }
  if (payload.error || !payload.data) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-950 text-rose-300">
        {(payload.error as Error)?.message ?? "Render token expired or invalid."}
      </div>
    );
  }

  const { timeline, options } = payload.data;
  const width = options.width ?? 1920;
  const height = options.height ?? 1080;
  // 16:9 frame; board fills the right ~60% so caption + eval bar sit
  // comfortably on the left.
  const boardSize = options.boardSize ?? Math.min(720, height - 240);

  return (
    <div
      className="bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 text-zinc-100"
      style={{
        width,
        height,
        overflow: "hidden",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <div className="h-full w-full flex items-center justify-center">
        <div
          style={{
            width: width - 80,
            height: height - 80,
          }}
          className="flex items-center justify-center"
        >
          <AnimatedBoardPlayer
            timeline={timeline}
            theme={options.theme ?? "green"}
            boardSize={boardSize}
            hideControls
            expose
            muted
            autoPlay={false}
          />
        </div>
      </div>
    </div>
  );
}

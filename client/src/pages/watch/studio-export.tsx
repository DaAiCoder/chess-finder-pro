/**
 * /watch/export — MP4 export workshop (moved from /watch/studio).
 *
 * Pick a library game, optionally tweak voice / theme / fps, and queue
 * a render. The headless Chromium renderer drives an off-screen
 * `AnimatedBoardPlayer` to produce a 1080p MP4. Progress is streamed
 * over SSE; when the job is done, the user gets a Download button.
 */
import * as React from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/queryClient";
import { Clapperboard, Download, Play, RefreshCw, AlertTriangle } from "lucide-react";
import {
  AnimatedBoardPlayer,
  type WatchTimeline,
} from "@/components/watch/AnimatedBoardPlayer";

interface RenderJob {
  id: string;
  gameId: number;
  state: "queued" | "running" | "done" | "error";
  progress: number;
  message?: string;
  outputPath?: string;
  bytes?: number;
  durationS?: number;
  createdAt: number;
  finishedAt?: number;
  timeline?: WatchTimeline;
}

interface DepStatus {
  puppeteer: boolean;
  ffmpeg: boolean;
  puppeteerError?: string;
  ffmpegError?: string;
}

export default function WatchStudioExport() {
  const [location] = useLocation();
  const qc = useQueryClient();

  // Pull the optional ?gameId= from the URL.
  const presetGameId = React.useMemo(() => {
    if (typeof window === "undefined") return undefined;
    const params = new URLSearchParams(window.location.search);
    const v = params.get("gameId");
    return v ? Number(v) : undefined;
  }, [location]);

  const [gameId, setGameId] = React.useState<number | undefined>(presetGameId);
  const [fps, setFps] = React.useState(30);
  const [theme, setTheme] = React.useState<"green" | "wood">("green");
  const [muted, setMuted] = React.useState(false);
  const [provider, setProvider] = React.useState<"auto" | "piper" | "openai" | "elevenlabs" | "silent">("auto");
  const [voice, setVoice] = React.useState("");
  const [llmPolish, setLlmPolish] = React.useState(false);

  const deps = useQuery({
    queryKey: ["watch-deps"],
    queryFn: () => api<DepStatus>("/api/watch/studio/deps"),
  });
  const jobs = useQuery({
    queryKey: ["render-jobs"],
    queryFn: () => api<{ jobs: RenderJob[] }>("/api/watch/studio/render"),
    refetchInterval: 5_000,
  });
  const preview = useQuery({
    queryKey: ["watch-timeline", gameId],
    queryFn: () =>
      api<{ timeline: WatchTimeline & { meta: { libraryGameId: number } } }>(
        `/api/watch/games/${gameId}/timeline`,
      ),
    enabled: Number.isFinite(gameId),
  });

  const enqueue = useMutation({
    mutationFn: () =>
      api<{ job: RenderJob }>("/api/watch/studio/render", {
        method: "POST",
        body: JSON.stringify({
          gameId,
          fps,
          theme,
          mute: muted,
          llmPolish,
          voice:
            provider === "auto"
              ? undefined
              : { provider, voice: voice.trim() || undefined },
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["render-jobs"] });
    },
  });

  return (
    <div className="p-4 md:p-6 space-y-6">
      <header>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Clapperboard className="w-6 h-6 text-emerald-500" /> MP4 export
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Render a library game into a 1080p MP4 you can upload to YouTube.
        </p>
      </header>

      {deps.data && (!deps.data.puppeteer || !deps.data.ffmpeg) && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 text-sm font-semibold">
              <AlertTriangle className="h-4 w-4" /> Export studio missing dependencies
            </div>
            <ul className="text-xs space-y-1 text-muted-foreground list-disc pl-5">
              {!deps.data.puppeteer && (
                <li>
                  <strong>puppeteer</strong> is not installed. Run:{" "}
                  <code className="font-mono">npm i puppeteer fluent-ffmpeg</code>
                </li>
              )}
              {!deps.data.ffmpeg && (
                <li>
                  <strong>ffmpeg</strong> binary not on PATH. Install from{" "}
                  <a
                    href="https://ffmpeg.org/download.html"
                    className="underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    ffmpeg.org
                  </a>{" "}
                  and ensure it's runnable from the shell.
                </li>
              )}
            </ul>
            <p className="text-xs text-muted-foreground">
              The in-app Watch player still works without these — only MP4 export
              is gated.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6">
        <Card>
          <CardContent className="p-4 space-y-4">
            <div>
              <Label className="text-xs">Library game id</Label>
              <Input
                type="number"
                placeholder="e.g. 42"
                value={gameId ?? ""}
                onChange={(e) =>
                  setGameId(e.target.value ? Number(e.target.value) : undefined)
                }
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Find ids in <Link href="/library" className="underline">Game Library</Link>{" "}
                or click "Export to MP4" on any Watch page.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">FPS</Label>
                <Input
                  type="number"
                  min={15}
                  max={60}
                  value={fps}
                  onChange={(e) => setFps(Number(e.target.value))}
                />
              </div>
              <div>
                <Label className="text-xs">Theme</Label>
                <select
                  className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                  value={theme}
                  onChange={(e) => setTheme(e.target.value as "green" | "wood")}
                >
                  <option value="green">Green (chess.com)</option>
                  <option value="wood">Wood</option>
                </select>
              </div>
            </div>

            <div>
              <Label className="text-xs">TTS provider</Label>
              <select
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
                value={provider}
                onChange={(e) =>
                  setProvider(e.target.value as typeof provider)
                }
              >
                <option value="auto">Auto-detect (recommended)</option>
                <option value="piper">Piper (offline, free)</option>
                <option value="openai">OpenAI TTS (paid, premium)</option>
                <option value="elevenlabs">ElevenLabs (paid, premium)</option>
                <option value="silent">Silent (no audio)</option>
              </select>
            </div>

            <div>
              <Label className="text-xs">Voice id (optional)</Label>
              <Input
                placeholder="alloy, en_US-amy-medium.onnx, ..."
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2 text-sm">
              <input
                id="muted"
                type="checkbox"
                checked={muted}
                onChange={(e) => setMuted(e.target.checked)}
              />
              <label htmlFor="muted" className="cursor-pointer">
                Mute (skip narration synth)
              </label>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <input
                id="llm"
                type="checkbox"
                checked={llmPolish}
                onChange={(e) => setLlmPolish(e.target.checked)}
              />
              <label htmlFor="llm" className="cursor-pointer">
                LLM-polish narration (needs NARRATION_PROVIDER=openai)
              </label>
            </div>

            <Button
              className="w-full"
              onClick={() => enqueue.mutate()}
              disabled={!Number.isFinite(gameId) || enqueue.isPending}
            >
              <Play className="h-4 w-4 mr-2" />
              {enqueue.isPending ? "Queuing render…" : "Render MP4"}
            </Button>

            {enqueue.error && (
              <div className="text-xs text-destructive">
                {(enqueue.error as Error).message}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-sm font-semibold mb-2">Preview</div>
            {!gameId ? (
              <div className="text-sm text-muted-foreground italic">
                Enter a library game id to preview the timeline.
              </div>
            ) : preview.isLoading ? (
              <div className="text-sm text-muted-foreground">Building timeline…</div>
            ) : preview.error || !preview.data ? (
              <div className="text-sm text-destructive">
                {(preview.error as Error)?.message ?? "Could not load timeline."}
              </div>
            ) : (
              <AnimatedBoardPlayer timeline={preview.data.timeline} />
            )}
          </CardContent>
        </Card>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Render queue</h2>
          <Button
            size="sm"
            variant="outline"
            onClick={() => qc.invalidateQueries({ queryKey: ["render-jobs"] })}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {(jobs.data?.jobs ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground italic">
              No renders yet. Queue one above.
            </div>
          ) : (
            (jobs.data?.jobs ?? []).map((j) => <JobRow key={j.id} job={j} />)
          )}
        </div>
      </section>
    </div>
  );
}

function JobRow({ job }: { job: RenderJob }) {
  const [live, setLive] = React.useState<RenderJob>(job);
  React.useEffect(() => {
    if (live.state === "done" || live.state === "error") return;
    const es = new EventSource(`/api/watch/studio/render/${job.id}/stream`);
    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data) as RenderJob;
        setLive(data);
        if (data.state === "done" || data.state === "error") es.close();
      } catch {
        /* ignore */
      }
    };
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id]);

  const stateColor =
    live.state === "done"
      ? "bg-emerald-600"
      : live.state === "error"
        ? "bg-rose-600"
        : live.state === "running"
          ? "bg-sky-600"
          : "bg-zinc-600";

  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center justify-between">
          <div className="text-xs font-mono text-muted-foreground">{live.id}</div>
          <Badge className={`text-[10px] ${stateColor}`}>{live.state}</Badge>
        </div>
        <div className="text-sm font-semibold">
          Game #{live.gameId}
          {live.durationS != null && (
            <span className="text-muted-foreground font-normal text-xs">
              {" "}
              · {Math.round(live.durationS)}s
            </span>
          )}
        </div>
        <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${Math.max(0, Math.min(100, live.progress))}%` }}
          />
        </div>
        {live.message && (
          <div className="text-[11px] text-muted-foreground line-clamp-2">
            {live.message}
          </div>
        )}
        {live.state === "done" && (
          <Button asChild size="sm" variant="outline" className="w-full">
            <a
              href={`/api/watch/studio/render/${live.id}/download`}
              target="_blank"
              rel="noreferrer"
            >
              <Download className="h-4 w-4 mr-2" /> Download MP4
              {live.bytes ? (
                <span className="ml-2 text-[10px] text-muted-foreground">
                  ({(live.bytes / (1024 * 1024)).toFixed(1)} MB)
                </span>
              ) : null}
            </a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

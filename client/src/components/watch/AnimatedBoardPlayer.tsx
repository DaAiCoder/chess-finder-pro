/**
 * AnimatedBoardPlayer — the YouTube-style chess "watch" player.
 *
 * Wraps Chessground (already smooth: pieces translate between squares
 * via CSS transforms) and adds the rest of the broadcast UI:
 *   - playback (play / pause / step / scrub / speed / flip)
 *   - eval bar (vertical, animated transitions)
 *   - move arrows + check / capture highlights driven by the timeline
 *   - move SFX (move / capture / check / castle / promotion)
 *   - synced captions for narration
 *   - title card + outro card for "channel-style" framing
 *
 * The same component is used both inside the app (`/watch/games/:id`)
 * and inside the headless render route (`/watch/render`) — guaranteeing
 * the in-app preview and the exported MP4 visually match 1:1.
 *
 * Audio note: browser <audio> elements are autoplay-restricted; the
 * first user gesture unlocks them. We lazily construct the SFX bank
 * inside an `onClick` handler so muted-autoplay scenarios degrade
 * gracefully (the player still works without sound).
 */
import * as React from "react";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { Color, Key } from "chessground/types";
import { Chess } from "chess.js";
import {
  Pause,
  Play,
  ChevronsLeft,
  ChevronsRight,
  SkipBack,
  SkipForward,
  Repeat,
  Volume2,
  VolumeX,
  Mic2,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Per-ply position the player walks through. */
/** Engine alternative at a position (for Lines panel / commentary). */
export interface WatchAlternateLine {
  uci: string;
  san?: string;
  cp?: number | null;
  mateIn?: number | null;
  /** First few plies of PV in SAN, human-readable. */
  pvSan?: string;
}

export interface WatchPosition {
  /** FEN after this ply (ply 0 = start position). */
  fen: string;
  /** SAN of the move played to *reach* this position ("" for ply 0). */
  san: string;
  /** UCI of the move ("e2e4"), used to drive Chessground's `lastMove`. */
  uci?: string;
  /** Engine eval at this position (white POV, centipawns). */
  evalCp?: number | null;
  /** Mate-in distance (signed), if applicable. */
  mateIn?: number | null;
  /** Optional "best move" arrow to draw at this position. */
  bestMoveUci?: string | null;
  /** Top engine tries from the position *before* this ply (optional). */
  alternates?: WatchAlternateLine[];
}

/** Caption shown in sync with the board timeline. */
export interface WatchCaption {
  /** Absolute timeline second the caption appears. */
  tStart: number;
  /** Absolute timeline second the caption hides. */
  tEnd: number;
  /** Ply this caption is attached to (used for narration alignment). */
  ply: number;
  /** What to say / show. */
  text: string;
  /** Optional emphasis style — "key" highlights critical-move beats. */
  kind?: "intro" | "outro" | "phase" | "move" | "key" | "info";
  /** Pre-rendered narration MP3 from server (edge-tts). */
  audioUrl?: string;
  /** Actual audio length in seconds (for UI sync). */
  audioDurationS?: number;
  /** Stable id for cache busting / dedupe. */
  audioHash?: string;
}

/** Optional auxiliary arrow drawn on top of the played-move arrow. */
export interface WatchArrow {
  /** Which ply to show this arrow on. */
  ply: number;
  orig: string;
  dest: string;
  brush?: "green" | "red" | "blue" | "yellow";
}

export interface WatchTimeline {
  /** Title shown on the intro card and at the top of the chrome. */
  title: string;
  /** Sub-header shown under the title (event / date / ECO etc.). */
  subtitle?: string;
  /** White player display name. */
  white?: string;
  /** Black player display name. */
  black?: string;
  /** Game result string ("1-0", "0-1", "1/2-1/2"). */
  result?: string;
  /** Move-by-move positions. positions[0] is the start position. */
  positions: WatchPosition[];
  /** Captions / commentary aligned to absolute seconds. */
  captions?: WatchCaption[];
  /** Bonus arrows beyond the played move. */
  arrows?: WatchArrow[];
  /** Seconds the intro card is held before the first move. */
  introHoldS?: number;
  /** Seconds between consecutive moves at 1.0x speed. */
  perMoveSecondsAt1x?: number;
  /** Seconds the outro card is held after the last move. */
  outroHoldS?: number;
  /** Server may expose pacing targets for the episode UI. */
  targetDurationS?: number;
  totalDurationS?: number;
  /**
   * First second at which board shows position `i` (FEN after i plies).
   * When absent, player uses linear `introHoldS + ply * perMoveSecondsAt1x`.
   */
  plyTimeStarts?: number[];
  /** Title card until this second (optional; derived from script). */
  introEndS?: number;
  /** Outro card from this second until `totalDurationS`. */
  outroStartS?: number;
  meta?: {
    libraryGameId: number;
    plyCount: number;
    tier: string;
    source: string;
    opening?: string;
    event?: string;
    playedAt?: string;
  };
}

export interface AnimatedBoardPlayerProps {
  timeline: WatchTimeline;
  /**
   * Visual width of the board area in pixels. Captions / controls flow
   * relative to it. Defaults responsive; render route sets 720 px so
   * the framed 16:9 video crop lands nicely.
   */
  boardSize?: number;
  /** "wood" or "green" board theme. Default green (chess.com look). */
  theme?: "green" | "wood";
  /** Hide the side eval bar (kept on by default). */
  hideEvalBar?: boolean;
  /** Hide playback controls — useful in headless render mode. */
  hideControls?: boolean;
  /** Start auto-playing on mount. */
  autoPlay?: boolean;
  /** Suppress SFX (default false; headless render uses true). */
  muted?: boolean;
  /** Override the speech-synthesis voice rate (default 1.0). */
  ttsRate?: number;
  /**
   * When true, the player exposes `window.__watchPlayer` with `seek(t)`
   * and `state()` so a headless Chromium can drive deterministic frame
   * capture. See [server/services/videoRender.ts].
   */
  expose?: boolean;
  /** Class merged onto the outer wrapper. */
  className?: string;
  /** Fires when the visible board ply changes (for side panels). */
  onPlyChange?: (ply: number) => void;
}

const STARTING_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/* ---------------------------------------------------------------------- */
/* SFX                                                                    */
/* ---------------------------------------------------------------------- */

type SfxKind = "move" | "capture" | "check" | "castle" | "promote";

/**
 * Lazy SFX bank. Resolves only after the first user gesture so we don't
 * trip browser autoplay policies. Each kind maps to a sound file in
 * `/sounds/watch/`; missing files just fail silently.
 */
class SfxBank {
  private audio: Partial<Record<SfxKind, HTMLAudioElement>> = {};
  private muted = false;
  private base = "/sounds/watch";

  setMuted(m: boolean) {
    this.muted = m;
  }

  private playWebTick(kind: SfxKind) {
    if (this.muted || typeof window === "undefined") return;
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const freq =
        kind === "capture" ? 380 : kind === "check" ? 920 : kind === "castle" ? 520 : kind === "promote" ? 660 : 610;
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.04);
      window.setTimeout(() => void ctx.close(), 120);
    } catch {
      /* ignore */
    }
  }

  ensure() {
    if (Object.keys(this.audio).length > 0) return;
    const mkAudio = (file: string) => {
      try {
        const a = new Audio(`${this.base}/${file}`);
        a.preload = "auto";
        a.volume = 0.55;
        return a;
      } catch {
        return undefined;
      }
    };
    this.audio.move = mkAudio("move.ogg") ?? mkAudio("move.mp3");
    this.audio.capture = mkAudio("capture.ogg") ?? mkAudio("capture.mp3");
    this.audio.check = mkAudio("check.ogg") ?? mkAudio("check.mp3");
    this.audio.castle = mkAudio("castle.ogg") ?? mkAudio("castle.mp3");
    this.audio.promote = mkAudio("promote.ogg") ?? mkAudio("promote.mp3");
  }

  play(kind: SfxKind) {
    if (this.muted) return;
    this.ensure();
    const a = this.audio[kind];
    if (!a) {
      this.playWebTick(kind);
      return;
    }
    try {
      const clone = a.cloneNode(true) as HTMLAudioElement;
      clone.volume = a.volume;
      void clone.play().catch(() => {
        this.playWebTick(kind);
      });
    } catch {
      this.playWebTick(kind);
    }
  }
}

/**
 * Classify a ply transition into the right SFX based on SAN punctuation
 * and FEN comparison. Cheap heuristic — fine for "broadcast" feel.
 */
function classifySfx(prev: WatchPosition, next: WatchPosition): SfxKind {
  const san = next.san;
  if (!san) return "move";
  if (san.startsWith("O-O")) return "castle";
  if (san.includes("=")) return "promote";
  if (san.endsWith("#")) return "check";
  if (san.endsWith("+")) return "check";
  if (san.includes("x")) return "capture";
  void prev;
  return "move";
}

/* ---------------------------------------------------------------------- */
/* Eval bar                                                               */
/* ---------------------------------------------------------------------- */

function evalToWhitePct(cp: number | null | undefined, mate?: number | null): number {
  if (mate != null) return mate > 0 ? 99 : 1;
  if (cp == null) return 50;
  // Logistic squash so ±2000 fits comfortably on the bar.
  const x = cp / 400;
  const sig = 1 / (1 + Math.exp(-x));
  return Math.max(2, Math.min(98, sig * 100));
}

function EvalBar({
  cp,
  mate,
  flipped,
}: {
  cp: number | null | undefined;
  mate: number | null | undefined;
  flipped: boolean;
}) {
  const whitePct = evalToWhitePct(cp, mate);
  const label = mate != null ? `M${Math.abs(mate)}` : cp == null ? "—" : (cp / 100).toFixed(1);
  return (
    <div
      className="relative w-6 h-full min-h-[200px] rounded overflow-hidden border border-border bg-zinc-900 shrink-0"
      aria-label={`Evaluation: ${label}`}
    >
      <div
        className="absolute left-0 right-0 bg-zinc-100 transition-all duration-300 ease-out"
        style={
          flipped
            ? { top: 0, height: `${100 - whitePct}%` }
            : { bottom: 0, height: `${whitePct}%` }
        }
      />
      <div className="absolute inset-x-0 bottom-0 text-[10px] text-center font-mono py-0.5 bg-zinc-900/80 text-zinc-100">
        {label}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Title / outro card                                                     */
/* ---------------------------------------------------------------------- */

function TitleCard({ timeline }: { timeline: WatchTimeline }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 text-white p-6 text-center">
      <div className="text-[10px] uppercase tracking-[0.3em] text-emerald-400 mb-2">
        ChessFinderPro · Watch
      </div>
      <h2 className="text-2xl md:text-3xl font-bold mb-2 max-w-xl">
        {timeline.title}
      </h2>
      {timeline.subtitle && (
        <div className="text-sm text-zinc-300 mb-4">{timeline.subtitle}</div>
      )}
      {timeline.white && timeline.black && (
        <div className="text-sm font-mono text-zinc-200">
          <span className="text-white">{timeline.white}</span>
          <span className="mx-2 text-zinc-500">vs</span>
          <span className="text-white">{timeline.black}</span>
        </div>
      )}
    </div>
  );
}

function OutroCard({ timeline }: { timeline: WatchTimeline }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 text-white p-6 text-center">
      <div className="text-xs uppercase tracking-widest text-emerald-400 mb-2">
        Final result
      </div>
      <div className="text-5xl font-mono font-bold mb-4">
        {timeline.result ?? "*"}
      </div>
      {timeline.white && timeline.black && (
        <div className="text-sm text-zinc-300">
          {timeline.white} <span className="mx-1 text-zinc-500">vs</span>{" "}
          {timeline.black}
        </div>
      )}
      <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 mt-6">
        ChessFinderPro · Watch
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Component                                                              */
/* ---------------------------------------------------------------------- */

export function AnimatedBoardPlayer({
  timeline,
  boardSize,
  theme = "green",
  hideEvalBar = false,
  hideControls = false,
  autoPlay = false,
  muted = false,
  ttsRate = 1.0,
  expose = false,
  className,
  onPlyChange,
}: AnimatedBoardPlayerProps) {
  const boardRef = React.useRef<HTMLDivElement | null>(null);
  const apiRef = React.useRef<Api | null>(null);
  const sfxRef = React.useRef(new SfxBank());

  const positions = timeline.positions;
  const lastPly = positions.length - 1;
  const perMoveS = timeline.perMoveSecondsAt1x ?? 1.6;
  const introS = timeline.introHoldS ?? 2.5;
  const outroS = timeline.outroHoldS ?? 3.5;
  const introEnd = timeline.introEndS ?? introS;
  const outroStart = timeline.outroStartS ?? introS + perMoveS * Math.max(0, lastPly);
  const totalDurationS =
    typeof timeline.totalDurationS === "number" && Number.isFinite(timeline.totalDurationS)
      ? timeline.totalDurationS
      : introS + perMoveS * Math.max(0, lastPly) + outroS;

  const [ply, setPly] = React.useState(0);
  const [playing, setPlaying] = React.useState(autoPlay);
  const [speed, setSpeed] = React.useState(1);
  const [flipped, setFlipped] = React.useState(false);
  const [audioMuted, setAudioMuted] = React.useState(muted);
  const [ttsEnabled, setTtsEnabled] = React.useState(true);
  const [tNow, setTNow] = React.useState(0);
  const audioUnlockedRef = React.useRef(false);
  const narrationAudioRef = React.useRef<Map<string, HTMLAudioElement>>(new Map());

  React.useEffect(() => {
    sfxRef.current.setMuted(audioMuted);
  }, [audioMuted]);

  React.useEffect(() => {
    onPlyChange?.(ply);
  }, [ply, onPlyChange]);

  /* Mount Chessground once; subsequent FEN changes flow through .set(). */
  React.useEffect(() => {
    if (!boardRef.current) return;
    const initialFen = positions[0]?.fen ?? STARTING_FEN;
    apiRef.current = Chessground(boardRef.current, {
      fen: initialFen,
      orientation: "white",
      coordinates: true,
      movable: { color: undefined, free: false, dests: new Map() },
      premovable: { enabled: false },
      draggable: { enabled: false },
      // Smooth piece motion is the whole point — this is what makes
      // it feel like a polished broadcast and not a slideshow.
      animation: { enabled: true, duration: 320 },
      highlight: { lastMove: true, check: true },
      drawable: { enabled: true, visible: true },
    });
    return () => {
      apiRef.current?.destroy();
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Chessground measures the parent on boot — flex layouts may report 0×0
   * on first paint. Redraw after layout settles so pieces actually appear. */
  React.useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        apiRef.current?.redrawAll();
      } catch {
        /* ignore */
      }
    }, 80);
    return () => clearTimeout(t);
  }, [positions.length]);

  /* Re-orient on flip toggle. */
  React.useEffect(() => {
    apiRef.current?.set({ orientation: flipped ? "black" : ("white" as Color) });
  }, [flipped]);

  /* Advance the board whenever ply changes; play SFX on transitions. */
  const prevPlyRef = React.useRef(0);
  React.useEffect(() => {
    const api = apiRef.current;
    if (!api) return;
    const cur = positions[Math.min(ply, lastPly)];
    if (!cur) return;
    api.set({
      fen: cur.fen,
      lastMove: cur.uci
        ? ([cur.uci.slice(0, 2), cur.uci.slice(2, 4)] as Key[])
        : undefined,
    });
    // SFX only on forward steps; scrubbing backwards is silent so we
    // don't spam the user with capture noises.
    if (ply > prevPlyRef.current) {
      const prev = positions[Math.max(0, ply - 1)];
      const kind = classifySfx(prev, cur);
      sfxRef.current.play(kind);
    }
    prevPlyRef.current = ply;
    // Draw best-move arrow + any extra arrows for this ply.
    const shapes: { orig: Key; dest: Key; brush: string }[] = [];
    if (cur.bestMoveUci && cur.bestMoveUci.length >= 4) {
      shapes.push({
        orig: cur.bestMoveUci.slice(0, 2) as Key,
        dest: cur.bestMoveUci.slice(2, 4) as Key,
        brush: "blue",
      });
    }
    for (const a of timeline.arrows ?? []) {
      if (a.ply === ply) {
        shapes.push({ orig: a.orig as Key, dest: a.dest as Key, brush: a.brush ?? "green" });
      }
    }
    api.setShapes(shapes);
  }, [ply, positions, lastPly, timeline.arrows]);

  /* Animation loop */
  React.useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setTNow((t) => {
        const next = t + dt * speed;
        const cappedT = next >= totalDurationS ? totalDurationS : next;
        const targetPly = plyAtTimelineTime(
          cappedT,
          timeline,
          introS,
          perMoveS,
          lastPly,
        );
        setPly(targetPly);
        if (next >= totalDurationS) {
          setPlaying(false);
          return totalDurationS;
        }
        return cappedT;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, totalDurationS, introS, perMoveS, lastPly, timeline]);

  /* Caption picker: prefer the *tightest* interval containing tNow so
   * short per-move beats win over wide phase captions when they overlap. */
  const activeCaption = React.useMemo(() => {
    if (!timeline.captions) return null;
    const hits = timeline.captions.filter((c) => tNow >= c.tStart && tNow <= c.tEnd);
    if (hits.length === 0) return null;
    hits.sort((a, b) => a.tEnd - a.tStart - (b.tEnd - b.tStart));
    return hits[0] ?? null;
  }, [timeline.captions, tNow]);

  /* TTS fallback: speak each caption once when it first appears (no MP3). */
  const spokenRef = React.useRef<Set<string>>(new Set());
  React.useEffect(() => {
    if (!ttsEnabled || audioMuted || !activeCaption) return;
    if (activeCaption.audioUrl) return;
    if (typeof window === "undefined") return;
    const synth = window.speechSynthesis;
    if (!synth) return;
    const id = `${activeCaption.tStart}|${activeCaption.text}`;
    if (spokenRef.current.has(id)) return;
    spokenRef.current.add(id);
    try {
      const u = new SpeechSynthesisUtterance(activeCaption.text);
      u.rate = ttsRate;
      u.pitch = 1.0;
      u.volume = 0.9;
      synth.speak(u);
    } catch {
      /* unsupported voices etc. — ignore */
    }
  }, [activeCaption, ttsEnabled, audioMuted, ttsRate]);

  /* Pre-rendered narration MP3 (edge-tts): play active caption after user unlocks audio. */
  const lastNarrationIdRef = React.useRef<string>("");
  React.useEffect(() => {
    if (!ttsEnabled || audioMuted || !activeCaption?.audioUrl) return;
    if (!audioUnlockedRef.current) return;
    const id = activeCaption.audioHash ?? `${activeCaption.tStart}|${activeCaption.text.slice(0, 40)}`;
    if (lastNarrationIdRef.current === id) return;
    lastNarrationIdRef.current = id;
    let map = narrationAudioRef.current;
    let el = map.get(id);
    if (!el) {
      el = new Audio(activeCaption.audioUrl);
      el.preload = "auto";
      map.set(id, el);
    }
    for (const [k, a] of map) {
      if (k !== id) {
        try {
          a.pause();
          a.currentTime = 0;
        } catch {
          /* ignore */
        }
      }
    }
    el.currentTime = 0;
    void el.play().catch(() => {
      /* blocked */
    });
  }, [activeCaption, ttsEnabled, audioMuted]);

  React.useEffect(() => {
    spokenRef.current.clear();
    lastNarrationIdRef.current = "";
    narrationAudioRef.current.clear();
  }, [timeline.captions, timeline.totalDurationS]);

  /* Expose render hooks for the headless Chromium pipeline. */
  React.useEffect(() => {
    if (!expose || typeof window === "undefined") return;
    type ExposedPlayer = {
      seek: (t: number) => void;
      state: () => { ply: number; tNow: number; total: number };
      total: number;
    };
    const w = window as unknown as { __watchPlayer?: ExposedPlayer };
    w.__watchPlayer = {
      seek: (t: number) => {
        setTNow(t);
        setPly(plyAtTimelineTime(t, timeline, introS, perMoveS, lastPly));
      },
      state: () => ({ ply, tNow, total: totalDurationS }),
      total: totalDurationS,
    };
    return () => {
      delete (window as unknown as { __watchPlayer?: unknown }).__watchPlayer;
    };
  }, [expose, ply, tNow, totalDurationS, introS, perMoveS, lastPly, timeline]);

  /* Phase flags for intro/outro cards. */
  const showIntro = tNow < introEnd - 0.05 && ply === 0;
  const showOutro = tNow >= outroStart - 0.02 && ply >= lastPly;

  const unlockPlayback = React.useCallback(() => {
    if (audioUnlockedRef.current) return;
    audioUnlockedRef.current = true;
    try {
      sfxRef.current.ensure();
    } catch {
      /* ignore */
    }
    if (timeline.captions) {
      for (const c of timeline.captions) {
        if (!c.audioUrl) continue;
        const id = c.audioHash ?? `${c.tStart}|${c.text.slice(0, 40)}`;
        if (narrationAudioRef.current.has(id)) continue;
        const el = new Audio(c.audioUrl);
        el.preload = "auto";
        narrationAudioRef.current.set(id, el);
      }
    }
  }, [timeline.captions]);

  const handlePlayPause = () => {
    unlockPlayback();
    if (tNow >= totalDurationS - 0.01) {
      setTNow(0);
      setPly(0);
      setPlaying(true);
      return;
    }
    setPlaying((p) => !p);
  };

  const timeForPly = (p: number) => {
    const pts = timeline.plyTimeStarts;
    if (pts && pts.length > p && Number.isFinite(pts[p]!)) {
      return pts[p]!;
    }
    if (p <= 0) return 0;
    return introS + Math.max(0, p - 1) * perMoveS;
  };

  const handleStep = (delta: number) => {
    unlockPlayback();
    setPlaying(false);
    const next = Math.max(0, Math.min(lastPly, ply + delta));
    setPly(next);
    setTNow(timeForPly(next));
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    unlockPlayback();
    const t = Number(e.target.value);
    setTNow(t);
    setPly(plyAtTimelineTime(t, timeline, introS, perMoveS, lastPly));
  };

  const useFixedBoard = typeof boardSize === "number" && boardSize > 0;

  return (
    <div className={cn("flex flex-col gap-3 w-full", className)}>
      <div
        className={cn(
          "relative flex w-full mx-auto items-stretch gap-3",
          useFixedBoard ? "justify-center" : "max-w-[720px]",
        )}
      >
        {!hideEvalBar && (
          <div className="w-6 shrink-0 self-stretch flex">
            <EvalBar
              cp={positions[ply]?.evalCp ?? null}
              mate={positions[ply]?.mateIn ?? null}
              flipped={flipped}
            />
          </div>
        )}
        <div
          className={cn(
            "relative min-w-0 rounded-md overflow-hidden",
            useFixedBoard ? "shrink-0 aspect-square" : "flex-1 max-w-[640px] aspect-square",
          )}
          style={
            useFixedBoard
              ? { width: boardSize, height: boardSize, maxWidth: boardSize }
              : undefined
          }
        >
          <div
            ref={boardRef}
            className={cn(
              "cg-wrap rounded-md overflow-hidden h-full w-full",
              theme === "wood" ? "app-wood" : "app-green",
            )}
          />
          {showIntro && <TitleCard timeline={timeline} />}
          {showOutro && <OutroCard timeline={timeline} />}
        </div>
      </div>

      {/* Caption track */}
      <div className="min-h-[3.5rem] mx-auto w-full max-w-[700px]">
        {activeCaption ? (
          <div
            className={cn(
              "rounded-md px-4 py-2 text-sm md:text-base shadow-sm border",
              activeCaption.kind === "key"
                ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-100"
                : activeCaption.kind === "intro" || activeCaption.kind === "outro"
                  ? "bg-zinc-900 border-zinc-700 text-zinc-100"
                  : "bg-card border-border text-foreground",
            )}
            data-caption-ply={activeCaption.ply}
          >
            {activeCaption.text}
          </div>
        ) : (
          <div className="rounded-md px-4 py-2 text-sm text-muted-foreground/60 italic border border-dashed border-border/50">
            {timeline.subtitle ?? "—"}
          </div>
        )}
      </div>

      {/* Controls */}
      {!hideControls && (
        <div className="mx-auto w-full max-w-[700px] space-y-2">
          <input
            type="range"
            min={0}
            max={totalDurationS}
            step={0.05}
            value={tNow}
            onChange={handleScrub}
            className="w-full accent-emerald-500"
            aria-label="Timeline scrubber"
          />
          <div className="flex items-center gap-1.5 flex-wrap text-sm">
            <button
              type="button"
              onClick={() => handleStep(-lastPly)}
              className="rounded p-1.5 hover:bg-secondary"
              aria-label="Restart"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => handleStep(-1)}
              className="rounded p-1.5 hover:bg-secondary"
              aria-label="Previous move"
            >
              <SkipBack className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handlePlayPause}
              className="rounded p-2 bg-emerald-600 hover:bg-emerald-500 text-white"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => handleStep(1)}
              className="rounded p-1.5 hover:bg-secondary"
              aria-label="Next move"
            >
              <SkipForward className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => handleStep(lastPly)}
              className="rounded p-1.5 hover:bg-secondary"
              aria-label="Skip to end"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
            <div className="mx-2 text-xs font-mono tabular-nums text-muted-foreground">
              {formatTime(tNow)} / {formatTime(totalDurationS)} · {ply}/{lastPly}
            </div>
            <div className="ml-auto flex items-center gap-1">
              {[0.5, 1, 1.5, 2].map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={cn(
                    "px-2 py-1 rounded text-xs font-medium",
                    s === speed
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/60",
                  )}
                >
                  {s}x
                </button>
              ))}
              <button
                onClick={() => setFlipped((f) => !f)}
                className="rounded p-1.5 hover:bg-secondary"
                title="Flip board"
                aria-label="Flip board"
              >
                <Repeat className="h-4 w-4" />
              </button>
              <button
                onClick={() => setTtsEnabled((t) => !t)}
                className={cn(
                  "rounded p-1.5",
                  ttsEnabled
                    ? "bg-emerald-600/20 text-emerald-300"
                    : "hover:bg-secondary",
                )}
                title={ttsEnabled ? "Voice on" : "Voice off"}
                aria-label="Toggle narration voice"
              >
                <Mic2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setAudioMuted((m) => !m)}
                className="rounded p-1.5 hover:bg-secondary"
                title={audioMuted ? "Unmute" : "Mute"}
                aria-label="Toggle mute"
              >
                {audioMuted ? (
                  <VolumeX className="h-4 w-4" />
                ) : (
                  <Volume2 className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Helpers                                                                */
/* ---------------------------------------------------------------------- */

function plyAtTimelineTime(
  t: number,
  timeline: WatchTimeline,
  introS: number,
  perMoveS: number,
  lastPly: number,
): number {
  const pts = timeline.plyTimeStarts;
  if (pts && pts.length > 0) {
    let p = 0;
    for (let i = 1; i < pts.length; i++) {
      if (t + 1e-9 >= pts[i]!) p = i;
    }
    return Math.max(0, Math.min(lastPly, p));
  }
  return timelinePlyAt(t, introS, perMoveS, lastPly);
}

function timelinePlyAt(
  t: number,
  introS: number,
  perMoveS: number,
  lastPly: number,
): number {
  if (t <= introS) return 0;
  const after = t - introS;
  const k = Math.floor(after / perMoveS) + 1;
  return Math.max(0, Math.min(lastPly, k));
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Convenience: derive a `WatchTimeline.positions[]` array from a PGN.
 * Used by the channels endpoint AND the watch page when the server
 * timeline endpoint hasn't computed evals yet (graceful degrade).
 */
export function buildPositionsFromPgn(pgn: string): WatchPosition[] {
  try {
    const c = new Chess();
    c.loadPgn(pgn, { strict: false });
    const verbose = c.history({ verbose: true });
    const replay = new Chess();
    const out: WatchPosition[] = [{ fen: replay.fen(), san: "", uci: undefined }];
    for (const m of verbose) {
      replay.move({ from: m.from, to: m.to, promotion: m.promotion });
      out.push({ fen: replay.fen(), san: m.san, uci: m.lan });
    }
    return out;
  } catch {
    return [{ fen: STARTING_FEN, san: "" }];
  }
}

/**
 * Repertoire Trainer.
 *
 * Lets the user:
 *   - Create a repertoire (name + colour).
 *   - Upload a PGN that gets parsed into a tree of moves.
 *   - Drill a single repertoire move-by-move.
 *   - Inspect deviations the engine has logged.
 *
 * Two columns: the left panel lists repertoires + an upload form; the
 * right panel is the drill board.
 */

import * as React from "react";
import { Chess } from "chess.js";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Chessboard } from "@/components/chess/Chessboard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/queryClient";
import { toast } from "@/components/ui/Toaster";
import { BookOpen, Plus, Upload, Trash2, RotateCcw, AlertCircle } from "lucide-react";

interface Repertoire {
  id: number;
  userId: number;
  name: string;
  color: "white" | "black";
  createdAt: string;
}

interface RepertoireNode {
  id: number;
  repertoireId: number;
  parentId: number | null;
  fen: string;
  san: string;
  comment: string | null;
}

interface Deviation {
  id: number;
  fen: string;
  san: string;
  side: "white" | "black";
  source: "drill" | "game";
}

const STANDARD_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function stripDecor(san: string) {
  return san.replace(/[+#?!]/g, "");
}

export default function RepertoireTrainer() {
  const qc = useQueryClient();
  const list = useQuery<{ repertoires: Repertoire[] }>({
    queryKey: ["repertoires"],
    queryFn: () => api("/api/repertoires"),
  });

  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  const selected = list.data?.repertoires.find((r) => r.id === selectedId) ?? null;

  React.useEffect(() => {
    if (!selectedId && list.data?.repertoires?.[0]) {
      setSelectedId(list.data.repertoires[0].id);
    }
  }, [list.data, selectedId]);

  return (
    <div className="max-w-6xl mx-auto p-4 grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4">
      <div className="space-y-3">
        <CreateRepertoireCard onCreated={(r) => setSelectedId(r.id)} />
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <BookOpen className="w-4 h-4" /> Your repertoires
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(list.data?.repertoires ?? []).length === 0 && (
              <div className="text-xs text-muted-foreground">No repertoires yet.</div>
            )}
            {(list.data?.repertoires ?? []).map((r) => (
              <button
                key={r.id}
                onClick={() => setSelectedId(r.id)}
                className={`w-full text-left rounded-lg border px-3 py-2 transition ${
                  r.id === selectedId ? "border-primary bg-primary/5" : "hover:bg-accent"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">{r.name}</div>
                    <div className="text-xs text-muted-foreground">as {r.color}</div>
                  </div>
                  <Trash2
                    className="w-4 h-4 text-muted-foreground hover:text-destructive cursor-pointer"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await api(`/api/repertoires/${r.id}`, { method: "DELETE" });
                      if (r.id === selectedId) setSelectedId(null);
                      qc.invalidateQueries({ queryKey: ["repertoires"] });
                    }}
                  />
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        {selected ? (
          <RepertoirePanel repertoire={selected} />
        ) : (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              Select a repertoire on the left, or create a new one.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function CreateRepertoireCard({ onCreated }: { onCreated: (r: Repertoire) => void }) {
  const qc = useQueryClient();
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState<"white" | "black">("white");
  const m = useMutation<{ repertoire: Repertoire }, Error, { name: string; color: "white" | "black" }>({
    mutationFn: (body) =>
      api("/api/repertoires", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["repertoires"] });
      setName("");
      onCreated(data.repertoire);
    },
  });

  return (
    <Card>
      <CardHeader className="py-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Plus className="w-4 h-4" /> New repertoire
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Input
          placeholder="e.g. Italian for White"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={color === "white" ? "default" : "outline"}
            onClick={() => setColor("white")}
          >
            White
          </Button>
          <Button
            size="sm"
            variant={color === "black" ? "default" : "outline"}
            onClick={() => setColor("black")}
          >
            Black
          </Button>
        </div>
        <Button
          size="sm"
          className="w-full"
          disabled={!name.trim() || m.isPending}
          onClick={() => m.mutate({ name: name.trim(), color })}
        >
          Create
        </Button>
      </CardContent>
    </Card>
  );
}

function RepertoirePanel({ repertoire }: { repertoire: Repertoire }) {
  const qc = useQueryClient();
  const nodes = useQuery<{ nodes: RepertoireNode[] }>({
    queryKey: ["repertoire-nodes", repertoire.id],
    queryFn: () => api(`/api/repertoires/${repertoire.id}/nodes`),
  });
  const deviations = useQuery<{ deviations: Deviation[] }>({
    queryKey: ["repertoire-devs", repertoire.id],
    queryFn: () => api(`/api/repertoires/${repertoire.id}/deviations`),
  });

  const [pgn, setPgn] = React.useState("");
  const upload = useMutation<{ ok: boolean; nodeCount: number }, Error, string>({
    mutationFn: (body) =>
      api(`/api/repertoires/${repertoire.id}/upload-pgn`, {
        method: "POST",
        body: JSON.stringify({ pgn: body }),
      }),
    onSuccess: (resp) => {
      toast({ title: `Imported ${resp.nodeCount} new nodes` });
      setPgn("");
      qc.invalidateQueries({ queryKey: ["repertoire-nodes", repertoire.id] });
    },
    onError: (e) => toast({ title: "Import failed", description: e.message, variant: "destructive" }),
  });

  /* Drill state */
  const [boardFen, setBoardFen] = React.useState(STANDARD_FEN);
  const [history, setHistory] = React.useState<string[]>([]);

  const expectedNext = React.useMemo(() => {
    const nodeList = nodes.data?.nodes ?? [];
    const byId = new Map(nodeList.map((n) => [n.id, n] as const));
    for (const n of nodeList) {
      const parent = n.parentId == null ? null : byId.get(n.parentId);
      const parentFen = parent?.fen ?? STANDARD_FEN;
      if (parentFen === boardFen) return n;
    }
    return null;
  }, [boardFen, nodes.data]);

  const sideToMove = boardFen.split(" ")[1] === "b" ? "black" : "white";
  const isUserTurn = sideToMove === repertoire.color;

  function recordDeviation(san: string, side: "white" | "black") {
    api(`/api/repertoires/${repertoire.id}/deviation`, {
      method: "POST",
      body: JSON.stringify({
        fen: boardFen,
        san,
        side,
        source: "drill",
      }),
    }).catch(() => undefined);
  }

  function onMove(from: string, to: string, promotion?: string) {
    const probe = new Chess(boardFen);
    let played: string | null = null;
    try {
      played = probe.move({ from, to, promotion })?.san ?? null;
    } catch {
      return;
    }
    if (!played) return;
    if (isUserTurn) {
      if (!expectedNext) {
        toast({
          title: "No book move recorded here",
          description: "Upload more PGN to extend the tree.",
        });
        return;
      }
      const ok = stripDecor(expectedNext.san) === stripDecor(played);
      if (!ok) {
        toast({
          title: "Deviation logged",
          description: `Book wanted ${expectedNext.san}; you played ${played}.`,
        });
        recordDeviation(played, repertoire.color);
        qc.invalidateQueries({ queryKey: ["repertoire-devs", repertoire.id] });
      }
    }
    setBoardFen(probe.fen());
    setHistory([...history, played]);
  }

  function resetDrill() {
    setBoardFen(STANDARD_FEN);
    setHistory([]);
  }

  return (
    <>
      <Card>
        <CardHeader className="py-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">
            {repertoire.name} <Badge variant="outline" className="ml-2">{repertoire.color}</Badge>
          </CardTitle>
          <Button size="sm" variant="outline" onClick={resetDrill}>
            <RotateCcw className="w-4 h-4 mr-1" /> Reset drill
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <Chessboard
            fen={boardFen}
            orientation={repertoire.color}
            theme="wood"
            interactive
            movableColor={sideToMove}
            onMove={onMove}
          />
          {expectedNext && isUserTurn && (
            <div className="text-xs text-muted-foreground">
              Book expects: <strong className="text-foreground font-mono">{expectedNext.san}</strong>
            </div>
          )}
          {!expectedNext && (
            <div className="text-xs text-muted-foreground italic">Out of book — any move here is a deviation.</div>
          )}
          {history.length > 0 && (
            <div className="text-xs text-muted-foreground font-mono">
              {history.join(" ")}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Upload className="w-4 h-4" /> Import PGN
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <textarea
            value={pgn}
            onChange={(e) => setPgn(e.target.value)}
            placeholder="Paste one or more PGN games here…"
            rows={6}
            className="w-full text-xs font-mono rounded border bg-background p-2"
          />
          <Button
            size="sm"
            disabled={!pgn.trim() || upload.isPending}
            onClick={() => upload.mutate(pgn)}
          >
            {upload.isPending ? "Importing…" : "Import"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> Recent deviations
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(deviations.data?.deviations ?? []).length === 0 ? (
            <div className="text-xs text-muted-foreground">No deviations yet.</div>
          ) : (
            <ul className="text-xs space-y-1">
              {(deviations.data?.deviations ?? []).slice(0, 8).map((d) => (
                <li key={d.id} className="font-mono">
                  {d.side === "white" ? "♙" : "♟"} {d.san} ({d.source})
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}

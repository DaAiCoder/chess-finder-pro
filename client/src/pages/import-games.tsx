import * as React from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/Tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { api } from "@/lib/queryClient";
import { toast } from "@/components/ui/Toaster";
import { SiChessdotcom, SiLichess } from "react-icons/si";
import { Trash2 } from "lucide-react";
import type { Game } from "@shared/schema";

export default function ImportGames() {
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Import Games</h1>
        <p className="text-muted-foreground text-sm">
          Pull your last 40 games from Chess.com or Lichess, or paste raw PGN.
        </p>
      </div>

      <Tabs defaultValue="chess.com">
        <TabsList>
          <TabsTrigger value="chess.com">
            <SiChessdotcom className="w-4 h-4 mr-2" /> Chess.com
          </TabsTrigger>
          <TabsTrigger value="lichess">
            <SiLichess className="w-4 h-4 mr-2" /> Lichess
          </TabsTrigger>
          <TabsTrigger value="pgn">PGN paste</TabsTrigger>
        </TabsList>
        <TabsContent value="chess.com">
          <ChessComForm />
        </TabsContent>
        <TabsContent value="lichess">
          <LichessForm />
        </TabsContent>
        <TabsContent value="pgn">
          <PgnForm />
        </TabsContent>
      </Tabs>

      <ImportedGames />
    </div>
  );
}

const TIME_CLASSES = ["bullet", "blitz", "rapid", "classical"] as const;

function ChessComForm() {
  const qc = useQueryClient();
  const [username, setUsername] = React.useState("");
  const [timeClass, setTimeClass] = React.useState<(typeof TIME_CLASSES)[number]>("blitz");
  const [max, setMax] = React.useState(40);

  const m = useMutation({
    mutationFn: () =>
      api<{ count: number }>("/api/import/chess-com", {
        method: "POST",
        body: JSON.stringify({ username, timeClass, max }),
      }),
    onSuccess: (data) => {
      toast({ title: "Imported", description: `${data.count} games`, variant: "success" });
      qc.invalidateQueries({ queryKey: ["games"] });
    },
    onError: (e: Error) => toast({ title: "Import failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chess.com import</CardTitle>
        <CardDescription>
          Pulls monthly archives back up to 6 months until {max} games of the chosen time control are
          collected.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid md:grid-cols-3 gap-3">
        <div>
          <Label>Username</Label>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="magnuscarlsen" />
        </div>
        <div>
          <Label>Time control</Label>
          <Select value={timeClass} onValueChange={(v) => setTimeClass(v as typeof timeClass)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIME_CLASSES.map((tc) => (
                <SelectItem key={tc} value={tc}>{tc}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>How many</Label>
          <Input type="number" min={1} max={100} value={max} onChange={(e) => setMax(Number(e.target.value))} />
        </div>
        <Button onClick={() => m.mutate()} disabled={!username.trim() || m.isPending} className="md:col-span-3">
          {m.isPending ? "Fetching…" : "Import"}
        </Button>
      </CardContent>
    </Card>
  );
}

function LichessForm() {
  const qc = useQueryClient();
  const [username, setUsername] = React.useState("");
  const [perfType, setPerfType] = React.useState<(typeof TIME_CLASSES)[number]>("blitz");
  const [max, setMax] = React.useState(40);

  const m = useMutation({
    mutationFn: () =>
      api<{ count: number }>("/api/import/lichess", {
        method: "POST",
        body: JSON.stringify({ username, perfType, max }),
      }),
    onSuccess: (data) => {
      toast({ title: "Imported", description: `${data.count} games`, variant: "success" });
      qc.invalidateQueries({ queryKey: ["games"] });
    },
    onError: (e: Error) => toast({ title: "Import failed", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Lichess import</CardTitle>
        <CardDescription>Streams the user's recent games via the Lichess public API.</CardDescription>
      </CardHeader>
      <CardContent className="grid md:grid-cols-3 gap-3">
        <div>
          <Label>Username</Label>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="DrNykterstein" />
        </div>
        <div>
          <Label>Perf type</Label>
          <Select value={perfType} onValueChange={(v) => setPerfType(v as typeof perfType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIME_CLASSES.map((tc) => (
                <SelectItem key={tc} value={tc}>{tc}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>How many</Label>
          <Input type="number" min={1} max={100} value={max} onChange={(e) => setMax(Number(e.target.value))} />
        </div>
        <Button onClick={() => m.mutate()} disabled={!username.trim() || m.isPending} className="md:col-span-3">
          {m.isPending ? "Fetching…" : "Import"}
        </Button>
      </CardContent>
    </Card>
  );
}

function PgnForm() {
  const qc = useQueryClient();
  const [pgn, setPgn] = React.useState("");
  const m = useMutation({
    mutationFn: () => api<{ count: number }>("/api/import/pgn", { method: "POST", body: JSON.stringify({ pgn }) }),
    onSuccess: (data) => {
      toast({ title: "Imported", description: `${data.count} games`, variant: "success" });
      qc.invalidateQueries({ queryKey: ["games"] });
    },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>PGN paste</CardTitle>
        <CardDescription>Paste one or more games separated by [Event ...] headers.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <textarea
          className="w-full min-h-[180px] rounded-md border border-border bg-background p-3 font-mono text-xs"
          value={pgn}
          onChange={(e) => setPgn(e.target.value)}
          placeholder='[Event "Casual"]&#10;1. e4 e5 2. Nf3 Nc6 ...'
        />
        <Button onClick={() => m.mutate()} disabled={!pgn.trim() || m.isPending}>
          {m.isPending ? "Importing…" : "Import"}
        </Button>
      </CardContent>
    </Card>
  );
}

function ImportedGames() {
  const qc = useQueryClient();
  const games = useQuery<Game[]>({ queryKey: ["games"], queryFn: () => api("/api/games") });
  const del = useMutation({
    mutationFn: (id: number) => api(`/api/games/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["games"] }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your games ({games.data?.length ?? 0})</CardTitle>
      </CardHeader>
      <CardContent>
        {games.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {games.data && games.data.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing imported yet.</p>
        )}
        <div className="divide-y divide-border">
          {games.data?.map((g) => (
            <div key={g.id} className="flex items-center gap-3 py-2 text-sm">
              <Badge variant="outline" className="w-12 justify-center">{g.result ?? "*"}</Badge>
              <span className="font-medium truncate">
                {g.whitePlayer ?? "?"} <span className="text-muted-foreground">vs</span> {g.blackPlayer ?? "?"}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">
                {g.timeControl ?? ""} · {g.opening ?? "—"}
              </span>
              <Link href={`/game-analysis/${g.id}`}>
                <Button variant="outline" size="sm">Review</Button>
              </Link>
              <Button variant="ghost" size="icon" onClick={() => del.mutate(g.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

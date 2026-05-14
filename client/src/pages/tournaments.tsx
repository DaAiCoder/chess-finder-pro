import * as React from "react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

/** Minimal Swiss-style shell — pairings vs personas can be expanded server-side. */
export default function TournamentsPage() {
  const rounds = [1, 2, 3, 4, 5];
  return (
    <div className="p-4 max-w-3xl mx-auto space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold">Persona Swiss</h1>
        <Link href="/play" className="text-sm underline text-accent">
          ← Play
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">5-round Swiss (local demo)</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          {rounds.map((r) => (
            <div key={r} className="flex justify-between border-b border-border py-1">
              <span>Round {r}</span>
              <span className="text-muted-foreground">Pairings TBD</span>
            </div>
          ))}
          <p className="text-xs text-muted-foreground pt-2">
            Persona bots are selectable from the Play page; tournament rating feeds the per-skill rating service.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Opponent one-pager — server-rendered HTML report combining the scout
 * report's data into a printable A4 page. Designed to be printed via
 * the browser's native "Save as PDF" so we don't pull in headless Chrome.
 *
 * Layout: A4-friendly, 11pt body, single column. Four sections:
 *   1. Header (username, platform, rating, sample size)
 *   2. WDL summary + recent streak
 *   3. Repertoire by colour (top 5 pet lines + top 3 surprise lines)
 *   4. Recommendations from the scout's own engine
 */

import { fetchPlayerProfile } from "./playerProfile.js";
import { buildScoutReport, type ScoutReport } from "./opponentScout.js";

export interface OpponentReportInput {
  username: string;
  platform: string;
}

export async function renderOpponentReportHtml(
  input: OpponentReportInput,
): Promise<string> {
  const platform = input.platform === "lichess" ? "lichess" : "chess.com";
  let html: string;
  try {
    const profile = await fetchPlayerProfile(input.username, platform);
    if (profile.notFound) {
      html = errorPage(`${platform}: '${input.username}' not found`);
    } else {
      // We deliberately don't fetch fresh games here — that's heavy and
      // the user will normally have already scouted in the UI. Instead
      // we attempt the scout build with an empty `games` array, which
      // produces a still-useful skeletal report. If the caller wants a
      // full report they should hit `/api/opponent-prep/scout` first
      // and then hit this endpoint with the same params (the in-memory
      // cache is shared across both).
      const report = buildScoutReport({ profile, games: [] });
      html = renderReport(report);
    }
  } catch (err) {
    html = errorPage((err as Error).message);
  }
  return html;
}

/**
 * Pure renderer for a pre-built ScoutReport. Exported so callers that
 * already have a cached report (e.g. routes.ts re-using scoutCache)
 * can skip the network round-trip.
 */
export function renderReport(report: ScoutReport): string {
  const profile = report.profile;
  const sample = report.sample;
  const rating =
    profile.ratings?.rapid?.current ??
    profile.ratings?.blitz?.current ??
    profile.ratings?.classical?.current ??
    profile.ratings?.bullet?.current;
  const ratingLine = rating
    ? `${profile.platform} · rating ${rating}`
    : profile.platform;

  const wdlBar = (w: number, d: number, l: number) => {
    const total = w + d + l || 1;
    const wp = Math.round((w / total) * 100);
    const dp = Math.round((d / total) * 100);
    const lp = 100 - wp - dp;
    return `<div class="wdl">
      <span class="bar" style="background:#16a34a;width:${wp}%"></span>
      <span class="bar" style="background:#9ca3af;width:${dp}%"></span>
      <span class="bar" style="background:#dc2626;width:${lp}%"></span>
    </div>
    <div class="wdl-num">${w}W · ${d}D · ${l}L</div>`;
  };

  const petRows = report.petLines
    .slice(0, 5)
    .map(
      (o) =>
        `<tr><td>${escape(o.name)}</td><td class="num">${o.count}</td><td class="num">${Math.round(o.score * 100)}%</td></tr>`,
    )
    .join("");

  const surpriseRows = report.surpriseLines
    .slice(0, 3)
    .map(
      (o) =>
        `<tr><td>${escape(o.name)}</td><td class="num">${o.count}</td></tr>`,
    )
    .join("");

  const recRows = report.recommendations
    .slice(0, 5)
    .map(
      (r) =>
        `<tr><td>${escape(r.opening)}</td><td>${escape(r.color)}</td><td>${escape(r.reason)}</td></tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Opponent report — ${escape(profile.username)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font: 11pt/1.4 -apple-system, "Segoe UI", Roboto, sans-serif; color: #1f2937; max-width: 760px; margin: 0 auto; padding: 24px; }
  h1 { font-size: 22pt; margin: 0; }
  h2 { font-size: 13pt; margin: 24px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #e5e7eb; }
  h3 { font-size: 11pt; margin: 16px 0 4px; color: #4b5563; }
  .meta { color: #6b7280; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0; }
  th, td { padding: 6px 8px; text-align: left; font-size: 10.5pt; border-bottom: 1px solid #f3f4f6; }
  th { background: #f9fafb; font-weight: 600; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .empty { color: #9ca3af; font-style: italic; }
  .wdl { display: flex; width: 100%; height: 12px; border-radius: 4px; overflow: hidden; }
  .wdl .bar { display: inline-block; height: 100%; }
  .wdl-num { font-size: 10pt; color: #6b7280; margin-top: 2px; }
  .print-btn { position: fixed; top: 12px; right: 12px; padding: 8px 14px; border: 1px solid #e5e7eb; background: white; cursor: pointer; border-radius: 6px; font-size: 12px; box-shadow: 0 2px 6px rgba(0,0,0,0.08); }
  @media print { .print-btn { display: none; } }
</style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
  <h1>${escape(profile.username)}</h1>
  <div class="meta">${escape(ratingLine)} · ${sample.total} games (${sample.asWhite}W / ${sample.asBlack}B)</div>

  <h2>Form</h2>
  <h3>Overall</h3>
  ${wdlBar(report.wdl.overall.wins, report.wdl.overall.draws, report.wdl.overall.losses)}
  <h3>As White</h3>
  ${wdlBar(report.wdl.asWhite.wins, report.wdl.asWhite.draws, report.wdl.asWhite.losses)}
  <h3>As Black</h3>
  ${wdlBar(report.wdl.asBlack.wins, report.wdl.asBlack.draws, report.wdl.asBlack.losses)}
  <div class="meta" style="margin-top:8px;">
    Current streak: <strong>${report.currentStreak.type === "none" ? "—" : `${report.currentStreak.length}${report.currentStreak.type}`}</strong>
  </div>

  <h2>Pet lines</h2>
  <table>
    <thead><tr><th>Opening</th><th class="num">Games</th><th class="num">Score</th></tr></thead>
    <tbody>${petRows || `<tr><td class="empty" colspan="3">Not enough data yet</td></tr>`}</tbody>
  </table>

  <h2>Surprise lines</h2>
  <table>
    <thead><tr><th>Opening</th><th class="num">Games</th></tr></thead>
    <tbody>${surpriseRows || `<tr><td class="empty" colspan="2">None</td></tr>`}</tbody>
  </table>

  <h2>Recommendations</h2>
  <table>
    <thead><tr><th>Opening</th><th>You play</th><th>Why</th></tr></thead>
    <tbody>${recRows || `<tr><td class="empty" colspan="3">Run a full scout from the Opponent Prep page first to populate this section.</td></tr>`}</tbody>
  </table>
</body>
</html>`;
}

function errorPage(message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Error</title></head><body style="font:14px system-ui;padding:32px;color:#dc2626">${escape(message)}</body></html>`;
}

function escape(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

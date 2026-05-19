import * as React from "react";

export async function adminJson<T>(path: string, adminKey?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (adminKey?.trim()) headers.Authorization = `Bearer ${adminKey.trim()}`;
  const res = await fetch(path, { headers, credentials: "include" });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? res.statusText);
  return body;
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function useAdminAuth() {
  const [sessionOk, setSessionOk] = React.useState(false);
  const [adminKey, setAdminKey] = React.useState("");
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    void fetch("/api/operator/session", { credentials: "include" })
      .then((r) => r.json())
      .then((d: { ok?: boolean }) => setSessionOk(!!d.ok))
      .catch(() => setSessionOk(false))
      .finally(() => setReady(true));
  }, []);

  return { sessionOk, adminKey, setAdminKey, ready };
}

export function useDateRange(days = 30) {
  const [to, setTo] = React.useState(() => isoDate(new Date()));
  const [from, setFrom] = React.useState(() =>
    isoDate(new Date(Date.now() - days * 24 * 60 * 60 * 1000)),
  );

  const queryString = React.useMemo(() => {
    const p = new URLSearchParams();
    p.set("from", new Date(from + "T00:00:00.000Z").toISOString());
    p.set("to", new Date(to + "T23:59:59.999Z").toISOString());
    return p.toString();
  }, [from, to]);

  return { from, setFrom, to, setTo, queryString };
}

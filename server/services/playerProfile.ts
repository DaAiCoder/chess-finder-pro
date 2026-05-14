/**
 * Player profile fetcher.
 *
 * Pulls public profile metadata from chess.com or lichess so the opponent
 * scouting page can display avatar, country, title, current rating, peak
 * rating, etc.  Both APIs are unauthenticated (lichess optional bearer
 * token).
 */

const CC_UA = "ChessFinderPro/0.1 (+https://github.com/)";

export interface PlayerProfile {
  username: string;
  platform: "chess.com" | "lichess";
  /** Display name on the platform (often differs from the lower-cased handle). */
  displayName: string;
  url: string;
  avatarUrl: string | null;
  country: string | null;
  /** ISO country code if available (chess.com gives a URL; lichess gives 2-letter). */
  countryCode: string | null;
  /** GM, IM, FM, NM, etc., or null. */
  title: string | null;
  joined: string | null; // ISO date
  lastSeen: string | null; // ISO date
  online: boolean;
  ratings: Record<string, { current: number; best?: number; games?: number }>;
  /** True if the API indicates the account no longer exists / is closed. */
  notFound?: boolean;
}

export async function fetchPlayerProfile(
  username: string,
  platform: "chess.com" | "lichess",
): Promise<PlayerProfile> {
  if (platform === "chess.com") return fetchChessComProfile(username);
  return fetchLichessProfile(username);
}

/* ====================================================================== */
/*  chess.com                                                              */
/* ====================================================================== */

interface ChessComPlayer {
  url: string;
  name?: string;
  username: string;
  title?: string;
  followers?: number;
  country?: string; // URL like https://api.chess.com/pub/country/US
  avatar?: string;
  joined?: number; // unix seconds
  last_online?: number; // unix seconds
  status?: string;
}

interface ChessComStatsBucket {
  last?: { rating?: number; date?: number };
  best?: { rating?: number; date?: number };
  record?: { win?: number; loss?: number; draw?: number };
}

interface ChessComStats {
  chess_rapid?: ChessComStatsBucket;
  chess_blitz?: ChessComStatsBucket;
  chess_bullet?: ChessComStatsBucket;
  chess_daily?: ChessComStatsBucket;
}

async function fetchChessComProfile(username: string): Promise<PlayerProfile> {
  const lower = username.toLowerCase();
  const baseUrl = `https://api.chess.com/pub/player/${encodeURIComponent(lower)}`;
  const [pRes, sRes] = await Promise.all([
    fetch(baseUrl, { headers: { "User-Agent": CC_UA } }),
    fetch(`${baseUrl}/stats`, { headers: { "User-Agent": CC_UA } }),
  ]);

  if (pRes.status === 404) {
    return notFoundProfile(lower, "chess.com");
  }
  if (!pRes.ok) {
    throw new Error(`chess.com profile HTTP ${pRes.status}`);
  }
  const profile = (await pRes.json()) as ChessComPlayer;
  let stats: ChessComStats = {};
  if (sRes.ok) stats = (await sRes.json()) as ChessComStats;

  // chess.com country comes back as a URL — fetch one more time to derive code.
  let countryCode: string | null = null;
  let countryName: string | null = null;
  if (profile.country) {
    const m = profile.country.match(/\/([A-Z]{2})$/);
    countryCode = m ? m[1] : null;
    if (countryCode) countryName = countryCode;
  }

  const ratings: PlayerProfile["ratings"] = {};
  const map: [keyof ChessComStats, string][] = [
    ["chess_rapid", "rapid"],
    ["chess_blitz", "blitz"],
    ["chess_bullet", "bullet"],
    ["chess_daily", "daily"],
  ];
  for (const [k, label] of map) {
    const b = stats[k];
    if (!b?.last?.rating) continue;
    const games =
      (b.record?.win ?? 0) + (b.record?.loss ?? 0) + (b.record?.draw ?? 0);
    ratings[label] = {
      current: b.last.rating,
      best: b.best?.rating,
      games,
    };
  }

  return {
    username: lower,
    platform: "chess.com",
    displayName: profile.name ?? profile.username ?? lower,
    url: profile.url ?? `https://www.chess.com/member/${lower}`,
    avatarUrl: profile.avatar ?? null,
    country: countryName,
    countryCode,
    title: profile.title ?? null,
    joined: profile.joined ? new Date(profile.joined * 1000).toISOString() : null,
    lastSeen: profile.last_online
      ? new Date(profile.last_online * 1000).toISOString()
      : null,
    online: profile.status === "premium" || profile.status === "basic", // chess.com doesn't expose live online here
    ratings,
  };
}

/* ====================================================================== */
/*  lichess                                                                */
/* ====================================================================== */

interface LichessUser {
  id: string;
  username: string;
  perfs?: Record<
    string,
    { games?: number; rating?: number; rd?: number; prog?: number; prov?: boolean }
  >;
  title?: string;
  online?: boolean;
  createdAt?: number;
  seenAt?: number;
  profile?: { country?: string; bio?: string };
  closed?: boolean;
  disabled?: boolean;
  tosViolation?: boolean;
}

async function fetchLichessProfile(username: string): Promise<PlayerProfile> {
  const lower = username.toLowerCase();
  const headers: Record<string, string> = {};
  if (process.env.LICHESS_TOKEN)
    headers.Authorization = `Bearer ${process.env.LICHESS_TOKEN}`;
  const r = await fetch(
    `https://lichess.org/api/user/${encodeURIComponent(lower)}`,
    { headers },
  );
  if (r.status === 404) return notFoundProfile(lower, "lichess");
  if (!r.ok) throw new Error(`lichess profile HTTP ${r.status}`);
  const u = (await r.json()) as LichessUser;
  if (u.closed || u.disabled) return notFoundProfile(lower, "lichess");

  const ratings: PlayerProfile["ratings"] = {};
  const wanted: (keyof NonNullable<LichessUser["perfs"]>)[] = [
    "bullet",
    "blitz",
    "rapid",
    "classical",
    "correspondence",
  ];
  for (const k of wanted) {
    const b = u.perfs?.[k];
    if (!b?.rating) continue;
    ratings[k] = { current: b.rating, games: b.games };
  }

  return {
    username: u.username.toLowerCase(),
    platform: "lichess",
    displayName: u.username,
    url: `https://lichess.org/@/${u.username}`,
    avatarUrl: null, // lichess does not expose avatars via public API
    country: u.profile?.country ?? null,
    countryCode: u.profile?.country ?? null,
    title: u.title ?? null,
    joined: u.createdAt ? new Date(u.createdAt).toISOString() : null,
    lastSeen: u.seenAt ? new Date(u.seenAt).toISOString() : null,
    online: !!u.online,
    ratings,
  };
}

function notFoundProfile(
  username: string,
  platform: "chess.com" | "lichess",
): PlayerProfile {
  return {
    username,
    platform,
    displayName: username,
    url:
      platform === "chess.com"
        ? `https://www.chess.com/member/${username}`
        : `https://lichess.org/@/${username}`,
    avatarUrl: null,
    country: null,
    countryCode: null,
    title: null,
    joined: null,
    lastSeen: null,
    online: false,
    ratings: {},
    notFound: true,
  };
}

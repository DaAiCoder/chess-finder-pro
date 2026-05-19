/** Public product name shown in UI, browser titles, and legal copy. */
export const APP_NAME = "ChessGM";

export function pageTitle(page: string): string {
  return `${page} — ${APP_NAME}`;
}

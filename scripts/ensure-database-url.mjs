/**
 * Exit non-zero if DATABASE_URL is missing, so we never run drizzle-kit push
 * against the wrong database by accident.
 */
if (!process.env.DATABASE_URL?.trim()) {
  console.error(`
Missing DATABASE_URL.

Apply the Drizzle schema to your Render Postgres database from this machine:

  Windows PowerShell (use the External URL from Render → Postgres → Connections):
    $env:DATABASE_URL = "postgresql://..."
    npm run db:push:production

  Then remove the variable from this shell if you like:
    Remove-Item Env:DATABASE_URL
`);
  process.exit(1);
}

/** Native binding failures require a runtime repair, never database recovery. */
export function storageStartupFailure(error: unknown): { event: string; message: string } {
  const message = error instanceof Error ? error.message : '';
  if (
    /NODE_MODULE_VERSION|different Node\.js version|Could not locate the bindings file|dlopen.*better_sqlite3|better_sqlite3.*(?:wrong architecture|incompatible architecture)/i.test(
      message,
    )
  )
    return {
      event: 'runtime.sqlite.unavailable',
      message:
        'The SQLite runtime is incompatible or missing. Source checkout: select the Node version in .nvmrc and run npm ci, then restart. Desktop install: reinstall the package for this operating system and architecture. Database recovery is not needed for this runtime failure.',
    };
  return {
    event: 'storage.open.failed',
    message:
      'Local data could not be opened. Stop Sunday Sidekick and run npm run db:recover -- --check.',
  };
}

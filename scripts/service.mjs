import { createServiceManager } from './service-manager.mjs';

const command = process.argv[2] ?? 'help';
const service = createServiceManager();

try {
  const handled = await service.run(command);
  if (!handled) usage();
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Service operation failed.');
  process.exitCode = 1;
}

function usage() {
  console.info(`Manage the Sunday Sidekick background service:
  npm run service -- install
  npm run service -- update
  npm run service -- start
  npm run service -- stop
  npm run service -- status
  npm run service -- uninstall`);
}

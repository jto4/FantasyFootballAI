import { createServer } from 'node:net';

/** Fail before build/start when another local app already owns the required API port. */
export function assertPortAvailable(host, port) {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        reject(
          new Error(
            `Port ${port} on ${host} is already in use. Stop the app using it, then run npm start again. If that app is Sunday Sidekick, use its Stop app button or npm run service -- stop.`,
          ),
        );
        return;
      }
      reject(error);
    });
    probe.listen(port, host, () => {
      probe.close((error) => (error ? reject(error) : resolve()));
    });
  });
}

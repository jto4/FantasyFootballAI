import express from 'express';
import { apiErrorCodes } from './api-errors.js';
import { applySecurityHeaders } from './security-headers.js';
import { isAllowedOrigin } from './origin.js';
/** Production and integration fixtures share the same loopback and browser-origin boundary. */
export function createLocalHttpApp(port: () => number, development = false) {
  const app = express();
  app.disable('x-powered-by');
  app.use(apiErrorCodes);
  app.use((_req, res, next) => {
    applySecurityHeaders(res);
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.use((req, res, next) => {
    const host = req.headers.host?.replace(/:\d+$/, '');
    if (host !== '127.0.0.1' && host !== 'localhost')
      return res.status(403).json({ error: 'Local requests only' });
    if (req.headers.origin && !isAllowedOrigin(req.headers.origin, port(), development))
      return res.status(403).json({ error: 'Cross-origin request rejected' });
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  return app;
}

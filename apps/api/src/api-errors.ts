import type { RequestHandler } from 'express';
import { record, type ApiErrorCode } from '@sidekick/core';
/** Keep legacy error messages while exposing stable machine-readable categories to clients. */
export const apiErrorCodes: RequestHandler = (_req, res, next) => {
  const json = res.json;
  res.json = function (body: unknown) {
    if (record(body) && typeof body.error === 'string' && body.code === undefined) {
      const code: ApiErrorCode =
        res.statusCode === 404
          ? 'not_found'
          : res.statusCode === 409
            ? 'revision_conflict'
            : res.statusCode === 502
              ? 'provider_failure'
              : res.statusCode === 503
                ? 'service_unavailable'
                : res.statusCode === 403
                  ? 'access_denied'
                  : res.statusCode >= 500
                    ? 'internal_error'
                    : 'invalid_request';
      return json.call(this, { ...body, code });
    }
    return json.call(this, body);
  };
  next();
};

import { AppError } from '../errors.js';

const errorBody = (code, message) => ({ error: { code, message } });

// Errors raised by express.json() before a route runs. Messages are fixed strings so nothing
// from the parser (which can echo request content) reaches the client.
const BODY_PARSER_ERRORS = {
  'entity.parse.failed': [400, 'INVALID_BODY', 'Request body must be valid JSON'],
  'entity.too.large': [413, 'PAYLOAD_TOO_LARGE', 'Request body is too large'],
};

export function notFound(req, res) {
  res.status(404).json(errorBody('NOT_FOUND', 'Route not found'));
}

/**
 * The single place errors become responses, always as { error: { code, message } }.
 * - AppError (expected failures from the services): its own status, code and message.
 * - Body-parser failures: mapped to fixed 400/413 messages.
 * - Any other 4xx: generic BAD_REQUEST.
 * - Everything else: logged in full on the server, but the client only ever sees a generic 500,
 *   so SQL text, file paths and stack traces cannot leak.
 */
export function errorHandler(logger = console) {
  // Express recognises error middleware by its 4 parameters; keep all four.
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    if (res.headersSent) return next(err);

    if (err instanceof AppError) {
      return res.status(err.status).json(errorBody(err.code, err.message));
    }

    const mapped = BODY_PARSER_ERRORS[err?.type];
    if (mapped) return res.status(mapped[0]).json(errorBody(mapped[1], mapped[2]));

    const status = err?.status ?? err?.statusCode;
    if (Number.isInteger(status) && status >= 400 && status < 500) {
      return res.status(status).json(errorBody('BAD_REQUEST', 'The request could not be processed'));
    }

    const where = String(req?.originalUrl ?? '').split('?')[0];   // path only, never the query string
    logger.error(`[api] ${req?.method} ${where} failed:`, err);
    return res.status(500).json(errorBody('INTERNAL_ERROR', 'Something went wrong'));
  };
}

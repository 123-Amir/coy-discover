/**
 * Error thrown by the service layer for any expected failure. `status` is an HTTP-style code
 * the Express layer can use directly; services themselves know nothing about Express.
 * Messages are deliberately generic and never mention anyone else's swipes.
 */
export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

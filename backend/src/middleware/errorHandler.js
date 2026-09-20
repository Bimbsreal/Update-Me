export class AppError extends Error {
  constructor(message, status = 400, code = 'BAD_REQUEST') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function notFoundHandler(req, res) {
  const pathOnly = (req.originalUrl || req.url || '').split('?')[0];
  res.status(404).json({
    success: false,
    code: 'NOT_FOUND',
    message: `Route not found: ${req.method} ${pathOnly}`,
    requestId: req.requestId || undefined,
  });
}

export function errorHandler(err, req, res, _next) {
  const requestId = req.requestId || undefined;
  const isProd = process.env.NODE_ENV === 'production';

  if (err instanceof AppError) {
    return res.status(err.status).json({
      success: false,
      code: err.code,
      message: err.message,
      requestId,
    });
  }

  if (err?.name === 'ZodError') {
    return res.status(400).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message: err.errors?.[0]?.message || 'Invalid request data',
      ...(isProd ? {} : { details: err.errors }),
      requestId,
    });
  }

  console.error(
    JSON.stringify({
      level: 'error',
      msg: 'unhandled_error',
      requestId,
      name: err?.name,
      message: err?.message,
      stack: isProd ? undefined : err?.stack,
    })
  );

  return res.status(err.status || err.statusCode || 500).json({
    success: false,
    code: 'INTERNAL_ERROR',
    message: 'Something went wrong. Please try again.',
    requestId,
  });
}

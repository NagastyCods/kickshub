const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/apiResponse');

function notFound(req, res) {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
    errors: [],
  });
}

function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let errors = Array.isArray(err.errors) ? err.errors : [];

  if (err.name === 'ValidationError' && err.errors && !Array.isArray(err.errors)) {
    statusCode = 400;
    message = 'Validation failed';
    errors = Object.values(err.errors).map((item) => ({
      field: item.path,
      message: item.message,
    }));
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${err.path || 'identifier'}`;
    errors = [{ field: err.path || 'id', message: 'Invalid identifier' }];
  } else if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyPattern || err.keyValue || {})[0] || 'value';
    message = 'That value is already in use';
    errors = [{ field, message: `${field} already exists` }];
  } else if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    message = 'Invalid JSON body';
  } else if (!(err instanceof ApiError) && statusCode >= 500 && process.env.NODE_ENV === 'production') {
    message = 'Something went wrong';
  }

  const body = { success: false, message, errors };
  if (process.env.NODE_ENV !== 'production' && statusCode >= 500) body.stack = err.stack;
  res.status(statusCode).json(body);
}

module.exports = { notFound, errorHandler, sendSuccess };

const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

function validate(req, _res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();
  const errors = result.array().map((item) => ({
    field: item.path,
    message: item.msg,
  }));
  return next(new ApiError(400, 'Check the form', errors));
}

module.exports = validate;

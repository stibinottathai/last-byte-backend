const { validationResult } = require('express-validator');

/**
 * Middleware to check express-validator results
 * Returns 400 with error details if validation fails
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    const extractedErrors = errors.array().map((err) => ({
      field: err.path,
      message: err.msg,
    }));

    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: extractedErrors,
    });
  }

  next();
};

module.exports = validate;

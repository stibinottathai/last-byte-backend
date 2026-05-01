const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');

/**
 * Protect routes — verifies JWT token from Authorization header
 * Attaches the authenticated user to req.user
 */
const protect = async (req, res, next) => {
  try {
    let token;

    // Check for Bearer token in Authorization header
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return next(new ApiError('Not authorized — no token provided', 401));
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach user to request (exclude password)
    const user = await User.findById(decoded.id);

    if (!user) {
      return next(new ApiError('Not authorized — user no longer exists', 401));
    }

    if (!user.isActive) {
      return next(new ApiError('Your account has been deactivated. Contact admin.', 403));
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return next(new ApiError('Not authorized — invalid token', 401));
    }
    if (error.name === 'TokenExpiredError') {
      return next(new ApiError('Not authorized — token expired', 401));
    }
    return next(new ApiError('Not authorized', 401));
  }
};

/**
 * Authorize by role — restricts access to specific roles
 * Must be used AFTER protect middleware
 *
 * Usage: authorize('admin', 'shopOwner')
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError('Not authorized', 401));
    }

    if (!roles.includes(req.user.role)) {
      return next(
        new ApiError(
          `Role '${req.user.role}' is not authorized to access this route`,
          403
        )
      );
    }

    next();
  };
};

module.exports = { protect, authorize };

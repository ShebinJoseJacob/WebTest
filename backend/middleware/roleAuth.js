const roleAuth = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Authentication required'
      });
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Access denied. Insufficient permissions'
      });
    }

    next();
  };
};

// Specific middleware functions
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required'
    });
  }
  next();
};

const requireSupervisor = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required'
    });
  }

  if (req.user.role !== 'supervisor') {
    return res.status(403).json({
      error: 'Access denied. Supervisor role required'
    });
  }

  next();
};

const requireEmployee = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required'
    });
  }

  if (req.user.role !== 'employee') {
    return res.status(403).json({
      error: 'Access denied. Employee role required'
    });
  }

  next();
};

module.exports = {
  roleAuth,
  requireAuth,
  requireSupervisor,
  requireEmployee
};
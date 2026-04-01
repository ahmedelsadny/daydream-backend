const { ROLES } = require('../auth-jwt');

function allowRoles(...allowed) {
  return (req, res, next) => {
    console.log('Debug - Role check:', {
      userRole: req.user ? req.user.role : 'No user',
      allowedRoles: allowed,
      isAllowed: req.user ? allowed.includes(req.user.role) : false,
      reqUserObject: req.user
    });
    
    if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
    if (!allowed.includes(req.user.role)) {
      console.log('Debug - Access denied:', {
        userRole: req.user.role,
        allowedRoles: allowed,
        endpoint: req.originalUrl
      });
      return res.status(403).json({ message: 'Forbidden' });
    }
    next();
  };
}

module.exports = {
  ROLES,
  allowRoles
};



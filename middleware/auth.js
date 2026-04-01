const { verifyJwt } = require('../auth-jwt');
const { isRevoked } = require('../auth-jwt/blacklist');
const { User } = require('../models');

async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization || '';
    const [, token] = authHeader.split(' ');
    if (!token) {
      return res.status(401).json({ message: 'Missing Bearer token' });
    }

    if (isRevoked(token)) {
      return res.status(401).json({ message: 'Token revoked' });
    }

    const decoded = verifyJwt(token);

    const user = await User.findByPk(decoded.sub);
    if (!user) {
      return res.status(401).json({ message: 'Invalid token user' });
    }

    console.log('Debug - User from database:', {
      id: user.id,
      role: user.role,
      branchId: user.branchId,
      rawBranchId: user.dataValues ? user.dataValues.branch_id : 'No dataValues',
      warehouseId: user.warehouseId,
      rawWarehouseId: user.dataValues ? user.dataValues.warehouse_id : 'No dataValues'
    });

    req.user = {
      id: user.id,
      role: user.role,
      branchId: user.branchId,
      warehouseId: user.warehouseId
    };

    console.log('Debug - req.user object:', req.user);
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

module.exports = authMiddleware;



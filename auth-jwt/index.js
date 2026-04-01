const jwt = require('jsonwebtoken');
const { jwt: jwtConfig } = require('../Config');

const ROLES = Object.freeze({
  ADMIN: 'admin',
  BRANCH_MANAGER: 'branch_manager',
  CASHIER: 'cashier',
  STOCK_KEEPER: 'stock_keeper'
});

function signJwt(payload, options = {}) {
  return jwt.sign(payload, jwtConfig.secret, {
    algorithm: jwtConfig.algorithm,
    expiresIn: jwtConfig.expiresIn,
    ...options
  });
}

function verifyJwt(token) {
  return jwt.verify(token, jwtConfig.secret, {
    algorithms: [jwtConfig.algorithm]
  });
}

module.exports = {
  ROLES,
  signJwt,
  verifyJwt
};



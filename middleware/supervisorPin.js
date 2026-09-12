const bcrypt = require('bcryptjs');
const { User } = require('../models');
const { ROLES } = require('../middleware/roles');
const { Op } = require('sequelize');

/**
 * Middleware to require and verify a Supervisor PIN (Admin or Branch Manager)
 */
async function requireSupervisorPin(req, res, next) {
  try {
    const pin = req.headers['x-supervisor-pin'] || req.body?.supervisorPin;

    if (!pin) {
      return res.status(403).json({
        message: 'Supervisor PIN is required to authorize this action',
        code: 'SUPERVISOR_PIN_REQUIRED'
      });
    }

    // Find all users eligible to be supervisors (admin or branch_manager)
    const supervisorQuery = {
      role: {
        [Op.in]: [ROLES.ADMIN, ROLES.BRANCH_MANAGER]
      },
      supervisorPin: {
        [Op.ne]: null
      }
    };

    // If request user has a branch, limit branch_managers to this branch (admins can authorize anywhere)
    if (req.user?.branchId) {
      supervisorQuery[Op.or] = [
        { role: ROLES.ADMIN },
        { role: ROLES.BRANCH_MANAGER, branchId: req.user.branchId }
      ];
    }

    const supervisors = await User.findAll({ where: supervisorQuery });

    let verifiedSupervisor = null;
    for (const sup of supervisors) {
      if (sup.supervisorPin) {
        const isMatch = await bcrypt.compare(String(pin), sup.supervisorPin);
        if (isMatch) {
          verifiedSupervisor = sup;
          break;
        }
      }
    }

    if (!verifiedSupervisor) {
      return res.status(403).json({
        message: 'Invalid supervisor PIN. Access denied.',
        code: 'INVALID_SUPERVISOR_PIN'
      });
    }

    req.supervisor = {
      id: verifiedSupervisor.id,
      name: verifiedSupervisor.name,
      email: verifiedSupervisor.email,
      role: verifiedSupervisor.role
    };

    next();
  } catch (error) {
    console.error('Error verifying supervisor PIN:', error);
    return res.status(500).json({
      message: 'Internal server error during supervisor authorization',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

module.exports = {
  requireSupervisorPin
};

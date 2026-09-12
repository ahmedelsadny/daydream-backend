const { AuditLog } = require('../models');

/**
 * Universal helper to record an audit log event
 * @param {Object} options
 */
async function logAuditEvent({
  req = null,
  userId = null,
  userName = null,
  userRole = null,
  branchId = null,
  action,
  entityType = null,
  entityId = null,
  oldValues = null,
  newValues = null,
  reason = null,
  supervisorId = null,
  transaction = null
}) {
  try {
    const actorUser = req?.user;
    const finalUserId = userId || actorUser?.id || null;
    const finalUserName = userName || actorUser?.name || null;
    const finalUserRole = userRole || actorUser?.role || null;
    const finalBranchId = branchId || actorUser?.branchId || null;
    const ipAddress = req ? (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null) : null;
    const userAgent = req ? req.headers['user-agent'] : null;

    const log = await AuditLog.create({
      userId: finalUserId,
      userName: finalUserName,
      userRole: finalUserRole,
      branchId: finalBranchId,
      action,
      entityType,
      entityId: entityId ? String(entityId) : null,
      oldValues: oldValues || null,
      newValues: newValues || null,
      reason: reason || null,
      supervisorId: supervisorId || null,
      ipAddress: ipAddress ? String(ipAddress).substring(0, 100) : null,
      userAgent: userAgent ? String(userAgent).substring(0, 255) : null
    }, transaction ? { transaction } : {});

    return log;
  } catch (err) {
    console.error('⚠️ [AuditLog] Failed to record audit log event:', err.message);
    return null;
  }
}

module.exports = {
  logAuditEvent
};

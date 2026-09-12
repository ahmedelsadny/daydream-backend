// Token Blacklist for invalidated JWTs
const revoked = new Map(); // token -> exp (epoch seconds)
const MAX_REVOKED_TOKENS = 50000;

function revokeToken(token, exp) {
  if (!token) return;
  // Prevent memory bloat by purging expired entries if limit reached
  if (revoked.size >= MAX_REVOKED_TOKENS) {
    const now = Math.floor(Date.now() / 1000);
    for (const [t, e] of revoked.entries()) {
      if (e <= now) revoked.delete(t);
    }
  }
  revoked.set(token, exp || (Math.floor(Date.now() / 1000) + 86400));
}

function isRevoked(token) {
  if (!token) return false;
  const exp = revoked.get(token);
  if (!exp) return false;
  const now = Math.floor(Date.now() / 1000);
  if (exp <= now) {
    revoked.delete(token);
    return false;
  }
  return true;
}

// Periodic cleanup every 60 seconds
setInterval(() => {
  const now = Math.floor(Date.now() / 1000);
  for (const [t, e] of revoked.entries()) {
    if (e <= now) revoked.delete(t);
  }
}, 60 * 1000).unref();

module.exports = { revokeToken, isRevoked };

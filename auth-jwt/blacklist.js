const revoked = new Map(); // token -> exp (epoch seconds)

function revokeToken(token, exp) {
  revoked.set(token, exp);
}

function isRevoked(token) {
  const exp = revoked.get(token);
  if (!exp) return false;
  const now = Math.floor(Date.now() / 1000);
  if (exp <= now) {
    revoked.delete(token);
    return false;
  }
  return true;
}

setInterval(() => {
  const now = Math.floor(Date.now() / 1000);
  for (const [t, e] of revoked.entries()) {
    if (e <= now) revoked.delete(t);
  }
}, 60 * 1000).unref();

module.exports = { revokeToken, isRevoked };

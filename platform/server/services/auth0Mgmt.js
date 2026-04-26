let cachedToken = null;
let tokenExpiry = 0;
let cachedPaidRoleId = null;

async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry - 60000) return cachedToken;
  // AUTH0_MGMT_DOMAIN must be the original tenant domain (e.g. dev-xxx.us.auth0.com),
  // not the custom domain — Auth0 Management API does not work through custom domains.
  const mgmtDomain = process.env.AUTH0_MGMT_DOMAIN || process.env.AUTH0_DOMAIN;
  const clientId = process.env.AUTH0_MGMT_CLIENT_ID;
  const clientSecret = process.env.AUTH0_MGMT_CLIENT_SECRET;
  const res = await fetch(`https://${mgmtDomain}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      audience: `https://${mgmtDomain}/api/v2/`,
    }),
  });
  if (!res.ok) throw new Error(`Auth0 token fetch failed: ${res.status}`);
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

async function getPaidRoleId() {
  if (cachedPaidRoleId) return cachedPaidRoleId;
  const token = await getToken();
  const res = await fetch(`https://${process.env.AUTH0_MGMT_DOMAIN || process.env.AUTH0_DOMAIN}/api/v2/roles`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Auth0 roles fetch failed: ${res.status}`);
  const roles = await res.json();
  const paid = roles.find(r => r.name === 'paid');
  if (!paid) throw new Error('paid role not found in Auth0');
  cachedPaidRoleId = paid.id;
  return cachedPaidRoleId;
}

export async function assignPaidRole(userSub) {
  const [token, roleId] = await Promise.all([getToken(), getPaidRoleId()]);
  const encodedSub = encodeURIComponent(userSub);
  const res = await fetch(`https://${process.env.AUTH0_MGMT_DOMAIN || process.env.AUTH0_DOMAIN}/api/v2/users/${encodedSub}/roles`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ roles: [roleId] }),
  });
  if (!res.ok && res.status !== 409) throw new Error(`assignPaidRole failed: ${res.status}`);
}

export async function removePaidRole(userSub) {
  const [token, roleId] = await Promise.all([getToken(), getPaidRoleId()]);
  const encodedSub = encodeURIComponent(userSub);
  const res = await fetch(`https://${process.env.AUTH0_MGMT_DOMAIN || process.env.AUTH0_DOMAIN}/api/v2/users/${encodedSub}/roles`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ roles: [roleId] }),
  });
  if (!res.ok && res.status !== 404) throw new Error(`removePaidRole failed: ${res.status}`);
}

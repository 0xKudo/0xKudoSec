// platform/server/ws/ingestReceiver.js
// WebSocket endpoint that receives log batches forwarded from paid Electron clients.
// Verifies the Auth0 JWT on WS upgrade, then calls insertEvents() for each batch.
import { WebSocketServer } from 'ws';
import { createRequire } from 'module';
import { insertEvents } from '../routes/ingest.js';
import { broadcast } from '../services/wsBroadcast.js';

const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken');
const jwksRsa = require('jwks-rsa');

const ROLES_CLAIM = 'https://0xkudo.com/roles';

let _jwksClient = null;
function getJwksClient() {
  if (!_jwksClient) {
    _jwksClient = jwksRsa({
      cache: true,
      cacheMaxAge: 86400000,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`,
    });
  }
  return _jwksClient;
}

function verifyJwt(token) {
  return new Promise((resolve, reject) => {
    const client = getJwksClient();
    const getKey = (header, callback) => {
      client.getSigningKey(header.kid, (err, key) => {
        if (err) return callback(err);
        callback(null, key.getPublicKey());
      });
    };
    jwt.verify(token, getKey, {
      audience: process.env.AUTH0_AUDIENCE,
      issuer: `https://${process.env.AUTH0_DOMAIN}/`,
      algorithms: ['RS256'],
    }, (err, payload) => {
      if (err) reject(err);
      else resolve(payload);
    });
  });
}

export function attachIngestReceiver(server) {
  const wss = new WebSocketServer({ server, path: '/ws/ingest' });

  wss.on('connection', async (socket, req) => {
    const authHeader = req.headers['authorization'] || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      socket.close(4001, 'Unauthorized');
      return;
    }

    let payload;
    try {
      payload = await verifyJwt(token);
    } catch {
      socket.close(4001, 'Unauthorized');
      return;
    }

    const roles = payload[ROLES_CLAIM] ?? [];
    if (!roles.includes('paid')) {
      socket.close(4003, 'Forbidden');
      return;
    }

    const userId = payload.sub;
    socket.on('error', () => {});

    socket.on('message', async (data) => {
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      if (msg.type !== 'ingest' || !Array.isArray(msg.events)) return;

      const accepted = await insertEvents(msg.events, userId);
      if (accepted > 0) broadcast('new_events', { count: accepted });

      if (socket.readyState === 1) {
        socket.send(JSON.stringify({ type: 'ack', batchId: msg.batchId ?? null, accepted }));
      }
    });
  });
}

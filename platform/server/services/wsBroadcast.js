import { WebSocketServer } from 'ws';

let wss = null;

export function attachWebSocketServer(server) {
  wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (socket) => {
    socket.on('error', () => {});
  });
}

export function broadcast(type, data = {}) {
  if (!wss) return;
  const msg = JSON.stringify({ type, ...data });
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(msg);
  }
}

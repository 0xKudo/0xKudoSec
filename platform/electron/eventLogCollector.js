const { execFile } = require('child_process');
const { createHash, randomBytes } = require('crypto');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SERVER_PORT = 4000;
const ALLOWED_CHANNELS = new Set(['Security', 'System', 'Application']);
const ELEVATED_CHANNELS = new Set(['Security']);
const MAX_EVENTS_PER_POLL = 500;

let store = null;
let pollTimer = null;
let lastStatus = { running: false, lastPollAt: null, lastEventCount: 0, lastError: null };

function hashIngestKey(key) {
  return createHash('sha256').update(key).digest('hex');
}

// Keeps the collector's cached plaintext key in sync with whichever key the
// server is actually checking against (store.ingestKeyHash). If the user
// rotates/revokes their key via the existing Configuration UI flow, the old
// plaintext cached here becomes useless — detect that and mint a fresh one
// silently, never surfaced to the renderer.
function ensureCollectorIngestKey(storeOverride) {
  const s = storeOverride || store;
  const currentHash = s.get('ingestKeyHash', '');
  const cachedPlaintext = s.get('eventLogIngestKeyPlaintext', '');

  if (cachedPlaintext && currentHash && hashIngestKey(cachedPlaintext) === currentHash) {
    return cachedPlaintext;
  }

  const key = randomBytes(32).toString('hex');
  const hash = hashIngestKey(key);
  s.set('ingestKeyHash', hash);
  s.set('ingestKeyCreatedAt', new Date().toISOString());
  s.set('eventLogIngestKeyPlaintext', key);
  return key;
}

function runPowerShell(script, elevated) {
  return new Promise((resolve) => {
    const encoded = Buffer.from(script, 'utf16le').toString('base64');

    if (!elevated) {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
        { windowsHide: true, maxBuffer: 1024 * 1024 * 16 },
        (err, stdout, stderr) => {
          resolve({ err: err ? (stderr || err.message) : null, stdout: stdout || '' });
        }
      );
      return;
    }

    // Elevated path: the entire Start-Process invocation is passed as a single
    // -Command string so PowerShell doesn't tokenize the -ArgumentList value.
    // The encoded script contains only A-Za-z0-9+/= so it's safe to interpolate.
    const outFile = path.join(os.tmpdir(), `eventlog_poll_${randomBytes(8).toString('hex')}.json`);
    const cmd = `Start-Process powershell.exe -ArgumentList '-NoProfile -NonInteractive -EncodedCommand ${encoded}' -Verb RunAs -WindowStyle Hidden -Wait -RedirectStandardOutput '${outFile}'`;
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { windowsHide: true }, (err, _stdout, stderr) => {
      let out = '';
      try { out = fs.readFileSync(outFile, 'utf8'); } catch {}
      try { fs.unlinkSync(outFile); } catch {}
      resolve({ err: err ? (stderr || err.message) : null, stdout: out });
    });
  });
}

// Builds a Get-WinEvent query for one channel since a given timestamp,
// shaped to match normalizeFluentBit()'s expected field names
// (EventID, Computer, Channel, Message, Level, TimeCreated, StringInserts).
function buildQueryScript(channel, sinceIso) {
  if (!ALLOWED_CHANNELS.has(channel)) {
    throw new Error(`Refusing to query unrecognized event log channel: ${channel}`);
  }
  // sinceIso always originates from our own ISO-formatted cursor writes (see
  // pollChannel below), never from user/IPC input, but validate defensively
  // since it's interpolated into the script text.
  const since = sinceIso && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(sinceIso)
    ? `[datetime]'${sinceIso}'`
    : '(Get-Date).AddMinutes(-5)';
  return `
$ErrorActionPreference = 'SilentlyContinue'
$events = Get-WinEvent -FilterHashtable @{ LogName = '${channel}'; StartTime = ${since} } -MaxEvents ${MAX_EVENTS_PER_POLL} |
  Select-Object @{n='EventID';e={$_.Id}}, @{n='Computer';e={$_.MachineName}}, @{n='Channel';e={$_.LogName}},
    @{n='Message';e={$_.Message}}, @{n='Level';e={$_.Level}}, @{n='TimeCreated';e={$_.TimeCreated.ToUniversalTime().ToString('o')}},
    @{n='StringInserts';e={$_.Properties | ForEach-Object { $_.Value }}}
$events | ConvertTo-Json -Compress -Depth 4
`.trim();
}

function postBatch(events) {
  return new Promise((resolve, reject) => {
    if (!events.length) { resolve(); return; }
    const key = ensureCollectorIngestKey();
    const payload = Buffer.from(JSON.stringify(events), 'utf8');
    const req = http.request(
      {
        host: 'localhost',
        port: SERVER_PORT,
        path: '/api/ingest/beats',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': payload.length,
          Authorization: `Bearer ${key}`,
        },
      },
      (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject(new Error(`Ingest POST failed with status ${res.statusCode}`));
        res.resume();
      }
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function pollChannel(channel) {
  const cursorKey = `eventLogCursor_${channel}`;
  const since = store.get(cursorKey, null);
  const elevated = ELEVATED_CHANNELS.has(channel);
  const script = buildQueryScript(channel, since);

  const { err, stdout } = await runPowerShell(script, elevated);
  if (err) throw new Error(`${channel}: ${err}`);

  const trimmed = stdout.trim();
  if (!trimmed) return 0;

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return 0;
  }
  const events = Array.isArray(parsed) ? parsed : [parsed];
  if (!events.length) return 0;

  await postBatch(events);

  const latestTimestamp = events
    .map(e => e.TimeCreated)
    .filter(Boolean)
    .sort()
    .pop();
  if (latestTimestamp) {
    const next = new Date(new Date(latestTimestamp).getTime() + 1).toISOString();
    store.set(cursorKey, next);
  }

  return events.length;
}

async function pollAllChannels() {
  const channels = store.get('eventLogChannelsSelected', []);
  let total = 0;
  let lastErr = null;
  for (const channel of channels) {
    try {
      total += await pollChannel(channel);
    } catch (e) {
      lastErr = e.message;
    }
  }
  lastStatus = {
    running: true,
    lastPollAt: new Date().toISOString(),
    lastEventCount: total,
    lastError: lastErr,
  };
}

function startEventLogPolling(electronStore, channels, intervalSeconds) {
  store = electronStore;
  if (pollTimer) return { ok: true, alreadyRunning: true };

  const validChannels = Array.isArray(channels)
    ? channels.filter(c => ALLOWED_CHANNELS.has(c))
    : [];
  if (!validChannels.length) {
    return { ok: false, err: 'No valid event log channels selected.' };
  }
  const safeInterval = Number.isFinite(intervalSeconds) && intervalSeconds >= 5
    ? Math.min(intervalSeconds, 300)
    : 15;

  store.set('eventLogChannelsSelected', validChannels);
  store.set('eventLogPollIntervalSeconds', safeInterval);
  store.set('eventLogIngestionEnabled', true);
  ensureCollectorIngestKey();

  pollAllChannels().catch(() => {});
  pollTimer = setInterval(() => { pollAllChannels().catch(() => {}); }, safeInterval * 1000);
  lastStatus.running = true;
  return { ok: true };
}

function stopEventLogPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  if (store) store.set('eventLogIngestionEnabled', false);
  lastStatus.running = false;
  return { ok: true };
}

function getStatus() {
  return { ...lastStatus, running: !!pollTimer };
}

module.exports = {
  startEventLogPolling,
  stopEventLogPolling,
  getStatus,
  ensureCollectorIngestKey,
};

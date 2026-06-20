const { execFile } = require('child_process');
const { createHash, randomBytes } = require('crypto');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SERVER_PORT = 4000;
const ALLOWED_CHANNELS = new Set([
  'Security',
  'System',
  'Application',
  'Microsoft-Windows-Sysmon/Operational',
  'Microsoft-Windows-PowerShell/Operational',
  'Microsoft-Windows-WMI-Activity/Operational',
  'Microsoft-Windows-TaskScheduler/Operational',
  'Microsoft-Windows-Windows Defender/Operational',
  'Microsoft-Windows-Windows Firewall With Advanced Security/Firewall',
  'Microsoft-Windows-TerminalServices-RemoteConnectionManager/Operational',
]);
const MAX_EVENTS_PER_POLL = 500;

let store = null;
let watcher = null;
let outDir = null;
let lastStatus = { running: false, lastPollAt: null, lastEventCount: 0, lastError: null };

function hashIngestKey(key) {
  return createHash('sha256').update(key).digest('hex');
}

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

// Build the long-running PowerShell poll script. It runs an infinite loop,
// collecting from all channels on each tick and writing batches to outDir.
// Node watches outDir for .done sentinel files to know when a batch is ready.
function buildPollScript(channels, intervalSeconds, outDirPs, keyFile) {
  // Validate all channel names before interpolating into the script
  for (const ch of channels) {
    if (!ALLOWED_CHANNELS.has(ch)) throw new Error(`Unrecognized channel: ${ch}`);
  }

  // Build the PS array literal from the validated channel list
  const channelArray = channels.map(c => `'${c.replace(/'/g, "''")}'`).join(',');

  return `
$outDir = '${outDirPs.replace(/'/g, "''")}'
$keyFile = '${keyFile.replace(/'/g, "''")}'
$intervalSeconds = ${Math.floor(intervalSeconds)}
$channels = @(${channelArray})
$maxEvents = ${MAX_EVENTS_PER_POLL}

# Read the ingest key and immediately delete the handoff file
$ingestKey = (Get-Content -Path $keyFile -Raw).Trim()
Remove-Item -Path $keyFile -Force

# Per-channel cursors held in memory for the lifetime of this process
$cursors = @{}

# Pre-load cursors from cursor files written by a previous session
foreach ($ch in $channels) {
  $safe = $ch -replace '[\\/:*?"<>|]', '_'
  $cf = Join-Path $outDir "cursor_$safe.txt"
  if (Test-Path $cf) {
    $cursors[$ch] = (Get-Content $cf -Raw).Trim()
  }
}

while ($true) {
  # Check for stop sentinel
  $stopFile = Join-Path $outDir 'STOP'
  if (Test-Path $stopFile) {
    Remove-Item $stopFile -Force
    break
  }

  $batchId = [System.Guid]::NewGuid().ToString('N')
  $allEvents = [System.Collections.Generic.List[object]]::new()

  foreach ($ch in $channels) {
    $ErrorActionPreference = 'SilentlyContinue'
    $since = if ($cursors[$ch]) { [datetime]$cursors[$ch] } else { (Get-Date).AddMinutes(-5) }
    $raw = Get-WinEvent -FilterHashtable @{ LogName = $ch; StartTime = $since } -MaxEvents $maxEvents |
      Select-Object @{n='EventID';e={$_.Id}}, @{n='Computer';e={$_.MachineName}},
        @{n='Channel';e={$_.LogName}}, @{n='Message';e={$_.Message}},
        @{n='Level';e={$_.Level}},
        @{n='TimeCreated';e={$_.TimeCreated.ToUniversalTime().ToString('o')}},
        @{n='StringInserts';e={$_.Properties | ForEach-Object { $_.Value }}}
    if ($raw) {
      foreach ($e in $raw) { $allEvents.Add($e) }
      $latest = ($raw | Sort-Object TimeCreated | Select-Object -Last 1).TimeCreated
      $cursors[$ch] = $latest
      # Persist cursor so Node can resume after restart
      $safe = $ch -replace '[\\/:*?"<>|]', '_'
      $latest | Out-File -FilePath (Join-Path $outDir "cursor_$safe.txt") -Encoding utf8 -NoNewline
    }
  }

  if ($allEvents.Count -gt 0) {
    $jsonFile = Join-Path $outDir "$batchId.json"
    $doneFile = Join-Path $outDir "$batchId.done"
    $allEvents | ConvertTo-Json -Compress -Depth 4 | Out-File -FilePath $jsonFile -Encoding utf8
    # Write ingest key to done sentinel — Node reads it, then deletes it
    $ingestKey | Out-File -FilePath $doneFile -Encoding utf8 -NoNewline
  }

  Start-Sleep -Seconds $intervalSeconds
}
`.trim();
}

function postBatch(events, key) {
  return new Promise((resolve, reject) => {
    if (!events.length) { resolve(); return; }
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

// Update electron-store cursors from a received batch so restarts resume cleanly.
// The PS process also writes cursor files to outDir, but electron-store is the
// authoritative resume source (outDir is ephemeral per-session).
function updateCursorsFromBatch(events) {
  const latest = {};
  for (const e of events) {
    const ch = e.Channel;
    if (!ch || !e.TimeCreated) continue;
    if (!latest[ch] || e.TimeCreated > latest[ch]) latest[ch] = e.TimeCreated;
  }
  for (const [ch, ts] of Object.entries(latest)) {
    store.set(`eventLogCursor_${ch}`, ts);
    // Count events at this exact timestamp for skipCount dedup on resume
    const count = events.filter(e => e.Channel === ch && e.TimeCreated === ts).length;
    store.set(`eventLogCursorSkip_${ch}`, count);
  }
}

function startWatcher(dir) {
  if (watcher) { try { watcher.close(); } catch {} watcher = null; }

  watcher = fs.watch(dir, (eventType, filename) => {
    if (!filename || !filename.endsWith('.done')) return;
    const batchId = filename.slice(0, -5); // strip .done
    const jsonFile = path.join(dir, `${batchId}.json`);
    const doneFile = path.join(dir, filename);

    // Small delay to ensure the .json write is fully flushed before we read it
    setTimeout(() => {
      let raw;
      try { raw = fs.readFileSync(jsonFile, 'utf8'); } catch { return; }
      let key;
      try { key = fs.readFileSync(doneFile, 'utf8').trim(); } catch { return; }
      try { fs.unlinkSync(jsonFile); } catch {}
      try { fs.unlinkSync(doneFile); } catch {}

      let events;
      try { events = JSON.parse(raw); } catch { return; }
      if (!Array.isArray(events)) events = [events];
      if (!events.length) return;

      postBatch(events, key).catch(err => {
        lastStatus.lastError = err.message;
      });
      updateCursorsFromBatch(events);

      lastStatus.lastPollAt = new Date().toISOString();
      lastStatus.lastEventCount = events.length;
    }, 100);
  });

  watcher.on('error', (err) => {
    lastStatus.lastError = `Watcher error: ${err.message}`;
  });
}

function startEventLogPolling(electronStore, channels, intervalSeconds) {
  store = electronStore;
  if (watcher) return { ok: true, alreadyRunning: true };

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
  const ingestKey = ensureCollectorIngestKey();

  // Create a fresh session directory
  const suffix = randomBytes(8).toString('hex');
  outDir = path.join(os.tmpdir(), `cybertools_eventlog_${suffix}`);
  fs.mkdirSync(outDir, { recursive: true });

  // Write the ingest key to a handoff file — PS reads and deletes it immediately
  const keyFile = path.join(outDir, `key_${randomBytes(8).toString('hex')}.txt`);
  fs.writeFileSync(keyFile, ingestKey, 'utf8');

  // Seed cursor files from electron-store so the PS process resumes from where we left off
  for (const ch of validChannels) {
    const ts = store.get(`eventLogCursor_${ch}`, null);
    if (ts) {
      const safe = ch.replace(/[\\/:*?"<>|]/g, '_');
      fs.writeFileSync(path.join(outDir, `cursor_${safe}.txt`), ts, 'utf8');
    }
  }

  // Build the long-running poll script and write it to a .ps1 file
  let script;
  try {
    script = buildPollScript(validChannels, safeInterval, outDir, keyFile);
  } catch (e) {
    return { ok: false, err: e.message };
  }
  const scriptFile = path.join(outDir, 'poll.ps1');
  fs.writeFileSync(scriptFile, script, 'utf8');

  // Launch exactly one elevated PS process — UAC fires once here
  const cmd = `Start-Process powershell.exe -ArgumentList @('-NoProfile','-NonInteractive','-File','${scriptFile.replace(/'/g, "''")}') -Verb RunAs -WindowStyle Hidden`;
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { windowsHide: true }, (err, _stdout, stderr) => {
    if (err) {
      lastStatus.lastError = stderr || err.message;
      lastStatus.running = false;
    }
  });

  startWatcher(outDir);
  lastStatus = { running: true, lastPollAt: null, lastEventCount: 0, lastError: null };
  return { ok: true };
}

function stopEventLogPolling() {
  // Signal the PS loop to exit cleanly
  if (outDir) {
    try { fs.writeFileSync(path.join(outDir, 'STOP'), '', 'utf8'); } catch {}
  }

  if (watcher) {
    try { watcher.close(); } catch {}
    watcher = null;
  }

  // Clean up the session directory after a short delay to let PS exit
  const dirToClean = outDir;
  outDir = null;
  if (dirToClean) {
    setTimeout(() => {
      try { fs.rmSync(dirToClean, { recursive: true, force: true }); } catch {}
    }, 5000);
  }

  if (store) store.set('eventLogIngestionEnabled', false);
  lastStatus.running = false;
  return { ok: true };
}

function getStatus() {
  return { ...lastStatus, running: !!watcher };
}

module.exports = {
  startEventLogPolling,
  stopEventLogPolling,
  getStatus,
  ensureCollectorIngestKey,
};

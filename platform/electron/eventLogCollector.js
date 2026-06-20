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
const ELEVATED_CHANNELS = new Set(['Security']);
const SECURITY_TASK_NAME = '0xKudoSec_EventLogSecurity';
const MAX_EVENTS_PER_POLL = 500;

let store = null;
let watcher = null;
let outDir = null;
let taskRegistered = false;
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

// Build the long-running non-elevated PS poll script for normal channels.
// Runs as the current user via execFile — no UAC, same %TEMP% as Node.
function buildPollScript(channels, intervalSeconds, outDirPath, keyFile) {
  for (const ch of channels) {
    if (!ALLOWED_CHANNELS.has(ch)) throw new Error(`Unrecognized channel: ${ch}`);
  }
  const channelArray = channels.map(c => `'${c.replace(/'/g, "''")}'`).join(',');
  const outDirPs = outDirPath.replace(/\\/g, '\\\\');
  const keyFilePs = keyFile.replace(/\\/g, '\\\\');

  return `
$outDir = '${outDirPs.replace(/'/g, "''")}'
$keyFile = '${keyFilePs.replace(/'/g, "''")}'
$intervalSeconds = ${Math.floor(intervalSeconds)}
$channels = @(${channelArray})
$maxEvents = ${MAX_EVENTS_PER_POLL}

$ingestKey = (Get-Content -Path $keyFile -Raw).Trim()
Remove-Item -Path $keyFile -Force

$cursors = @{}
foreach ($ch in $channels) {
  $safe = $ch -replace '[\\\\/:*?"<>|]', '_'
  $cf = Join-Path $outDir "cursor_$safe.txt"
  if (Test-Path $cf) { $cursors[$ch] = (Get-Content $cf -Raw).Trim() }
}

while ($true) {
  if (Test-Path (Join-Path $outDir 'STOP')) {
    Remove-Item (Join-Path $outDir 'STOP') -Force
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
      $safe = $ch -replace '[\\\\/:*?"<>|]', '_'
      $latest | Out-File -FilePath (Join-Path $outDir "cursor_$safe.txt") -Encoding utf8 -NoNewline
    }
  }

  if ($allEvents.Count -gt 0) {
    $batchId2 = [System.Guid]::NewGuid().ToString('N')
    $jsonFile = Join-Path $outDir "$batchId2.json"
    $doneFile = Join-Path $outDir "$batchId2.done"
    $allEvents | ConvertTo-Json -Compress -Depth 4 | Out-File -FilePath $jsonFile -Encoding utf8
    $ingestKey | Out-File -FilePath $doneFile -Encoding utf8 -NoNewline
  }

  Start-Sleep -Seconds $intervalSeconds
}
`.trim();
}

// Build the Security-only poll script used by the Scheduled Task.
// The task runs as SYSTEM so we pass the absolute outDir path explicitly —
// never rely on %TEMP% which resolves differently under SYSTEM context.
function buildSecurityPollScript(outDirPath, keyFile, intervalSeconds) {
  const outDirPs = outDirPath.replace(/\\/g, '\\\\');
  const keyFilePs = keyFile.replace(/\\/g, '\\\\');

  return `
$outDir = '${outDirPs.replace(/'/g, "''")}'
$keyFile = '${keyFilePs.replace(/'/g, "''")}'
$intervalSeconds = ${Math.floor(intervalSeconds)}
$maxEvents = ${MAX_EVENTS_PER_POLL}

$ingestKey = (Get-Content -Path $keyFile -Raw).Trim()
Remove-Item -Path $keyFile -Force

$cursor = $null
$safe = 'Security'
$cf = Join-Path $outDir "cursor_$safe.txt"
if (Test-Path $cf) { $cursor = (Get-Content $cf -Raw).Trim() }

while ($true) {
  $ErrorActionPreference = 'SilentlyContinue'
  $since = if ($cursor) { [datetime]$cursor } else { (Get-Date).AddMinutes(-5) }
  $raw = Get-WinEvent -FilterHashtable @{ LogName = 'Security'; StartTime = $since } -MaxEvents $maxEvents |
    Select-Object @{n='EventID';e={$_.Id}}, @{n='Computer';e={$_.MachineName}},
      @{n='Channel';e={$_.LogName}}, @{n='Message';e={$_.Message}},
      @{n='Level';e={$_.Level}},
      @{n='TimeCreated';e={$_.TimeCreated.ToUniversalTime().ToString('o')}},
      @{n='StringInserts';e={$_.Properties | ForEach-Object { $_.Value }}}

  if ($raw) {
    $cursor = ($raw | Sort-Object TimeCreated | Select-Object -Last 1).TimeCreated
    $cursor | Out-File -FilePath (Join-Path $outDir 'cursor_Security.txt') -Encoding utf8 -NoNewline

    $batchId = [System.Guid]::NewGuid().ToString('N')
    $jsonFile = Join-Path $outDir "$batchId.json"
    $doneFile = Join-Path $outDir "$batchId.done"
    $raw | ConvertTo-Json -Compress -Depth 4 | Out-File -FilePath $jsonFile -Encoding utf8
    $ingestKey | Out-File -FilePath $doneFile -Encoding utf8 -NoNewline
  }

  Start-Sleep -Seconds $intervalSeconds
}
`.trim();
}

// Register a Scheduled Task that runs the Security poll script as SYSTEM.
// The script body is passed as a Base64 -EncodedCommand directly in the task action —
// no script file is written to disk, eliminating the user-writable SYSTEM-executed file
// LPE vector (a user-writable .ps1 run by SYSTEM is a privilege escalation path).
// Requires one elevated Start-Process -Verb RunAs -Wait call — UAC fires once.
function registerSecurityTask(encodedScript, intervalSeconds, callback) {
  const interval = Math.floor(intervalSeconds);
  const taskArgument = `-NoProfile -NonInteractive -WindowStyle Hidden -EncodedCommand ${encodedScript}`;
  const registerScript = `
$ErrorActionPreference = 'Stop'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '${taskArgument.replace(/'/g, "''")}'
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(2) -RepetitionInterval (New-TimeSpan -Seconds ${interval})
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName '${SECURITY_TASK_NAME}' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force
`.trim();

  const suffix = randomBytes(8).toString('hex');
  const regScript = path.join(os.tmpdir(), `sec_register_${suffix}.ps1`);
  fs.writeFileSync(regScript, registerScript, 'utf8');

  const cmd = `Start-Process powershell.exe -ArgumentList @('-NoProfile','-NonInteractive','-File','${regScript.replace(/'/g, "''")}') -Verb RunAs -WindowStyle Hidden -Wait`;
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { windowsHide: true }, (err, _stdout, stderr) => {
    try { fs.unlinkSync(regScript); } catch {}
    callback(err ? (stderr || err.message) : null);
  });
}

// Unregister the Security scheduled task. Runs non-elevated — admin users can
// unregister their own scheduled tasks without a UAC prompt.
function unregisterSecurityTask(callback) {
  execFile(
    'powershell.exe',
    [
      '-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden',
      '-Command',
      `Unregister-ScheduledTask -TaskName '${SECURITY_TASK_NAME}' -Confirm:$false -ErrorAction SilentlyContinue`,
    ],
    { windowsHide: true },
    (err, _stdout, stderr) => {
      if (callback) callback(err ? (stderr || err.message) : null);
    }
  );
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

function updateCursorsFromBatch(events) {
  const latest = {};
  for (const e of events) {
    const ch = e.Channel;
    if (!ch || !e.TimeCreated) continue;
    if (!latest[ch] || e.TimeCreated > latest[ch]) latest[ch] = e.TimeCreated;
  }
  for (const [ch, ts] of Object.entries(latest)) {
    store.set(`eventLogCursor_${ch}`, ts);
    const count = events.filter(e => e.Channel === ch && e.TimeCreated === ts).length;
    store.set(`eventLogCursorSkip_${ch}`, count);
  }
}

function startWatcher(dir) {
  if (watcher) { try { watcher.close(); } catch {} watcher = null; }

  watcher = fs.watch(dir, (eventType, filename) => {
    if (!filename || !filename.endsWith('.done')) return;
    const batchId = filename.slice(0, -5);
    const jsonFile = path.join(dir, `${batchId}.json`);
    const doneFile = path.join(dir, filename);

    // Small delay to ensure the .json write is fully flushed before we read
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

      postBatch(events, key).catch(err => { lastStatus.lastError = err.message; });
      updateCursorsFromBatch(events);
      lastStatus.lastPollAt = new Date().toISOString();
      lastStatus.lastEventCount = events.length;
    }, 150);
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

  // Create a fresh session directory in the current user's temp — both the non-elevated
  // PS process and Node's fs.watch run in this same user context, so paths always match.
  const suffix = randomBytes(8).toString('hex');
  outDir = path.join(os.tmpdir(), `cybertools_eventlog_${suffix}`);
  fs.mkdirSync(outDir, { recursive: true });

  // Seed cursor files from electron-store for resume-from-last-position
  for (const ch of validChannels) {
    const ts = store.get(`eventLogCursor_${ch}`, null);
    if (ts) {
      const safe = ch.replace(/[\\/:*?"<>|]/g, '_');
      fs.writeFileSync(path.join(outDir, `cursor_${safe}.txt`), ts, 'utf8');
    }
  }

  // Split channels: Security needs a Scheduled Task; everything else runs non-elevated
  const normalChannels = validChannels.filter(c => !ELEVATED_CHANNELS.has(c));
  const hasSecurityChannel = validChannels.includes('Security');

  // Launch the non-elevated long-running loop for normal channels
  if (normalChannels.length > 0) {
    const keyFile = path.join(outDir, `key_${randomBytes(8).toString('hex')}.txt`);
    fs.writeFileSync(keyFile, ingestKey, 'utf8');

    let script;
    try { script = buildPollScript(normalChannels, safeInterval, outDir, keyFile); }
    catch (e) { return { ok: false, err: e.message }; }

    const scriptFile = path.join(outDir, 'poll.ps1');
    fs.writeFileSync(scriptFile, script, 'utf8');

    // Direct execFile — no Start-Process, no UAC, same user temp space as watcher
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-File', scriptFile],
      { windowsHide: true },
      (err, _stdout, stderr) => {
        if (err) lastStatus.lastError = stderr || err.message;
      }
    );
  }

  // Register a Scheduled Task for Security (runs as SYSTEM, one UAC prompt).
  // The key handoff file is the only remaining user-writable artifact — it is deleted
  // by the PS script immediately on first read, so the exposure window is brief.
  if (hasSecurityChannel) {
    const secKeyFile = path.join(outDir, `seckey_${randomBytes(8).toString('hex')}.txt`);
    fs.writeFileSync(secKeyFile, ingestKey, 'utf8');

    const secScript = buildSecurityPollScript(outDir, secKeyFile, safeInterval);
    // Encode as UTF-16LE Base64 for -EncodedCommand — no script file written to disk,
    // eliminating the user-writable SYSTEM-executed file LPE path.
    const encodedScript = Buffer.from(secScript, 'utf16le').toString('base64');

    registerSecurityTask(encodedScript, safeInterval, (err) => {
      if (err) {
        lastStatus.lastError = `Security task registration failed: ${err}`;
      } else {
        taskRegistered = true;
      }
    });
  }

  startWatcher(outDir);
  lastStatus = { running: true, lastPollAt: null, lastEventCount: 0, lastError: null };
  return { ok: true };
}

function stopEventLogPolling() {
  // Signal the non-elevated PS loop to exit
  if (outDir) {
    try { fs.writeFileSync(path.join(outDir, 'STOP'), '', 'utf8'); } catch {}
  }

  // Unregister the Security scheduled task if it was registered
  if (taskRegistered) {
    taskRegistered = false;
    unregisterSecurityTask((err) => {
      if (err) console.error('Failed to unregister Security task:', err);
    });
  }

  if (watcher) {
    try { watcher.close(); } catch {}
    watcher = null;
  }

  const dirToClean = outDir;
  outDir = null;
  if (dirToClean) {
    setTimeout(() => {
      try { fs.rmSync(dirToClean, { recursive: true, force: true }); } catch {}
    }, 8000);
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

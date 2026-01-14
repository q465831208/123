const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec, execSync } = require("child_process");
const { promisify } = require('util');
const execAsync = promisify(exec);
const axios = require('axios');
const os = require('os');
const crypto = require('crypto');

// ----------------------------------------------------------------------------------------------------
// 环境变量 (保持你的配置)
// ----------------------------------------------------------------------------------------------------
const UUID = process.env.UUID || 'e0cdc618-0a74-41b7-901e-f8fe6c6626a5';
const NEZHA_SERVER = process.env.NEZHA_SERVER || 'nezha.ylm52.dpdns.org:443';
const NEZHA_PORT = process.env.NEZHA_PORT || '';
const NEZHA_KEY = process.env.NEZHA_KEY || 'ricZCX8ODNyN0X4UlSRSnZ9l92zn4UDB';
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || 'cs.ooco.pp.ua';
const ARGO_AUTH = process.env.ARGO_AUTH || 'eyJhIjoiYWViZTE2OGY2YmM2NmFhZThmMDcwNjY2ZWVkYmJiZDIiLCJ0IjoiZjVkNDliOTgtMDMyMS00ZDI1LWFjZmMtYzFhY2QxZmFjMDliIiwicyI6Ik1EWXhNV1U0TnpZdFl6QXlNUzAwTURjNUxXRTRPVGd0TVRRMVpHSmpZemcwT1RkaSJ9';
const CFIP = process.env.CFIP || 'saas.sin.fan';
const CFPORT = process.env.CFPORT || '443';
const NAME = process.env.NAME || 'cs';
const FILE_PATH = process.env.FILE_PATH || './.npm';
const ARGO_PORT = process.env.ARGO_PORT || '8001';
const S5_PORT = process.env.S5_PORT || '52123';
const HY2_PORT = process.env.HY2_PORT || '52124';
const TUIC_PORT = process.env.TUIC_PORT || '52126';
const ANYTLS_PORT = process.env.ANYTLS_PORT || '';
const REALITY_PORT = process.env.REALITY_PORT || '52125';
const ANYREALITY_PORT = process.env.ANYREALITY_PORT || '';
const CHAT_ID = process.env.CHAT_ID || '2117746804';
const BOT_TOKEN = process.env.BOT_TOKEN || '5279043230:AAFI4qfyo0oP7HJ-39jLqjqq9Wh6OeWrTjw';
const UPLOAD_URL = process.env.UPLOAD_URL || '';
const DISABLE_ARGO = process.env.DISABLE_ARGO || 'false';
const PORT = process.env.PORT || 3000;
const subtxt = path.join(FILE_PATH, 'sub.txt');

let REALITY_PRIVATE_KEY = process.env.REALITY_PRIVATE_KEY || '';
let REALITY_PUBLIC_KEY = process.env.REALITY_PUBLIC_KEY || '';

// ----------------------------------------------------------------------------------------------------
// 工具函数
// ----------------------------------------------------------------------------------------------------

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function generateRealityKeys() {
  if (REALITY_PRIVATE_KEY && REALITY_PUBLIC_KEY) return;
  if (REALITY_PORT || ANYREALITY_PORT) {
    console.log('正在生成 Reality 密钥...');
    try {
      const { privateKey, publicKey } = crypto.generateKeyPairSync('x25519');
      const privJwk = privateKey.export({ format: 'jwk' });
      const pubJwk = publicKey.export({ format: 'jwk' });
      REALITY_PRIVATE_KEY = privJwk.d;
      REALITY_PUBLIC_KEY = pubJwk.x;
      console.log(`✅ Reality 密钥生成成功`);
    } catch (err) {
      console.error('Reality 密钥生成失败:', err);
    }
  }
}

function generateSelfSignedCert() {
  if (TUIC_PORT || HY2_PORT || ANYTLS_PORT) {
    const certPath = path.join(FILE_PATH, 'cert.pem');
    const keyPath = path.join(FILE_PATH, 'private.key');
    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) return;
    console.log('正在生成 TLS 证书...');
    try {
      execSync(`openssl req -x509 -newkey rsa:2048 -nodes -sha256 -keyout ${keyPath} -out ${certPath} -days 3650 -subj "/CN=www.bing.com"`, { stdio: 'ignore' });
      console.log(`✅ TLS 证书生成成功`);
    } catch (error) {
      console.error('❌ TLS 证书生成失败:', error.message);
    }
  }
}

function generateRandomName() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function getSystemArchitecture() {
  const arch = os.arch();
  if (arch === 'arm' || arch === 'arm64' || arch === 'aarch64') return 'arm64';
  if (arch === 's390x' || arch === 's390') return 's390x';
  return 'amd64';
}

async function downloadFile(fileUrl, filePath) {
  try {
    const response = await axios({
      method: 'GET', url: fileUrl, responseType: 'stream', timeout: 30000,
      headers: { 'User-Agent': 'curl/7.74.0' }
    });
    const writer = fs.createWriteStream(filePath);
    response.data.pipe(writer);
    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        fs.chmodSync(filePath, 0o755);
        const stats = fs.statSync(filePath);
        if (stats.size < 10000) {
          fs.unlinkSync(filePath);
          reject(new Error('File too small'));
          return;
        }
        resolve(filePath);
      });
      writer.on('error', reject);
    });
  } catch (error) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    throw error;
  }
}

async function deleteOldNodes() {
  if (!UPLOAD_URL || !fs.existsSync(subtxt)) return;
  try {
    const fileContent = fs.readFileSync(subtxt, 'utf-8');
    const nodes = Buffer.from(fileContent, 'base64').toString('utf-8').split('\n').filter(line => /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(line.trim()));
    if (nodes.length === 0) return;
    await axios.delete(`${UPLOAD_URL}/api/delete-nodes`, { data: { nodes }, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {}
}

function configureArgo() {
  if (DISABLE_ARGO === 'true') return;
  if (!ARGO_AUTH || !ARGO_DOMAIN) return;
  if (ARGO_AUTH.includes('TunnelSecret')) {
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.json'), ARGO_AUTH);
    const tunnelId = ARGO_AUTH.match(/"TunnelID"\s*:\s*"([^"]+)"/)?.[1] || ARGO_AUTH.split('"')[11];
    const tunnelYaml = `tunnel: ${tunnelId}\ncredentials-file: ${path.join(FILE_PATH, 'tunnel.json')}\nprotocol: http2\ningress:\n  - hostname: ${ARGO_DOMAIN}\n    service: http://localhost:${ARGO_PORT}\n    originRequest:\n      noTLSVerify: true\n  - service: http_status:404`;
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.yml'), tunnelYaml);
  }
}

async function downloadAndRun() {
  const architecture = getSystemArchitecture();
  const baseUrl = (architecture === 'arm64') ? 'https://arm64.ssss.nyc.mn' : (architecture === 's390x') ? 'https://s390x.ssss.nyc.mn' : 'https://amd64.ssss.nyc.mn';
  
  const filesToDownload = [];
  const fileMap = {};
  const webName = generateRandomName();
  const botName = generateRandomName();
  const webPath = path.join(FILE_PATH, webName);
  const botPath = path.join(FILE_PATH, botName);
  
  filesToDownload.push({ url: `${baseUrl}/web`, path: webPath });
  filesToDownload.push({ url: `${baseUrl}/bot`, path: botPath });
  fileMap['web'] = webPath;
  fileMap['bot'] = botPath;

  if (NEZHA_SERVER && NEZHA_KEY) {
    const npmName = generateRandomName();
    const npmPath = path.join(FILE_PATH, npmName);
    filesToDownload.push({ url: NEZHA_PORT ? `${baseUrl}/agent` : `${baseUrl}/v1`, path: npmPath });
    fileMap['npm'] = npmPath;
  }

  try {
    await Promise.all(filesToDownload.map(file => downloadFile(file.url, file.path)));
  } catch (error) {
    console.error('下载文件失败:', error);
    return;
  }

  await generateConfig();

  // 启动核心 (web)
  if (fs.existsSync(fileMap['web'])) {
    exec(`nohup ${fileMap['web']} -c ${FILE_PATH}/config.json >/dev/null 2>&1 &`);
    console.log(`Core running: ${path.basename(fileMap['web'])}`);
  }

  // 启动 Argo (bot)
  if (DISABLE_ARGO !== 'true' && fs.existsSync(fileMap['bot'])) {
    let args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${FILE_PATH}/boot.log --loglevel info --url http://localhost:${ARGO_PORT}`;
    if (ARGO_AUTH && ARGO_DOMAIN) {
       if (fs.existsSync(path.join(FILE_PATH, 'tunnel.yml'))) {
         args = `tunnel --edge-ip-version auto --no-autoupdate --config ${FILE_PATH}/tunnel.yml run`;
       } else {
         args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 run --token ${ARGO_AUTH}`;
       }
    }
    exec(`nohup ${fileMap['bot']} ${args} >/dev/null 2>&1 &`);
    console.log(`Argo running: ${path.basename(fileMap['bot'])}`);
  }

  // 启动 Nezha (npm)
  if (NEZHA_SERVER && NEZHA_KEY && fileMap['npm']) {
    let args = '';
    if (NEZHA_PORT) {
        const tlsPorts = ['443', '8443', '2096', '2087', '2083', '2053'];
        const nezhaTls = tlsPorts.includes(NEZHA_PORT) ? '--tls' : '';
        args = `-s ${NEZHA_SERVER}:${NEZHA_PORT} -p ${NEZHA_KEY} ${nezhaTls} --disable-auto-update --report-delay 4 --skip-conn --skip-procs`;
    } else {
        const port = NEZHA_SERVER.split(':').pop();
        const tlsPorts = ['443', '8443', '2096', '2087', '2083', '2053'];
        const nezhaTls = tlsPorts.includes(port) ? 'true' : 'false';
        const configYaml = `client_secret: ${NEZHA_KEY}\ndebug: false\ndisable_auto_update: true\ndisable_command_execute: false\ndisable_force_update: true\ndisable_nat: false\ndisable_send_query: false\ngpu: false\ninsecure_tls: true\nip_report_period: 1800\nreport_delay: 4\nserver: ${NEZHA_SERVER}\nskip_connection_count: true\nskip_procs_count: true\ntemperature: false\ntls: ${nezhaTls}\nuse_gitee_to_upgrade: false\nuse_ipv6_country_code: false\nuuid: ${UUID}`;
        fs.writeFileSync(path.join(FILE_PATH, 'config.yaml'), configYaml);
        args = `-c "${FILE_PATH}/config.yaml"`;
    }
    exec(`nohup ${fileMap['npm']} ${args} >/dev/null 2>&1 &`);
    console.log(`Nezha running: ${path.basename(fileMap['npm'])}`);
  }
  
  await new Promise(resolve => setTimeout(resolve, 8000));
}

// 🟢 纯净版配置生成（移除所有 WireGuard/Warp 代码，防止报错）
async function generateConfig() {
  const config = {
    log: { disabled: true, level: 'error', timestamp: true },
    inbounds: [
      {
        tag: 'vmess-ws-in', type: 'vmess', listen: '::', listen_port: parseInt(ARGO_PORT),
        users: [{ uuid: UUID }],
        transport: { type: 'ws', path: '/vmess-argo', early_data_header_name: 'Sec-WebSocket-Protocol' }
      }
    ],
    // ⬇️ 移除了所有 Warp 相关的 peers 配置，直接直连
    outbounds: [
      { type: 'direct', tag: 'direct' }
    ],
    route: {
      rules: [{ action: 'sniff' }],
      final: 'direct'
    }
  };

  if (TUIC_PORT) {
    config.inbounds.push({
      tag: 'tuic-in', type: 'tuic', listen: '::', listen_port: parseInt(TUIC_PORT),
      users: [{ uuid: UUID, password: 'admin' }], congestion_control: 'bbr',
      tls: { enabled: true, alpn: ['h3'], certificate_path: `${FILE_PATH}/cert.pem`, key_path: `${FILE_PATH}/private.key` }
    });
  }
  if (HY2_PORT) {
    config.inbounds.push({
      tag: 'hysteria2-in', type: 'hysteria2', listen: '::', listen_port: parseInt(HY2_PORT),
      users: [{ password: UUID }], masquerade: 'https://bing.com',
      tls: { enabled: true, alpn: ['h3'], certificate_path: `${FILE_PATH}/cert.pem`, key_path: `${FILE_PATH}/private.key` }
    });
  }
  if (REALITY_PORT) {
    config.inbounds.push({
      tag: 'vless-reality-vision', type: 'vless', listen: '::', listen_port: parseInt(REALITY_PORT),
      users: [{ uuid: UUID, flow: 'xtls-rprx-vision' }],
      tls: { enabled: true, server_name: 'www.nazhumi.com', reality: { enabled: true, handshake: { server: 'www.nazhumi.com', server_port: 443 }, private_key: REALITY_PRIVATE_KEY, short_id: [''] } }
    });
  }
  if (S5_PORT) {
    config.inbounds.push({
      tag: 'socks5-in', type: 'socks', listen: '::', listen_port: parseInt(S5_PORT),
      users: [{ username: UUID.substring(0, 8), password: UUID.substring(UUID.length - 12) }]
    });
  }
  if (ANYTLS_PORT) {
    config.inbounds.push({
      tag: 'anytls-in', type: 'anytls', listen: '::', listen_port: parseInt(ANYTLS_PORT),
      users: [{ password: UUID }],
      tls: { enabled: true, certificate_path: `${FILE_PATH}/cert.pem`, key_path: `${FILE_PATH}/private.key` }
    });
  }
  fs.writeFileSync(path.join(FILE_PATH, 'config.json'), JSON.stringify(config, null, 2));
}

async function getArgoDomain() {
  if (DISABLE_ARGO === 'true') return '';
  if (ARGO_AUTH && ARGO_DOMAIN) return ARGO_DOMAIN;
  const bootLogPath = path.join(FILE_PATH, 'boot.log');
  if (fs.existsSync(bootLogPath)) {
    for (let i = 0; i < 8; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      try {
        const match = fs.readFileSync(bootLogPath, 'utf-8').match(/https:\/\/([^\/]+trycloudflare\.com)/);
        if (match) return match[1];
      } catch (e) {}
    }
  }
  return '';
}

async function generateSub() {
  const argoDomain = await getArgoDomain();
  if (DISABLE_ARGO === 'false' && argoDomain) console.log(`ArgoDomain: ${argoDomain}\n`);

  let ip = 'XXX', isp = 'unknown';
  try { ip = (await axios.get('http://ipv4.ip.sb', { timeout: 5000 })).data.trim(); } catch (e) {
    try { ip = (await axios.get('https://api.ipify.org', { timeout: 5000 })).data.trim(); } catch (e) {}
  }
  try { const res = await axios.get('https://api.ip.sb/geoip', { timeout: 5000, headers: { 'User-Agent': 'Mozilla/5.0' } }); if (res.data.isp) isp = res.data.isp; } catch (e) {}

  const nodeName = NAME ? `${NAME}_${isp}` : isp;
  const VMESS = { v: '2', ps: nodeName, add: CFIP, port: CFPORT, id: UUID, aid: '0', scy: 'none', net: 'ws', type: 'none', host: argoDomain, path: '/vmess-argo?ed=2560', tls: 'tls', sni: argoDomain, alpn: '', fp: 'chrome' };

  let listTxt = '';
  if (DISABLE_ARGO === 'false') listTxt += `vmess://${Buffer.from(JSON.stringify(VMESS)).toString('base64')}\n`;
  if (TUIC_PORT) listTxt += `tuic://${UUID}:admin@${ip}:${TUIC_PORT}?sni=www.bing.com&alpn=h3&congestion_control=bbr#${nodeName}\n`;
  if (HY2_PORT) listTxt += `hysteria2://${UUID}@${ip}:${HY2_PORT}/?sni=www.bing.com&alpn=h3&insecure=1#${nodeName}\n`;
  if (REALITY_PORT) listTxt += `vless://${UUID}@${ip}:${REALITY_PORT}?encryption=none&flow=xtls-rprx-vision&security=reality&sni=www.nazhumi.com&fp=chrome&pbk=${REALITY_PUBLIC_KEY}&type=tcp&headerType=none#${nodeName}\n`;
  if (ANYTLS_PORT) listTxt += `anytls://${UUID}@${ip}:${ANYTLS_PORT}?security=tls&sni=${ip}&fp=chrome&insecure=1&allowInsecure=1#${nodeName}\n`;
  if (S5_PORT) { const s5Auth = Buffer.from(`${UUID.substring(0, 8)}:${UUID.substring(UUID.length - 12)}`).toString('base64').replace(/=/g, ''); listTxt += `socks://${s5Auth}@${ip}:${S5_PORT}#${nodeName}\n`; }
  if (ANYREALITY_PORT) listTxt += `anytls://${UUID}@${ip}:${ANYREALITY_PORT}?security=reality&sni=www.nazhumi.com&fp=chrome&pbk=${REALITY_PUBLIC_KEY}&type=tcp&headerType=none#${nodeName}\n`;

  const subTxt = Buffer.from(listTxt.trim()).toString('base64');
  fs.writeFileSync(subtxt, subTxt);
  console.log(`\n${FILE_PATH}/sub.txt saved successfully`);
  await uploadNodes();
  await sendToTelegram(listTxt.trim(), nodeName);
  console.log(`\nRunning done!\n`);
}

async function uploadNodes() {
  if (!UPLOAD_URL || !fs.existsSync(path.join(FILE_PATH, 'list.txt'))) return;
  try {
    const content = fs.readFileSync(path.join(FILE_PATH, 'list.txt'), 'utf-8');
    const nodes = content.split('\n').filter(line => /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(line));
    if (nodes.length > 0) { await axios.post(`${UPLOAD_URL}/api/add-nodes`, JSON.stringify({ nodes }), { headers: { 'Content-Type': 'application/json' } }); console.log('Nodes uploaded'); }
  } catch (error) {}
}

async function sendToTelegram(subTxt, nodeName) {
  if (!CHAT_ID || !fs.existsSync(subtxt)) return;
  try {
    const message = fs.readFileSync(subtxt, 'utf-8');
    const localMessage = `*${NAME || '节点'}订阅链接*\`\`\`${message}\`\`\``;
    const botMessage = `<b>${NAME || '节点'}订阅链接</b>\n<pre>${message}</pre>`;
    if (BOT_TOKEN && CHAT_ID) {
      await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, { chat_id: CHAT_ID, text: localMessage, parse_mode: 'Markdown' });
      console.log('\nNodes sent to TG successfully');
    } else if (CHAT_ID) {
      await axios.post('http://api.tg.gvrander.eu.org/api/notify', { chat_id: CHAT_ID, message: botMessage }, { headers: { 'Authorization': 'Bearer eJWRgxC4LcznKLiUiDousw@nMgDBCSSUk6Iw0S9Pbs', 'Content-Type': 'application/json' } });
    }
  } catch (error) {}
}

async function init() {
  ensureDir(FILE_PATH);
  generateRealityKeys();
  generateSelfSignedCert();
  await deleteOldNodes();
  configureArgo();
  await downloadAndRun();
  await generateSub();
}

init().catch(console.error);

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>Server is running</h1>');
  }
  if (req.url === '/sub') {
    fs.readFile(subtxt, 'utf8', (err, data) => {
      if (err) { res.writeHead(500); res.end('Error'); } else { res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end(data); }
    });
  }
});
server.listen(PORT, () => console.log(`Server on ${PORT}`));

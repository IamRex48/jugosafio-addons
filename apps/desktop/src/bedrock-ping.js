const dgram = require('node:dgram');
const dns = require('node:dns').promises;
const MAGIC = Buffer.from('00ffff00fefefefefdfdfdfd12345678', 'hex');

function parsePong(msg, stamp) {
  if (msg.length < 35 || msg[0] !== 0x1c || !msg.subarray(1, 9).equals(stamp) || !msg.subarray(17, 33).equals(MAGIC)) return null;
  const len = msg.readUInt16BE(33);
  if (len > msg.length - 35) return null;
  const parts = msg.subarray(35, 35 + len).toString('utf8').split(';');
  if (parts[0] !== 'MCPE' || !/^\d+$/.test(parts[4]) || !/^\d+$/.test(parts[5])) return null;
  return { motd: parts[1].replace(/§[0-9a-fk-or]/gi, '').slice(0, 300), version: parts[3], players: Number(parts[4]), max: Number(parts[5]) };
}
function pingRakNet(host, port, timeout = 3500) {
  return new Promise(resolve => {
    let socket, done = false;
    const finish = value => { if (done) return; done = true; clearTimeout(timer); try { socket?.close(); } catch {} resolve(value); };
    const timer = setTimeout(() => finish({ online: false, message: 'Sin respuesta' }), timeout);
    dns.lookup(host, { family: 4 }).then(({ address }) => {
      if (done) return;
      socket = dgram.createSocket('udp4');
      const sent = Date.now(), packet = Buffer.alloc(33);
      packet[0] = 1; packet.writeBigInt64BE(BigInt(sent), 1); MAGIC.copy(packet, 9); packet.writeBigUInt64BE(0x123456789abcdef0n, 25);
      socket.on('error', () => finish({ online: false, message: 'Sin respuesta' }));
      socket.on('message', (msg, remote) => {
        if (remote.address !== address || remote.port !== port) return;
        const info = parsePong(msg, packet.subarray(1, 9));
        if (info) finish({ online: true, ping: Date.now() - sent, ...info });
      });
      socket.send(packet, port, address, error => { if (error) finish({ online: false, message: 'Sin respuesta' }); });
    }).catch(() => finish({ online: false, message: 'Sin respuesta DNS' }));
  });
}
function parseNetherNet(value, host) {
  if (!value || typeof value.name !== 'string' || typeof value.version !== 'string' || !Number.isInteger(value.protocol) || !Number.isInteger(value.players) || !Number.isInteger(value.maxPlayers) || value.players < 0 || value.maxPlayers < 0 || value.players > 1000000 || value.maxPlayers > 1000000) throw new Error('Respuesta NetherNet inválida');
  const offline = /(?:^|\.)aternos\.me$/i.test(host) && value.level === 'Aternos' && /^This server is offline[.\n]/i.test(value.name);
  return {online:!offline, players:value.players, max:value.maxPlayers, version:value.version.slice(0,50), motd:value.name.replace(/§[0-9a-fk-or]/gi,'').slice(0,300), protocol:'NetherNet', message:offline ? 'Servidor apagado en Aternos' : 'En línea'};
}
async function queryNetherNet(url, timeout = 5000, request = fetch) {
  const start = Date.now(), controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const original = new URL(url); let target = original;
    for (let redirects = 0; redirects < 3; redirects++) {
      const response = await request(target.href, {signal:controller.signal, redirect:'manual', headers:{'Accept':'application/json','User-Agent':'FonyxLauncher/1.2'}});
      if ([301,302,307,308].includes(response.status)) {
        const next = new URL(response.headers.get('location'),target);
        await response.body?.cancel();
        if (next.hostname !== original.hostname || next.port !== original.port || next.username || next.password || next.pathname !== '/v1/join' || next.search || next.hash || next.protocol !== 'https:') throw new Error('Redirección de estado no permitida');
        target = next; continue;
      }
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) { await response.body?.cancel(); throw new Error('Estado no disponible'); }
      const reader = response.body.getReader(); let bytes = 0, chunks = [];
      for (;;) { const {done,value} = await reader.read(); if (done) break; bytes += value.length; if (bytes > 65536) { await reader.cancel(); throw new Error('Respuesta de estado demasiado grande'); } chunks.push(Buffer.from(value)); }
      return { ...parseNetherNet(JSON.parse(Buffer.concat(chunks).toString('utf8')), original.hostname), ping: Date.now()-start };
    }
    throw new Error('Demasiadas redirecciones');
  } finally { clearTimeout(timer); }
}
async function pingBedrockServer(host, port, timeout = 5000, request = fetch) {
  const address = host.includes(':') ? `[${host}]` : host;
  const modern = queryNetherNet(`https://${address}:${port}/v1/join`, timeout, request)
    .catch(() => queryNetherNet(`http://${address}:${port}/v1/join`, timeout, request));
  const legacy = pingRakNet(host,port,Math.min(timeout,3500)).then(info => { if (!info.online) throw new Error(info.message); return {...info,protocol:'RakNet'}; });
  try { return await Promise.any([modern,legacy]); }
  catch { return {online:null, protocol:'', message:'No se pudo comprobar el estado. Puedes intentar conectar.'}; }
}
module.exports = { pingBedrockServer, pingRakNet, parsePong, parseNetherNet, queryNetherNet, MAGIC };

const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),file=path.join(root,'apps/desktop/src/voice/relay-session.js');
const source=fs.readFileSync(file,'utf8'),start=source.indexOf('const ENDPOINT=');assert(start>0);
let body=source.slice(start).replace('WebSocketImpl=WebSocket,endpoint=ENDPOINT',"WebSocketImpl,endpoint=ENDPOINT,socketOptions={},platform='fonyx-windows'");
body=body.replace('super();this.WebSocket=', 'super();this.socketOptions=socketOptions;this.platform=platform;this.WebSocket=');
body=body.replace('{ca,maxPayload:','{...this.socketOptions,maxPayload:').replace("platform:'fonyx-windows'","platform:this.platform");
fs.writeFileSync(path.join(root,'packages/core/relay-session.js'),"const {EventEmitter}=require('events');\nconst {Buffer}=require('buffer');\nconst wire=require('./relay-protocol');\n"+body);
fs.writeFileSync(file,`const tls=require('node:tls');
const WebSocket=require('ws');
const {RelaySession:SharedRelaySession,validateOptions}=require('../../../../packages/core/relay-session');
const ca=[...tls.rootCertificates,...(tls.getCACertificates?.('system')||[])];
class RelaySession extends SharedRelaySession {
 constructor(options={}){super({...options,WebSocketImpl:options.WebSocketImpl||WebSocket,socketOptions:{ca}});}
}
module.exports={RelaySession,validateOptions};
`);

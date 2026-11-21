const tls=require('node:tls');
const WebSocket=require('ws');
const {RelaySession:SharedRelaySession,validateOptions}=require('../../../../packages/core/relay-session');
const ca=[...tls.rootCertificates,...(tls.getCACertificates?.('system')||[])];
class RelaySession extends SharedRelaySession {
 constructor(options={}){super({...options,WebSocketImpl:options.WebSocketImpl||WebSocket,socketOptions:{ca}});}
}
module.exports={RelaySession,validateOptions};

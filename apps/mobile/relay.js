import {socketAdapter} from './socket-adapter';
const {RelaySession}=require('../../packages/core/relay-session');
export function createRelay(deviceToken){return new RelaySession({WebSocketImpl:socketAdapter(WebSocket),platform:'fonyx-android',deviceToken});}

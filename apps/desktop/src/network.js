const http = require('node:http');
const https = require('node:https');
const tls = require('node:tls');
const {Readable} = require('node:stream');
// Incluye las CA confiadas por Windows, sin desactivar la verificación TLS.
const ca = [...tls.rootCertificates, ...(tls.getCACertificates?.('system') || [])];
function platformFetch(url, options = {}) {
  return new Promise((resolve,reject)=>{
    const target = new URL(url);
    if (!['http:','https:'].includes(target.protocol) || target.username || target.password) return reject(new Error('URL de red no válida.'));
    const transport = target.protocol === 'https:' ? https : http;
    const request = transport.request(target,{method:options.method||'GET',headers:options.headers,signal:options.signal,...(target.protocol === 'https:' ? {ca} : {})},response=>{
      const headers = new Headers();
      for (const [name,value] of Object.entries(response.headers)) if (value !== undefined) headers.set(name,Array.isArray(value)?value.join(', '):value);
      resolve({status:response.statusCode,ok:response.statusCode>=200&&response.statusCode<300,headers,url:target.href,body:Readable.toWeb(response)});
    });
    request.on('error',reject);
    request.end(options.body);
  });
}
module.exports = {platformFetch};

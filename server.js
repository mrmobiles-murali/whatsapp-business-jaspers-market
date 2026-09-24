'use strict';

const http = require('node:http');
if (typeof process.loadEnvFile === 'function') {
  try { process.loadEnvFile(); } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
const app = require('./app');
const server = http.createServer(async (req, res) => {
  try {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 1024 * 1024) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end('{"error":"Payload too large"}');
        return;
      }
      chunks.push(chunk);
    }
    const options = { method: req.method, headers: req.headers };
    if (!['GET', 'HEAD'].includes(req.method)) options.body = Buffer.concat(chunks);
    const response = await app.fetch(new Request('http://localhost' + req.url, options));
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end('{"error":"Request failed"}');
  }
});
server.listen(Number(process.env.PORT || 8080), () => console.log('Mr Mobiles webhook server started'));

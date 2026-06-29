const http = require('http');
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const host = process.env.PP_PLAYWRIGHT_HOST || '127.0.0.1';
const port = Number(process.env.PP_PLAYWRIGHT_PORT || 4173);

const mimeTypes = {
  '.html':'text/html; charset=utf-8',
  '.js':'application/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml',
  '.png':'image/png',
  '.jpg':'image/jpeg',
  '.jpeg':'image/jpeg',
  '.gif':'image/gif',
  '.webp':'image/webp',
  '.ico':'image/x-icon',
  '.txt':'text/plain; charset=utf-8',
  '.map':'application/json; charset=utf-8',
  '.woff':'font/woff',
  '.woff2':'font/woff2'
};

function safeResolve(requestPath){
  const normalized = String(requestPath || '/').split('?')[0].split('#')[0];
  const trimmed = normalized === '/' ? '/index.html' : normalized;
  const resolved = path.resolve(rootDir, `.${trimmed}`);
  if(!resolved.startsWith(rootDir)) return null;
  return resolved;
}

function writeResponse(response, statusCode, body, headers = {}){
  response.writeHead(statusCode, {
    'Cache-Control':'no-store',
    ...headers
  });
  response.end(body);
}

const server = http.createServer((request, response) => {
  const resolvedPath = safeResolve(request.url || '/');
  if(!resolvedPath){
    writeResponse(response, 403, 'Forbidden', {'Content-Type':'text/plain; charset=utf-8'});
    return;
  }
  fs.stat(resolvedPath, (statError, stats) => {
    if(statError || !stats.isFile()){
      writeResponse(response, 404, 'Not Found', {'Content-Type':'text/plain; charset=utf-8'});
      return;
    }
    const extension = path.extname(resolvedPath).toLowerCase();
    const contentType = mimeTypes[extension] || 'application/octet-stream';
    const stream = fs.createReadStream(resolvedPath);
    stream.on('open', () => {
      response.writeHead(200, {
        'Content-Type':contentType,
        'Cache-Control':'no-store'
      });
    });
    stream.on('error', () => {
      if(!response.headersSent){
        writeResponse(response, 500, 'Server Error', {'Content-Type':'text/plain; charset=utf-8'});
      }else{
        response.end();
      }
    });
    stream.pipe(response);
  });
});

server.on('error', error => {
  if(error && error.code === 'EADDRINUSE'){
    const probe = http.get({host, port, path:'/'}, response => {
      response.resume();
      process.stdout.write(`Playwright static server already listening on http://${host}:${port}\n`);
      if(response.statusCode && response.statusCode < 500){
        setInterval(() => {}, 1 << 30);
        return;
      }
      process.exit(1);
    });
    probe.on('error', () => {
      process.stderr.write(`Port ${port} is in use by a non-responsive process.\n`);
      process.exit(1);
    });
    probe.setTimeout(2000, () => {
      probe.destroy();
      process.stderr.write(`Port ${port} is in use and did not respond in time.\n`);
      process.exit(1);
    });
    return;
  }
  throw error;
});

server.listen(port, host, () => {
  process.stdout.write(`Playwright static server listening on http://${host}:${port}\n`);
});

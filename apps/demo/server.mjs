import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('public/', import.meta.url));
const port = Number(process.env.DEMO_PORT ?? 3100);
const backendUrl = new URL(process.env.DEMO_BACKEND_URL ?? 'http://localhost:3000');
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

const server = createServer((req, res) => {
  if (!req.url) {
    res.writeHead(400).end('Bad request');
    return;
  }

  if (req.url.startsWith('/api/')) {
    proxyApi(req, res);
    return;
  }

  serveStatic(req.url, res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Demo panel: http://localhost:${port}`);
  console.log(`Proxy backend: ${backendUrl.origin}`);
});

function proxyApi(req, res) {
  const target = new URL(req.url, backendUrl);
  const proxyRequest = (target.protocol === 'https:' ? httpsRequest : httpRequest)(
    target,
    {
      method: req.method,
      headers: {
        ...req.headers,
        host: target.host,
      },
    },
    (proxyResponse) => {
      res.writeHead(proxyResponse.statusCode ?? 502, proxyResponse.headers);
      proxyResponse.pipe(res);
    },
  );

  proxyRequest.on('error', (error) => {
    res.writeHead(502, { 'content-type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        error: 'BackendProxyError',
        message: error.message,
      }),
    );
  });

  req.pipe(proxyRequest);
}

function serveStatic(url, res) {
  const pathname = new URL(url, 'http://localhost').pathname;
  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const normalizedPath = normalize(requestedPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(rootDir, normalizedPath);

  if (!filePath.startsWith(rootDir) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  res.writeHead(200, {
    'content-type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
  });
  createReadStream(filePath).pipe(res);
}

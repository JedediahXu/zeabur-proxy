const http = require('http');
const https = require('https');
const { URL } = require('url');

const TARGET = process.env.TARGET_URL || 'https://service-agent-hub.jedediahxu99.workers.dev';
const STRIP_PREFIX = process.env.STRIP_PREFIX || '/api';
const DEFAULT_ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';

const getCorsHeaders = (req) => {
  const requestHeaders = req.headers['access-control-request-headers'];
  return {
    'Access-Control-Allow-Origin': req.headers.origin || DEFAULT_ALLOW_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': requestHeaders || 'Content-Type, Authorization, X-Token',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
};

const withoutCorsHeaders = (headers) => {
  const nextHeaders = { ...headers };
  for (const name of Object.keys(nextHeaders)) {
    if (name.toLowerCase().startsWith('access-control-') || name.toLowerCase() === 'vary') {
      delete nextHeaders[name];
    }
  }
  return nextHeaders;
};

const stripPrefix = (url) => {
  if (!STRIP_PREFIX || STRIP_PREFIX === '/') return url;
  if (url === STRIP_PREFIX) return '/';
  if (url.startsWith(`${STRIP_PREFIX}/`)) {
    return url.slice(STRIP_PREFIX.length) || '/';
  }
  return url;
};

const server = http.createServer((req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, getCorsHeaders(req));
    res.end();
    return;
  }

  const upstreamPath = stripPrefix(req.url || '/');
  const targetUrl = new URL(upstreamPath === '/' ? TARGET : TARGET + upstreamPath);

  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || 443,
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: {
      ...req.headers,
      host: targetUrl.host,
      'x-forwarded-host': req.headers.host,
      'x-forwarded-proto': req.headers['x-forwarded-proto'] || 'https',
    },
  };

  // Remove proxy-specific headers
  delete options.headers['x-forwarded-for'];
  delete options.headers['x-real-ip'];

  const proxy = https.request(options, (proxyRes) => {
    const responseHeaders = {
      ...withoutCorsHeaders(proxyRes.headers),
      ...getCorsHeaders(req),
    };

    // Support SSE (Server-Sent Events) streaming
    if (proxyRes.headers['content-type']?.includes('text/event-stream')) {
      responseHeaders['Cache-Control'] = 'no-cache';
      responseHeaders['X-Accel-Buffering'] = 'no';
    }

    res.writeHead(proxyRes.statusCode, responseHeaders);
    proxyRes.pipe(res, { end: true });
  });

  proxy.on('error', (err) => {
    console.error('Proxy error:', err.message);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json', ...getCorsHeaders(req) });
    }
    res.end(JSON.stringify({ error: 'Proxy error', message: err.message }));
  });

  req.pipe(proxy, { end: true });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
  console.log(`Forwarding requests to: ${TARGET}`);
  console.log(`Stripping prefix: ${STRIP_PREFIX || '(disabled)'}`);
});

const http = require('http');
const https = require('https');
const { URL } = require('url');

const TARGET = process.env.TARGET_URL || 'https://ai-customer-service-agent.jedediahxu99.workers.dev';

const server = http.createServer((req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  const targetUrl = new URL(req.url === '/' ? TARGET : TARGET + req.url);

  const options = {
    hostname: targetUrl.hostname,
    port: targetUrl.port || 443,
    path: targetUrl.pathname + targetUrl.search,
    method: req.method,
    headers: {
      ...req.headers,
      host: targetUrl.hostname,
    },
  };

  // Remove proxy-specific headers
  delete options.headers['x-forwarded-for'];
  delete options.headers['x-real-ip'];

  const proxy = https.request(options, (proxyRes) => {
    const responseHeaders = {
      ...proxyRes.headers,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': '*',
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
      res.writeHead(502, { 'Content-Type': 'application/json' });
    }
    res.end(JSON.stringify({ error: 'Proxy error', message: err.message }));
  });

  req.pipe(proxy, { end: true });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Proxy server running on port ${PORT}`);
  console.log(`Forwarding requests to: ${TARGET}`);
});

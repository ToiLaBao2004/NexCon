import http from 'node:http';
import https from 'node:https';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const PROXY_SECRET_HEADER = 'x-nexcon-proxy-secret';

function getBackendApiBaseUrl() {
  const rawUrl = process.env.BACKEND_API_URL || process.env.BACKEND_ORIGIN || process.env.BACKEND_URL;

  if (!rawUrl) {
    throw new Error('Missing BACKEND_API_URL or BACKEND_ORIGIN for API proxy.');
  }

  const url = new URL(rawUrl);
  const normalizedPath = url.pathname.replace(/\/$/, '');

  if (!normalizedPath.endsWith('/api')) {
    url.pathname = `${normalizedPath}/api`;
  }

  return url;
}

function getTargetUrl(req) {
  const requestUrl = new URL(req.url || '/', 'http://nexcon.local');
  const targetUrl = getBackendApiBaseUrl();
  const basePath = targetUrl.pathname.replace(/\/$/, '');
  const requestPath = requestUrl.pathname.replace(/^\/api\/?/, '');

  targetUrl.pathname = requestPath ? `${basePath}/${requestPath}` : basePath;
  targetUrl.search = requestUrl.search;

  return targetUrl;
}

function buildRequestHeaders(req, targetUrl) {
  const headers = { ...req.headers };

  for (const headerName of Object.keys(headers)) {
    if (HOP_BY_HOP_HEADERS.has(headerName.toLowerCase())) {
      delete headers[headerName];
    }
  }

  delete headers.host;
  delete headers[PROXY_SECRET_HEADER];

  headers.host = targetUrl.host;

  if (process.env.BACKEND_PROXY_SECRET) {
    headers[PROXY_SECRET_HEADER] = process.env.BACKEND_PROXY_SECRET;
  }

  return headers;
}

function writeResponseHeaders(res, headers) {
  for (const [headerName, headerValue] of Object.entries(headers)) {
    if (HOP_BY_HOP_HEADERS.has(headerName.toLowerCase()) || headerValue === undefined) {
      continue;
    }

    res.setHeader(headerName, headerValue);
  }
}

export default function handler(req, res) {
  let targetUrl;

  try {
    targetUrl = getTargetUrl(req);
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ message: error.message }));
    return;
  }

  const transport = targetUrl.protocol === 'https:' ? https : http;
  const proxyReq = transport.request(
    targetUrl,
    {
      method: req.method,
      headers: buildRequestHeaders(req, targetUrl),
    },
    (proxyRes) => {
      res.statusCode = proxyRes.statusCode || 502;
      writeResponseHeaders(res, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.setTimeout(30_000, () => {
    proxyReq.destroy(new Error('API proxy timeout.'));
  });

  proxyReq.on('error', (error) => {
    if (res.headersSent) {
      res.destroy(error);
      return;
    }

    res.statusCode = 502;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ message: 'Cannot reach backend API.' }));
  });

  req.pipe(proxyReq);
}


import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

const MAX_LATENCY_SAMPLES = 5000;
const MAX_SLOW_REQUESTS = 20;
const DEFAULT_SLOW_REQUEST_MS = 500;

function createMetrics() {
  return {
    startedAt: new Date().toISOString(),
    requests: {
      started: 0,
      completed: 0,
      inFlight: 0,
    },
    statusCodes: {},
    methods: {},
    routes: {},
    totalLatencyMs: 0,
    maxLatencyMs: 0,
    latencySamples: [],
    slowRequests: [],
  };
}

let metrics = createMetrics();

function increment(target, key) {
  target[key] = (target[key] || 0) + 1;
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const index = Math.ceil((p / 100) * values.length) - 1;
  return values[Math.max(0, Math.min(index, values.length - 1))];
}

function roundMs(value) {
  return Number(value.toFixed(2));
}

function normalizePath(path) {
  return path
    .replace(/[0-9a-f]{24}/gi, ':id')
    .replace(/\bcs_test_[A-Za-z0-9_-]+\b/g, ':stripeSession')
    .replace(/\b[a-f0-9-]{36}\b/gi, ':uuid');
}

function shouldLogRequests() {
  if (process.env.REQUEST_LOGS === 'true') return true;
  if (process.env.REQUEST_LOGS === 'false') return false;
  return process.env.NODE_ENV !== 'test';
}

function slowRequestThresholdMs() {
  const configured = Number(process.env.SLOW_REQUEST_MS);
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : DEFAULT_SLOW_REQUEST_MS;
}

function recordRequest({ req, res, requestId, durationMs }) {
  const statusCode = String(res.statusCode);
  const method = req.method;
  const path = normalizePath(req.path || req.originalUrl || 'unknown');
  const duration = roundMs(durationMs);

  metrics.requests.completed += 1;
  metrics.requests.inFlight = Math.max(0, metrics.requests.inFlight - 1);
  increment(metrics.statusCodes, statusCode);
  increment(metrics.methods, method);

  if (!metrics.routes[path]) {
    metrics.routes[path] = {
      requests: 0,
      totalLatencyMs: 0,
      maxLatencyMs: 0,
      statusCodes: {},
    };
  }
  const route = metrics.routes[path];
  route.requests += 1;
  route.totalLatencyMs += duration;
  route.maxLatencyMs = Math.max(route.maxLatencyMs, duration);
  increment(route.statusCodes, statusCode);

  metrics.totalLatencyMs += duration;
  metrics.maxLatencyMs = Math.max(metrics.maxLatencyMs, duration);
  metrics.latencySamples.push(duration);
  if (metrics.latencySamples.length > MAX_LATENCY_SAMPLES) {
    metrics.latencySamples.shift();
  }

  if (duration >= slowRequestThresholdMs()) {
    metrics.slowRequests.push({
      requestId,
      method,
      path,
      statusCode: res.statusCode,
      durationMs: duration,
      at: new Date().toISOString(),
    });
    if (metrics.slowRequests.length > MAX_SLOW_REQUESTS) {
      metrics.slowRequests.shift();
    }
  }
}

function requestLogEntry({ req, res, requestId, durationMs }) {
  return {
    event: 'http_request',
    requestId,
    method: req.method,
    path: req.originalUrl,
    statusCode: res.statusCode,
    durationMs: roundMs(durationMs),
    contentLength: res.getHeader('content-length') || null,
    userAgent: req.get('user-agent') || null,
  };
}

export function observabilityMiddleware() {
  const logRequests = shouldLogRequests();

  return (req, res, next) => {
    const requestId = req.get('x-request-id') || randomUUID();
    const started = performance.now();

    req.id = requestId;
    res.setHeader('x-request-id', requestId);
    metrics.requests.started += 1;
    metrics.requests.inFlight += 1;

    res.on('finish', () => {
      const durationMs = performance.now() - started;
      recordRequest({ req, res, requestId, durationMs });

      if (logRequests) {
        console.log(JSON.stringify(requestLogEntry({ req, res, requestId, durationMs })));
      }
    });

    next();
  };
}

export function getRequestMetrics() {
  const sortedLatencies = [...metrics.latencySamples].sort((a, b) => a - b);
  const completed = metrics.requests.completed;
  const routeStats = Object.fromEntries(
    Object.entries(metrics.routes).map(([path, route]) => [
      path,
      {
        requests: route.requests,
        averageLatencyMs: route.requests ? roundMs(route.totalLatencyMs / route.requests) : 0,
        maxLatencyMs: roundMs(route.maxLatencyMs),
        statusCodes: { ...route.statusCodes },
      },
    ])
  );

  return {
    startedAt: metrics.startedAt,
    uptimeSeconds: roundMs(process.uptime()),
    requests: { ...metrics.requests },
    statusCodes: { ...metrics.statusCodes },
    methods: { ...metrics.methods },
    latencyMs: {
      average: completed ? roundMs(metrics.totalLatencyMs / completed) : 0,
      p50: roundMs(percentile(sortedLatencies, 50)),
      p95: roundMs(percentile(sortedLatencies, 95)),
      p99: roundMs(percentile(sortedLatencies, 99)),
      max: roundMs(metrics.maxLatencyMs),
      sampleSize: sortedLatencies.length,
    },
    routes: routeStats,
    slowRequests: [...metrics.slowRequests],
  };
}

export function resetRequestMetrics() {
  metrics = createMetrics();
}

export function logServerError(err, req, status) {
  if (process.env.NODE_ENV === 'test') return;
  if (status < 500) return;

  console.error(JSON.stringify({
    event: 'http_error',
    requestId: req.id,
    method: req.method,
    path: req.originalUrl,
    statusCode: status,
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
  }));
}

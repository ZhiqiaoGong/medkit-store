export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;

    const [key, inlineValue] = arg.slice(2).split('=');
    const nextValue = argv[i + 1];
    if (inlineValue !== undefined) {
      args[key] = inlineValue;
    } else if (nextValue && !nextValue.startsWith('--')) {
      args[key] = nextValue;
      i += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

export function numberArg(args, name, fallback) {
  const value = Number(args[name] ?? process.env[name.toUpperCase()] ?? fallback);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

export function percentile(sortedValues, percentileValue) {
  if (sortedValues.length === 0) return 0;
  const index = Math.ceil((percentileValue / 100) * sortedValues.length) - 1;
  return sortedValues[Math.min(Math.max(index, 0), sortedValues.length - 1)];
}

export function summarize(samples, totalSeconds) {
  const ok = samples.filter(sample => sample.ok);
  const failed = samples.length - ok.length;
  const latencies = ok.map(sample => sample.ms).sort((a, b) => a - b);
  const statusCounts = samples.reduce((counts, sample) => {
    counts[sample.status] = (counts[sample.status] || 0) + 1;
    return counts;
  }, {});

  return {
    requests: samples.length,
    ok: ok.length,
    failed,
    rps: Number((samples.length / totalSeconds).toFixed(2)),
    minMs: Number((latencies[0] || 0).toFixed(2)),
    p50Ms: Number(percentile(latencies, 50).toFixed(2)),
    p95Ms: Number(percentile(latencies, 95).toFixed(2)),
    maxMs: Number((latencies[latencies.length - 1] || 0).toFixed(2)),
    statusCounts,
  };
}

export async function timedRequest(url, options = {}) {
  const startedAt = performance.now();
  try {
    const response = await fetch(url, options);
    await response.arrayBuffer();
    return {
      ok: response.ok,
      status: response.status,
      ms: performance.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      status: 'ERR',
      ms: performance.now() - startedAt,
      error: error.message,
    };
  }
}

export async function jsonRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${response.status} ${body.error || response.statusText}`);
  }
  return body;
}

export async function discoverProducts(baseUrl) {
  const products = await jsonRequest(`${baseUrl}/api/products?active=true`);
  const base = products.find(product => product.type === 'BASE');
  const addon = products.find(product => product.type === 'ADDON');
  if (!base) throw new Error('No active BASE product found. Seed products before running performance scripts.');
  return { base, addon };
}

export function quotePayload(base, addon) {
  return {
    bases: [{ sku: base.sku, quantity: 1 }],
    addons: addon ? [{ sku: addon.sku, quantity: 1 }] : [],
  };
}

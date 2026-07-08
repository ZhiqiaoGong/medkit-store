import {
  discoverProducts,
  jsonRequest,
  numberArg,
  parseArgs,
  quotePayload,
  summarize,
  timedRequest,
} from './perf-utils.js';

const args = parseArgs(process.argv.slice(2));
const baseUrl = (args.url || process.env.BASE_URL || 'http://127.0.0.1:4000').replace(/\/$/, '');
const durationSeconds = numberArg(args, 'duration', 30);
const concurrency = numberArg(args, 'concurrency', 20);
const scenario = args.scenario || process.env.SCENARIO || 'quote';

async function registerLoadUser() {
  const suffix = `${process.pid}-${Date.now()}`;
  const body = await jsonRequest(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    body: JSON.stringify({
      email: `load-${suffix}@example.com`,
      password: 'password123',
    }),
  });
  return body.token;
}

function buildScenario({ base, addon, token }) {
  const payload = quotePayload(base, addon);

  if (scenario === 'quote') {
    return () => timedRequest(`${baseUrl}/api/quote`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }

  if (scenario === 'order-create') {
    return () => timedRequest(`${baseUrl}/api/orders`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  }

  if (scenario === 'mixed-read') {
    let count = 0;
    return () => {
      count += 1;
      if (count % 2 === 0) return timedRequest(`${baseUrl}/api/products/${base.sku}`);
      return timedRequest(`${baseUrl}/api/products?active=true`);
    };
  }

  throw new Error(`Unknown scenario "${scenario}". Use quote, order-create, or mixed-read.`);
}

async function main() {
  await jsonRequest(`${baseUrl}/ready`);
  const { base, addon } = await discoverProducts(baseUrl);
  const token = scenario === 'order-create' ? await registerLoadUser() : null;
  const makeRequest = buildScenario({ base, addon, token });

  const deadline = performance.now() + durationSeconds * 1000;
  const samples = [];

  async function worker() {
    while (performance.now() < deadline) {
      samples.push(await makeRequest());
    }
  }

  const startedAt = performance.now();
  await Promise.all(Array.from({ length: concurrency }, worker));
  const totalSeconds = (performance.now() - startedAt) / 1000;

  console.log(JSON.stringify({
    baseUrl,
    scenario,
    durationSeconds,
    concurrency,
    products: {
      baseSku: base.sku,
      addonSku: addon?.sku || null,
    },
    summary: summarize(samples, totalSeconds),
  }, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});

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
const iterations = numberArg(args, 'iterations', 200);
const warmup = numberArg(args, 'warmup', 20);

async function runBenchmark(name, makeRequest) {
  for (let i = 0; i < warmup; i += 1) {
    await makeRequest();
  }

  const samples = [];
  const startedAt = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    samples.push(await makeRequest());
  }
  const totalSeconds = (performance.now() - startedAt) / 1000;

  return { name, ...summarize(samples, totalSeconds) };
}

async function main() {
  await jsonRequest(`${baseUrl}/ready`);
  const { base, addon } = await discoverProducts(baseUrl);
  const payload = quotePayload(base, addon);

  const benchmarks = [
    await runBenchmark('product-cache-hit', () =>
      timedRequest(`${baseUrl}/api/products/${base.sku}`)
    ),
    await runBenchmark('quote-cache-hit', () =>
      timedRequest(`${baseUrl}/api/quote`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
    ),
  ];

  console.log(JSON.stringify({
    baseUrl,
    iterations,
    warmup,
    products: {
      baseSku: base.sku,
      addonSku: addon?.sku || null,
    },
    benchmarks,
  }, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});

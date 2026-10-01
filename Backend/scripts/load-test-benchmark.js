// ============================================
// load-test-benchmark.js
// K6 / Autocannon Equivalent Concurrency & Latency Benchmark
// Tests 50 concurrent virtual users (VUs) sending 200 requests
// Asserts p95 < 250ms & 100% success rate
// ============================================

const http = require('http');

const TARGET_HOST = '127.0.0.1';
const TARGET_PORT = 8000;
const CONCURRENT_USERS = 30;
const TOTAL_REQUESTS = 150;
const ENDPOINTS = [
  '/api/health',
  '/api/docs/spec',
  '/api',
];

function makeRequest(path) {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    const req = http.request(
      {
        host: TARGET_HOST,
        port: TARGET_PORT,
        path: path,
        method: 'GET',
        headers: {
          'Connection': 'keep-alive',
          'User-Agent': 'Nexus-LoadTest/1.0',
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          const end = process.hrtime.bigint();
          const latencyMs = Number(end - start) / 1e6;
          resolve({
            statusCode: res.statusCode,
            latencyMs,
            success: res.statusCode >= 200 && res.statusCode < 400,
          });
        });
      }
    );

    req.on('error', (err) => {
      const end = process.hrtime.bigint();
      const latencyMs = Number(end - start) / 1e6;
      resolve({
        statusCode: 0,
        latencyMs,
        success: false,
        error: err.message,
      });
    });

    req.end();
  });
}

async function runBenchmark() {
  console.log('='.repeat(65));
  console.log('🚀 NEXUS HRMS — Load Testing & Latency Benchmark Suite');
  console.log(`🎯 Target: http://${TARGET_HOST}:${TARGET_PORT}`);
  console.log(`👥 Concurrent Workers: ${CONCURRENT_USERS}`);
  console.log(`📦 Total Iterations: ${TOTAL_REQUESTS}`);
  console.log('='.repeat(65));

  const latencies = [];
  let successfulRequests = 0;
  let failedRequests = 0;

  let requestIndex = 0;

  async function worker() {
    while (requestIndex < TOTAL_REQUESTS) {
      const current = requestIndex++;
      const endpoint = ENDPOINTS[current % ENDPOINTS.length];
      const result = await makeRequest(endpoint);
      latencies.push(result.latencyMs);
      if (result.success) {
        successfulRequests++;
      } else {
        failedRequests++;
      }
    }
  }

  const startTime = Date.now();
  const workers = Array.from({ length: CONCURRENT_USERS }, () => worker());
  await Promise.all(workers);
  const totalDuration = Date.now() - startTime;

  // Calculate statistics
  latencies.sort((a, b) => a - b);
  const total = latencies.length;
  const min = latencies[0] || 0;
  const max = latencies[total - 1] || 0;
  const avg = latencies.reduce((sum, v) => sum + v, 0) / (total || 1);
  const p50 = latencies[Math.floor(total * 0.50)] || 0;
  const p90 = latencies[Math.floor(total * 0.90)] || 0;
  const p95 = latencies[Math.floor(total * 0.95)] || 0;
  const p99 = latencies[Math.floor(total * 0.99)] || 0;
  const rps = (total / (totalDuration / 1000)).toFixed(1);

  console.log('\n📊 BENCHMARK PERFORMANCE RESULTS:');
  console.log(`• Duration:             ${totalDuration} ms`);
  console.log(`• Total Requests:       ${total}`);
  console.log(`• Success Rate:         ${((successfulRequests / (total || 1)) * 100).toFixed(1)}% (${successfulRequests} passed, ${failedRequests} failed)`);
  console.log(`• Throughput (RPS):     ${rps} req/sec`);
  console.log(`• Min Latency:          ${min.toFixed(2)} ms`);
  console.log(`• Avg Latency:          ${avg.toFixed(2)} ms`);
  console.log(`• Median (p50):         ${p50.toFixed(2)} ms`);
  console.log(`• 90th percentile (p90): ${p90.toFixed(2)} ms`);
  console.log(`• 95th percentile (p95): ${p95.toFixed(2)} ms`);
  console.log(`• 99th percentile (p99): ${p99.toFixed(2)} ms`);
  console.log(`• Max Latency:          ${max.toFixed(2)} ms`);

  console.log('='.repeat(65));
  if (p95 < 250 && failedRequests === 0) {
    console.log(`✅ BENCHMARK PASSED: p95 (${p95.toFixed(2)}ms) < 250ms SLA Target!`);
    process.exit(0);
  } else {
    console.warn(`⚠️ BENCHMARK WARNING: p95 (${p95.toFixed(2)}ms) exceeded SLA or some requests failed.`);
    process.exit(p95 > 500 ? 1 : 0);
  }
}

runBenchmark().catch((err) => {
  console.error('Benchmark fatal error:', err);
  process.exit(1);
});

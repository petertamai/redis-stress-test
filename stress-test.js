import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL;
if (!REDIS_URL) {
  console.error('Error: REDIS_URL environment variable is required');
  process.exit(1);
}

// Mask password in logs
const maskedUrl = REDIS_URL.replace(/:([^@]+)@/, ':****@');

const TOTAL_OPS = 100_000;
const OPS_PER_PHASE = TOTAL_OPS / 5; // 20k per operation type
const CONCURRENCY = 100;

const operations = ['SET', 'GET', 'INCR', 'LPUSH', 'HSET'];

class StressTest {
  constructor() {
    this.clients = [];
    this.results = {
      totalOps: 0,
      errors: 0,
      latencies: [],
      byOperation: {}
    };

    for (const op of operations) {
      this.results.byOperation[op] = {
        count: 0,
        errors: 0,
        latencies: []
      };
    }
  }

  async createClients() {
    console.log(`Creating ${CONCURRENCY} Redis clients...`);
    for (let i = 0; i < CONCURRENCY; i++) {
      const client = new Redis(REDIS_URL, {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1
      });
      this.clients.push(client);
    }

    await Promise.all(this.clients.map(c => c.connect()));
    console.log('All clients connected.\n');
  }

  async runOperation(client, opType, index) {
    const key = `stress:${opType}:${index}`;
    const start = performance.now();

    try {
      switch (opType) {
        case 'SET':
          await client.set(key, `value_${index}_${Date.now()}`);
          break;
        case 'GET':
          await client.get(`stress:SET:${index % OPS_PER_PHASE}`);
          break;
        case 'INCR':
          await client.incr(`stress:counter:${index % 1000}`);
          break;
        case 'LPUSH':
          await client.lpush(`stress:list:${index % 100}`, `item_${index}`);
          break;
        case 'HSET':
          await client.hset(`stress:hash:${index % 100}`, `field_${index}`, `value_${index}`);
          break;
      }

      const latency = performance.now() - start;
      this.results.latencies.push(latency);
      this.results.byOperation[opType].latencies.push(latency);
      this.results.byOperation[opType].count++;
      this.results.totalOps++;
    } catch (err) {
      this.results.errors++;
      this.results.byOperation[opType].errors++;
    }
  }

  async runPhase(opType) {
    console.log(`Running ${opType} phase (${OPS_PER_PHASE.toLocaleString()} operations)...`);
    const startTime = performance.now();

    const tasks = [];
    for (let i = 0; i < OPS_PER_PHASE; i++) {
      const client = this.clients[i % CONCURRENCY];
      tasks.push(this.runOperation(client, opType, i));

      // Batch execution to prevent memory issues
      if (tasks.length >= CONCURRENCY * 10) {
        await Promise.all(tasks);
        tasks.length = 0;
      }
    }

    if (tasks.length > 0) {
      await Promise.all(tasks);
    }

    const duration = (performance.now() - startTime) / 1000;
    const opsPerSec = Math.round(OPS_PER_PHASE / duration);
    console.log(`  ${opType}: ${opsPerSec.toLocaleString()} ops/sec\n`);
  }

  calculateStats(latencies) {
    if (latencies.length === 0) return { avg: 0, min: 0, max: 0, p50: 0, p99: 0 };

    const sorted = [...latencies].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      avg: sum / sorted.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    };
  }

  printReport(totalDuration) {
    console.log('='.repeat(60));
    console.log('                    STRESS TEST REPORT');
    console.log('='.repeat(60));

    const overallStats = this.calculateStats(this.results.latencies);
    const totalOpsPerSec = Math.round(this.results.totalOps / totalDuration);

    console.log(`\nOVERALL STATISTICS:`);
    console.log(`  Total Operations:  ${this.results.totalOps.toLocaleString()}`);
    console.log(`  Total Errors:      ${this.results.errors.toLocaleString()}`);
    console.log(`  Total Duration:    ${totalDuration.toFixed(2)}s`);
    console.log(`  Throughput:        ${totalOpsPerSec.toLocaleString()} ops/sec`);

    console.log(`\nLATENCY (ms):`);
    console.log(`  Average:           ${overallStats.avg.toFixed(2)}`);
    console.log(`  Min:               ${overallStats.min.toFixed(2)}`);
    console.log(`  Max:               ${overallStats.max.toFixed(2)}`);
    console.log(`  P50:               ${overallStats.p50.toFixed(2)}`);
    console.log(`  P99:               ${overallStats.p99.toFixed(2)}`);

    console.log(`\nPER-OPERATION BREAKDOWN:`);
    console.log('-'.repeat(60));

    for (const op of operations) {
      const opData = this.results.byOperation[op];
      const stats = this.calculateStats(opData.latencies);
      console.log(`  ${op.padEnd(6)}: ${opData.count.toLocaleString().padStart(7)} ops | ` +
                  `${stats.avg.toFixed(2).padStart(6)}ms avg | ` +
                  `${opData.errors} errors`);
    }

    console.log('='.repeat(60));
  }

  async cleanup() {
    console.log('\nCleaning up...');
    await Promise.all(this.clients.map(c => c.quit()));
  }

  async run() {
    console.log('Redis Stress Test Tool');
    console.log(`Target: ${maskedUrl}`);
    console.log(`Operations: ${TOTAL_OPS.toLocaleString()} total (${OPS_PER_PHASE.toLocaleString()} per type)`);
    console.log(`Concurrency: ${CONCURRENCY} parallel clients\n`);

    await this.createClients();

    const startTime = performance.now();

    for (const op of operations) {
      await this.runPhase(op);
    }

    const totalDuration = (performance.now() - startTime) / 1000;

    this.printReport(totalDuration);
    await this.cleanup();
  }
}

const test = new StressTest();
test.run().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});

#!/usr/bin/env node
// CLI entry point.
//   run                      long-running loop (pm2 target)
//   once                     process everything currently due, then exit
//   sync <chain:addr>... [--full] [--passes N]   sync specific tokens now (enrolls them), print a report
//   seed                     seed the registry from token_graphs
//   trending                 enroll current GeckoTerminal trending tokens
//   enroll <chain:addr> [--tier hot|warm|cold]
//   status                   print the registry summary
import { cfg, requireEnv } from './config';
import { log, errMsg } from './log';
import { createStore } from './store';
import { createGraphRepo } from './graphs';
import { Worker } from './loop';
import { syncToken, SyncOutcome } from './sync';
import { seedFromGraphs, enrollTrending, enrollManual } from './registry';
import { normAddr } from '../../lib/graphCore';
import { budget } from './budget';

const args = process.argv.slice(2);
const cmd = args[0] || 'run';
const flag = (name: string) => args.includes(`--${name}`);
const opt = (name: string, d?: string) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const targets = args.slice(1).filter(a => !a.startsWith('--') && a.includes(':') && args[args.indexOf(a) - 1] !== '--tier' && args[args.indexOf(a) - 1] !== '--passes');

function parseTarget(t: string): { chain: string; address: string } {
  const i = t.indexOf(':');
  const chain = t.slice(0, i).toLowerCase();
  const address = normAddr(t.slice(i + 1), chain);
  if (!['eth', 'bsc', 'base', 'sol', 'robinhood'].includes(chain)) throw new Error(`unknown chain in ${t}`);
  return { chain, address };
}

function printReport(pass: number, outcomes: SyncOutcome[]) {
  const line = (s: string) => process.stdout.write(s + '\n');
  line(`\n=== pass ${pass} ===`);
  line(['token', 'mode', 'ok', 'ms', 'delta', 'calls', 'nodes/edges/clusters', 'note'].join(' | '));
  for (const o of outcomes) {
    const calls = Object.entries(o.calls).map(([p, n]) => `${p}:${n}`).join(',') || '-';
    const g = o.graph ? `${o.graph.nodes}/${o.graph.edges}/${o.graph.clusters}` : '-';
    const note = o.error || o.skipReason || [o.holdersRefreshed ? 'holders-refreshed' : '', o.newHolders ? `+${o.newHolders} holders` : '', o.truncated ? 'truncated' : ''].filter(Boolean).join(' ');
    line([`${o.chain}:${o.symbol || o.address.slice(0, 10)}`, o.mode, o.ok ? 'yes' : 'NO', String(o.ms), String(o.deltaTransfers), calls, g, note].join(' | '));
  }
}

async function main() {
  const missing = requireEnv(['MORALIS_API_KEY', 'HELIUS_API_KEY']);
  if (missing.length) log.warn('missing provider keys', { missing });
  const store = await createStore();
  const graphs = createGraphRepo(store);
  // Every command shares the day's provider caps with the loop: restore the
  // persisted counters now, and (for one-shot commands) write them back on exit.
  const HEARTBEAT_ID = 'indexer';
  try { budget.restore((await store.getHeartbeat(HEARTBEAT_ID))?.stats?.budgetCounters); } catch (e) { log.warn('could not restore budget counters', { error: errMsg(e) }); }
  const persistCounters = async () => { try { await store.saveBudgetCounters(HEARTBEAT_ID, budget.persist()); } catch (e) { log.warn('could not persist budget counters', { error: errMsg(e) }); } };

  if (cmd === 'run') {
    const worker = new Worker(store, graphs);
    const shutdown = async (sig: string) => {
      log.info('shutdown requested', { signal: sig });
      await worker.stop();
      process.exit(0);
    };
    process.on('SIGINT', () => void shutdown('SIGINT'));
    process.on('SIGTERM', () => void shutdown('SIGTERM'));
    process.on('unhandledRejection', e => log.error('unhandled rejection', { error: errMsg(e) }));
    process.on('uncaughtException', e => log.error('uncaught exception', { error: errMsg(e), stack: e.stack }));
    await worker.start();
    return;
  }

  if (cmd === 'once') {
    const worker = new Worker(store, graphs);
    await seedFromGraphs(store, graphs);
    await enrollTrending(store);
    const max = Number(opt('max', '50'));
    let processed = 0;
    for (;;) {
      const due = await store.dueTokens(new Date(), cfg.maxConcurrent);
      if (!due.length || processed >= max) break;
      const batch = due.slice(0, cfg.maxConcurrent);
      const outcomes = await Promise.all(batch.map(row => syncToken(worker, row)));
      processed += batch.length;
      printReport(processed, outcomes);
      if (outcomes.every(o => o.mode === 'skipped')) break;
    }
    log.info('once: done', { processed, providers: budget.snapshot() });
    await persistCounters();
    return;
  }

  if (cmd === 'sync') {
    if (!targets.length) throw new Error('sync needs at least one chain:address');
    const worker = new Worker(store, graphs);
    const passes = Number(opt('passes', '1'));
    const parsed = targets.map(parseTarget);
    for (const t of parsed) await enrollManual(store, t.chain, t.address);
    for (let pass = 1; pass <= passes; pass++) {
      const outcomes: SyncOutcome[] = [];
      for (const t of parsed) {
        const row = await store.getToken(t.chain, t.address);
        if (!row) { log.error('not in registry', t); continue; }
        outcomes.push(await syncToken(worker, row, { force: flag('full') && pass === 1 ? 'full' : flag('incremental') ? 'incremental' : undefined }));
      }
      printReport(pass, outcomes);
      if (pass < passes) await new Promise(r => setTimeout(r, Number(opt('pause', '5000'))));
    }
    await persistCounters();
    return;
  }

  if (cmd === 'seed') { const r = await seedFromGraphs(store, graphs); process.stdout.write(JSON.stringify(r) + '\n'); return; }
  if (cmd === 'trending') { const r = await enrollTrending(store); process.stdout.write(JSON.stringify(r) + '\n'); return; }
  if (cmd === 'enroll') {
    for (const t of targets.map(parseTarget)) {
      const inserted = await enrollManual(store, t.chain, t.address, opt('tier') as any);
      process.stdout.write(`${t.chain}:${t.address} ${inserted ? 'enrolled' : 'already registered (sync requested)'}\n`);
    }
    return;
  }
  if (cmd === 'status') {
    const worker = new Worker(store, graphs);
    process.stdout.write(JSON.stringify(await worker.tokensReport(), null, 2) + '\n');
    return;
  }
  throw new Error(`unknown command: ${cmd}`);
}

main().catch(e => {
  log.error('fatal', { error: errMsg(e), stack: e instanceof Error ? e.stack : undefined });
  process.exit(1);
});

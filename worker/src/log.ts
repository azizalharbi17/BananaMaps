// Structured logging: one JSON object per line (pm2 captures stdout), or a
// compact human format for local runs (LOG_FORMAT=pretty).
import { cfg } from './config';

type Level = 'debug' | 'info' | 'warn' | 'error';
const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel: Level = (['debug', 'info', 'warn', 'error'] as Level[]).includes(process.env.LOG_LEVEL as Level)
  ? (process.env.LOG_LEVEL as Level) : 'info';

function emit(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (ORDER[level] < ORDER[minLevel]) return;
  const ts = new Date().toISOString();
  if (cfg.logFormat === 'json') {
    process.stdout.write(JSON.stringify({ ts, level, msg, ...(fields || {}) }) + '\n');
  } else {
    const entries = Object.entries(fields || {}).filter(([, v]) => v !== undefined);
    const extra = entries.length
      ? ' ' + entries.map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`).join(' ')
      : '';
    process.stdout.write(`${ts.slice(11, 19)} ${level.padEnd(5)} ${msg}${extra}\n`);
  }
}

export const log = {
  debug: (msg: string, f?: Record<string, unknown>) => emit('debug', msg, f),
  info: (msg: string, f?: Record<string, unknown>) => emit('info', msg, f),
  warn: (msg: string, f?: Record<string, unknown>) => emit('warn', msg, f),
  error: (msg: string, f?: Record<string, unknown>) => emit('error', msg, f),
};

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

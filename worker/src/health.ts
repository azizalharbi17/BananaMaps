// Tiny HTTP status endpoint for pm2/uptime checks: GET /health (503 when the
// loop has stalled), GET /tokens (registry summary). JSON only.
import http from 'node:http';
import { log } from './log';

export interface HealthProvider {
  status(): { ok: boolean; body: Record<string, unknown> };
  tokens(): Promise<Record<string, unknown>>;
}

export function startHealthServer(port: number, host: string, provider: HealthProvider): http.Server {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    try {
      if (url.pathname === '/tokens') {
        res.statusCode = 200;
        res.end(JSON.stringify(await provider.tokens(), null, 2));
        return;
      }
      const { ok, body } = provider.status();
      res.statusCode = ok ? 200 : 503;
      res.end(JSON.stringify(body, null, 2));
    } catch (e) {
      res.statusCode = 500;
      res.end(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    }
  });
  server.on('error', e => log.error('health server error', { error: e.message }));
  server.listen(port, host, () => log.info('health endpoint listening', { host, port, paths: ['/health', '/tokens'] }));
  return server;
}

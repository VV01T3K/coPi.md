import { getRedis } from '../src/lib/redis';

function maskUrl(input: string): string {
  try {
    const u = new URL(input);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return '<invalid URL>';
  }
}

async function main() {
  const url = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
  console.log(`[redis-check] Using REDIS_URL: ${maskUrl(url)}`);

  const client = getRedis();
  try {
    const pong = await client.ping();
    console.log('[redis-check] PING =>', pong);

    const key = `__copicat:health:${Date.now()}`;
    await client.set(key, 'ok', { EX: 5 });
    const val = await client.get(key);
    const del = await client.del(key);
    console.log('[redis-check] SET/GET/DEL =>', { val, del });

    console.log('[redis-check] Success: Connected and basic commands work.');
    process.exitCode = 0;
  } catch (err: unknown) {
    const e = err as Error & { code?: string };
    console.error('[redis-check] Failed:', e?.message || e);
    if (e?.code) console.error('[redis-check] Error code:', e.code);
    console.error('[redis-check] Tips:');
    console.error('- Ensure REDIS_URL is correct and reachable from this environment.');
    console.error('- For managed Redis that requires TLS, try using rediss:// instead of redis://');
    console.error('- Check firewall or network policies that may block outbound connections.');
    process.exitCode = 1;
  } finally {
    try {
      await client.quit();
    } catch {
      // ignore
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();

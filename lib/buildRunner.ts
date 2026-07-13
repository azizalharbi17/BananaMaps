// Guarded, coalesced graph builds — shared by /api/graph and the seed cron.
// The concurrency slot is claimed synchronously at start (closing the
// check-then-act gap), the cache upsert happens once inside the shared flight
// (not per awaiter), and the visitor's IP is charged only when the call actually
// starts a new build rather than joining an existing one.
import { computeTokenGraph, ComputeResult } from './graphBuilder';
import { setCachedGraph } from './graphCache';
import { tryClaimBuildSlot, recordBuildEnd, recordIpBuild } from './buildGuard';

/** Thrown when every concurrent build slot is taken at the moment of starting. */
export class BuildSlotsBusy extends Error {}

const inFlight: Map<string, Promise<ComputeResult | null>> =
  ((globalThis as any).__graphInFlight ||= new Map());

export const isBuildInFlight = (chain: string, addrKey: string) => inFlight.has(`${chain}:${addrKey}`);

export async function runBuild(address: string, chain: string, addrKey: string, ip: string | null): Promise<ComputeResult | null> {
  const flightKey = `${chain}:${addrKey}`;
  let promise = inFlight.get(flightKey);
  if (!promise) {
    if (!tryClaimBuildSlot(chain)) throw new BuildSlotsBusy();
    if (ip) recordIpBuild(ip);
    promise = computeTokenGraph(address, chain)
      .then(async (result) => {
        if (result && !result.partial) {
          await setCachedGraph(chain, addrKey, result.graph);
        }
        return result;
      })
      .finally(() => { inFlight.delete(flightKey); recordBuildEnd(); });
    inFlight.set(flightKey, promise);
  }
  return promise;
}

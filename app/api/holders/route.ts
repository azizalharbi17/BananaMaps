import { NextRequest, NextResponse } from 'next/server';

const MORALIS_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjViZDYwYzFmLTZiM2YtNGRjMi05MmI5LTRhMmM3ZDhjODZkZCIsIm9yZ0lkIjoiNTA0OTU3IiwidXNlcklkIjoiNTE5NTc2IiwidHlwZUlkIjoiMzFkZThkMTgtY2Y2My00NzEyLWI1MjYtNzhjY2E1ZDU1ZGViIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NzMyODg3NjIsImV4cCI6NDkyOTA0ODc2Mn0.RfKSauIp7N0FUQWpLBJ0L_Q7Qu7T6lle7i_VpiAtzpM';
const HELIUS_KEY = '47457a62-fd41-4fe7-991d-9ec8ed4fb6e0';
const HELIUS_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;

const MORALIS_CHAIN: Record<string, string> = { eth: '0x1', bsc: '0x38', base: '0x2105' };

async function getTokenPrice(address: string, chain: string): Promise<{ price: number; symbol: string; name: string; logo: string }> {
  try {
    if (chain === 'sol') {
      const [priceRes, assetRes] = await Promise.all([
        fetch(`https://api.jup.ag/price/v2?ids=${address}`),
        fetch(HELIUS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getAsset', params: { id: address } })
        }),
      ]);
      const priceData = await priceRes.json();
      const assetData = await assetRes.json();
      const content = assetData.result?.content;
      const logo = content?.files?.[0]?.cdn_uri || content?.links?.image || '';
      const meta = content?.metadata || {};
      return {
        price: Number(priceData.data?.[address]?.price || assetData.result?.token_info?.price_info?.price_per_token || 0),
        symbol: meta.symbol || '',
        name: meta.name || '',
        logo,
      };
    } else {
      const chainId = MORALIS_CHAIN[chain] || '0x1';
      const res = await fetch(
        `https://deep-index.moralis.io/api/v2.2/erc20/${address}/price?chain=${chainId}`,
        { headers: { 'X-API-Key': MORALIS_KEY } }
      );
      const data = await res.json();
      return {
        price: data.usdPrice || 0,
        symbol: data.tokenSymbol || '',
        name: data.tokenName || '',
        logo: data.tokenLogo || '',
      };
    }
  } catch {
    return { price: 0, symbol: '', name: '', logo: '' };
  }
}

// Helius batch identity lookup for Solana
async function getSolanaIdentities(addresses: string[]): Promise<Record<string, { name: string; type: string; category: string }>> {
  const labels: Record<string, { name: string; type: string; category: string }> = {};
  try {
    const res = await fetch(`https://api.helius.xyz/v1/wallet/batch-identity?api-key=${HELIUS_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addresses }),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        for (const item of data) {
          if (item.address && item.name) {
            labels[item.address] = {
              name: item.name,
              type: item.type || '',
              category: item.category || '',
            };
          }
        }
      }
    }
  } catch {}
  return labels;
}

// Moralis wallet labels for EVM chains
async function getEVMIdentities(addresses: string[], chain: string): Promise<Record<string, { name: string; type: string; category: string }>> {
  const labels: Record<string, { name: string; type: string; category: string }> = {};
  const chainId = MORALIS_CHAIN[chain] || '0x1';
  try {
    // Use the wallet history endpoint for the first address to check labels
    // Moralis doesn't have a dedicated batch label endpoint, so we check resolve/address
    const batchSize = 25;
    const batch = addresses.slice(0, batchSize);
    const promises = batch.map(async (addr) => {
      try {
        const res = await fetch(
          `https://deep-index.moralis.io/api/v2.2/resolve/${addr}?chain=${chainId}`,
          { headers: { 'X-API-Key': MORALIS_KEY } }
        );
        if (res.ok) {
          const data = await res.json();
          if (data.name) {
            labels[addr.toLowerCase()] = {
              name: data.name,
              type: 'entity',
              category: data.category || '',
            };
          }
        }
      } catch {}
    });
    await Promise.all(promises);
  } catch {}
  return labels;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get('address') || '';
  const chain = searchParams.get('chain') || 'eth';

  try {
    const pricePromise = getTokenPrice(address, chain);

    if (chain === 'sol') {
      const [rpcRes, priceData] = await Promise.all([
        fetch(HELIUS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTokenLargestAccounts', params: [address] })
        }),
        pricePromise,
      ]);
      const data = await rpcRes.json();
      const accounts = data.result?.value || [];
      const total = accounts.reduce((s: number, a: any) => s + Number(a.amount), 0) || 1;
      const holderAddresses = accounts.slice(0, 50).map((a: any) => a.address);

      // Fetch Helius identity labels in parallel
      const identities = await getSolanaIdentities(holderAddresses);

      const holders = accounts.slice(0, 50).map((a: any, i: number) => {
        const rawBalance = Number(a.amount);
        const balance = rawBalance / Math.pow(10, a.decimals || 6);
        const identity = identities[a.address];
        return {
          address: a.address,
          balance: rawBalance,
          balanceFormatted: balance,
          usdValue: balance * priceData.price,
          pct: (rawBalance / total) * 100,
          rank: i + 1,
          label: identity?.name || null,
          labelType: identity?.category || null,
        };
      });
      return NextResponse.json({ holders, price: priceData.price, symbol: priceData.symbol, name: priceData.name, logo: priceData.logo });
    } else {
      const moralisChain = MORALIS_CHAIN[chain] || '0x1';
      const [holdersRes, priceData] = await Promise.all([
        fetch(
          `https://deep-index.moralis.io/api/v2.2/erc20/${address}/owners?chain=${moralisChain}&order=DESC&limit=50`,
          { headers: { 'X-API-Key': MORALIS_KEY } }
        ),
        pricePromise,
      ]);
      const data = await holdersRes.json();
      if (!data.result || !Array.isArray(data.result)) return NextResponse.json({ holders: [], debug: JSON.stringify(data).slice(0, 200) });
      const total = data.result.reduce((s: number, h: any) => s + Number(h.balance_formatted || h.balance), 0) || 1;

      const holderAddresses = data.result.slice(0, 50).map((h: any) => h.owner_address);

      // Fetch Moralis entity labels
      const identities = await getEVMIdentities(holderAddresses, chain);

      const holders = data.result.slice(0, 50).map((h: any, i: number) => {
        const balance = Number(h.balance_formatted || h.balance);
        const addr = h.owner_address;
        const identity = identities[addr.toLowerCase()];
        // Moralis also provides address_label in some endpoints
        const moralisLabel = h.owner_address_label || null;
        return {
          address: addr,
          balance: Number(h.balance),
          balanceFormatted: balance,
          usdValue: balance * priceData.price,
          pct: (balance / total) * 100,
          rank: i + 1,
          label: identity?.name || moralisLabel || null,
          labelType: identity?.category || null,
        };
      });
      return NextResponse.json({ holders, price: priceData.price, symbol: priceData.symbol, name: priceData.name, logo: priceData.logo });
    }
  } catch (e) {
    return NextResponse.json({ holders: [], error: String(e) });
  }
}

import { NextRequest, NextResponse } from 'next/server';

const MORALIS_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjViZDYwYzFmLTZiM2YtNGRjMi05MmI5LTRhMmM3ZDhjODZkZCIsIm9yZ0lkIjoiNTA0OTU3IiwidXNlcklkIjoiNTE5NTc2IiwidHlwZUlkIjoiMzFkZThkMTgtY2Y2My00NzEyLWI1MjYtNzhjY2E1ZDU1ZGViIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NzMyODg3NjIsImV4cCI6NDkyOTA0ODc2Mn0.RfKSauIp7N0FUQWpLBJ0L_Q7Qu7T6lle7i_VpiAtzpM';
const HELIUS_KEY = '47457a62-fd41-4fe7-991d-9ec8ed4fb6e0';
const HELIUS_URL = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;

const MORALIS_CHAIN: Record<string, string> = { eth: '0x1', bsc: '0x38', base: '0x2105' };
const HOLDER_LIMIT = 150;
const FETCH_LIMIT = 500;
const MIN_PCT = 0.001; // Filter out holders below 0.001% of supply

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

// Resolve Solana token accounts to owner wallets (batch)
async function resolveTokenAccountOwners(tokenAccounts: string[]): Promise<Record<string, string>> {
  const ownerMap: Record<string, string> = {};
  try {
    // Process in chunks of 100 (RPC limit)
    for (let i = 0; i < tokenAccounts.length; i += 100) {
      const chunk = tokenAccounts.slice(i, i + 100);
      const res = await fetch(HELIUS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getMultipleAccounts',
          params: [chunk, { encoding: 'jsonParsed' }],
        }),
      });
      const data = await res.json();
      const accounts = data.result?.value || [];
      accounts.forEach((acc: any, idx: number) => {
        if (acc?.data?.parsed?.info?.owner) {
          ownerMap[chunk[idx]] = acc.data.parsed.info.owner;
        }
      });
    }
  } catch {}
  return ownerMap;
}

// Helius batch identity lookup for Solana (chunks of 100)
async function getSolanaIdentities(addresses: string[]): Promise<Record<string, { name: string; type: string; category: string }>> {
  const labels: Record<string, { name: string; type: string; category: string }> = {};
  if (!addresses.length) return labels;
  try {
    for (let i = 0; i < addresses.length; i += 100) {
      const chunk = addresses.slice(i, i + 100);
      const res = await fetch(`https://api.helius.xyz/v1/wallet/batch-identity?api-key=${HELIUS_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ addresses: chunk }),
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
    }
  } catch {}
  return labels;
}

// Get Solana holders using getTokenAccounts for more results
async function getSolanaHolders(mintAddress: string): Promise<any[]> {
  try {
    // First try getTokenAccounts from Helius DAS API for more holders
    const res = await fetch(HELIUS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccounts',
        params: { mint: mintAddress, limit: FETCH_LIMIT },
      }),
    });
    const data = await res.json();
    const accounts = data.result?.token_accounts || [];
    if (accounts.length > 0) {
      // Sort by amount descending
      accounts.sort((a: any, b: any) => Number(b.amount) - Number(a.amount));
      return accounts.slice(0, HOLDER_LIMIT).map((a: any) => ({
        address: a.address,
        owner: a.owner,
        amount: a.amount,
        decimals: a.decimals || 0,
      }));
    }
  } catch {}

  // Fallback to getTokenLargestAccounts (max 20)
  try {
    const res = await fetch(HELIUS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTokenLargestAccounts', params: [mintAddress] })
    });
    const data = await res.json();
    return (data.result?.value || []).map((a: any) => ({
      address: a.address,
      owner: null,
      amount: a.amount,
      decimals: a.decimals || 0,
    }));
  } catch {}
  return [];
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get('address') || '';
  const chain = searchParams.get('chain') || 'eth';

  try {
    const pricePromise = getTokenPrice(address, chain);

    if (chain === 'sol') {
      const [accounts, priceData] = await Promise.all([
        getSolanaHolders(address),
        pricePromise,
      ]);

      if (!accounts.length) {
        return NextResponse.json({ holders: [], price: 0, symbol: priceData.symbol, name: priceData.name, logo: priceData.logo });
      }

      const total = accounts.reduce((s: number, a: any) => s + Number(a.amount), 0) || 1;

      // If owners aren't included (fallback path), resolve them
      const needsResolve = accounts.some((a: any) => !a.owner);
      let ownerMap: Record<string, string> = {};
      if (needsResolve) {
        const tokenAddresses = accounts.map((a: any) => a.address);
        ownerMap = await resolveTokenAccountOwners(tokenAddresses);
      }

      // Get unique owner addresses
      const ownerAddresses = [...new Set(accounts.map((a: any) => a.owner || ownerMap[a.address] || a.address))];
      const identities = await getSolanaIdentities(ownerAddresses);

      const allHoldersMapped = accounts.map((a: any) => {
        const rawBalance = Number(a.amount);
        const decimals = a.decimals || 6;
        const balance = rawBalance / Math.pow(10, decimals);
        const ownerAddress = a.owner || ownerMap[a.address] || a.address;
        const identity = identities[ownerAddress];
        return {
          address: ownerAddress,
          tokenAccount: a.address,
          balance: rawBalance,
          balanceFormatted: balance,
          usdValue: balance * priceData.price,
          pct: (rawBalance / total) * 100,
          rank: 0,
          label: identity?.name || null,
          labelType: identity?.category || null,
        };
      });
      // Filter dust, dedupe by owner, take top HOLDER_LIMIT
      const seen = new Set<string>();
      const holders = allHoldersMapped
        .filter(h => {
          if (h.pct < MIN_PCT) return false;
          if (seen.has(h.address)) return false;
          seen.add(h.address);
          return true;
        })
        .slice(0, HOLDER_LIMIT)
        .map((h, i) => ({ ...h, rank: i + 1 }));
      return NextResponse.json({ holders, price: priceData.price, symbol: priceData.symbol, name: priceData.name, logo: priceData.logo });

    } else {
      // EVM chains — paginate Moralis to get more holders
      const moralisChain = MORALIS_CHAIN[chain] || '0x1';
      const priceData = await pricePromise;

      let allHolders: any[] = [];
      let cursor: string | null = null;
      const perPage = 100;
      const maxPages = Math.ceil(FETCH_LIMIT / perPage);

      for (let page = 0; page < maxPages; page++) {
        const fetchUrl: string = `https://deep-index.moralis.io/api/v2.2/erc20/${address}/owners?chain=${moralisChain}&order=DESC&limit=${perPage}${cursor ? `&cursor=${cursor}` : ''}`;
        const res = await fetch(fetchUrl, { headers: { 'X-API-Key': MORALIS_KEY } });
        const data = await res.json();
        if (!data.result || !Array.isArray(data.result)) break;
        allHolders = allHolders.concat(data.result);
        cursor = data.cursor || null;
        if (!cursor || allHolders.length >= FETCH_LIMIT) break;
      }

      if (!allHolders.length) return NextResponse.json({ holders: [], price: 0 });

      const total = allHolders.reduce((s: number, h: any) => s + Number(h.balance_formatted || h.balance), 0) || 1;

      const allMapped = allHolders.map((h: any) => {
        const balance = Number(h.balance_formatted || h.balance);
        const addr = h.owner_address;
        const moralisLabel = h.owner_address_label || null;
        return {
          address: addr,
          balance: Number(h.balance),
          balanceFormatted: balance,
          usdValue: balance * priceData.price,
          pct: (balance / total) * 100,
          rank: 0,
          label: moralisLabel || null,
          labelType: moralisLabel ? 'entity' : null,
        };
      });

      // Filter dust and take top HOLDER_LIMIT
      const holders = allMapped
        .filter(h => h.pct >= MIN_PCT)
        .slice(0, HOLDER_LIMIT)
        .map((h, i) => ({ ...h, rank: i + 1 }));
      return NextResponse.json({ holders, price: priceData.price, symbol: priceData.symbol, name: priceData.name, logo: priceData.logo });
    }
  } catch (e) {
    return NextResponse.json({ holders: [], error: String(e) });
  }
}

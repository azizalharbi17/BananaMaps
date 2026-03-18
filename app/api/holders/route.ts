import { NextRequest, NextResponse } from 'next/server';

const MORALIS_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6IjViZDYwYzFmLTZiM2YtNGRjMi05MmI5LTRhMmM3ZDhjODZkZCIsIm9yZ0lkIjoiNTA0OTU3IiwidXNlcklkIjoiNTE5NTc2IiwidHlwZUlkIjoiMzFkZThkMTgtY2Y2My00NzEyLWI1MjYtNzhjY2E1ZDU1ZGViIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NzMyODg3NjIsImV4cCI6NDkyOTA0ODc2Mn0.RfKSauIp7N0FUQWpLBJ0L_Q7Qu7T6lle7i_VpiAtzpM';
const HELIUS_KEY = '47457a62-fd41-4fe7-991d-9ec8ed4fb6e0';

const MORALIS_CHAIN: Record<string, string> = { eth: '0x1', bsc: '0x38', base: '0x2105' };

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get('address') || '';
  const chain = searchParams.get('chain') || 'eth';

  try {
    if (chain === 'sol') {
      const res = await fetch(`https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTokenLargestAccounts', params: [address] })
      });
      const data = await res.json();
      const accounts = data.result?.value || [];
      const total = accounts.reduce((s: number, a: any) => s + Number(a.amount), 0) || 1;
      const holders = accounts.slice(0, 100).map((a: any, i: number) => ({
        address: a.address,
        balance: Number(a.amount),
        pct: (Number(a.amount) / total) * 100,
        rank: i + 1,
      }));
      return NextResponse.json({ holders });
    } else {
      const moralisChain = MORALIS_CHAIN[chain] || '0x1';
      const res = await fetch(
        `https://deep-index.moralis.io/api/v2.2/erc20/${address}/owners?chain=${moralisChain}&order=DESC&limit=100`,
        { headers: { 'X-API-Key': MORALIS_KEY } }
      );
      const data = await res.json();
      if (!data.result || !Array.isArray(data.result)) return NextResponse.json({ holders: [], debug: JSON.stringify(data).slice(0, 200) });
      const total = data.result.reduce((s: number, h: any) => s + Number(h.balance_formatted || h.balance), 0) || 1;
      const holders = data.result.slice(0, 100).map((h: any, i: number) => ({
        address: h.owner_address,
        balance: Number(h.balance_formatted || h.balance),
        pct: (Number(h.balance_formatted || h.balance) / total) * 100,
        rank: i + 1,
      }));
      return NextResponse.json({ holders });
    }
  } catch (e) {
    return NextResponse.json({ holders: [], error: String(e) });
  }
}

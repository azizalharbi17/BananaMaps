// Known exchange wallet addresses
// These should be excluded from rug score calculations and labeled in the UI

export interface ExchangeInfo {
  name: string;
  logo?: string;
}

// Ethereum / EVM exchange addresses (lowercase)
const EVM_EXCHANGES: Record<string, ExchangeInfo> = {
  // Binance
  "0x28c6c06298d514db089934071355e5743bf21d60": { name: "Binance" },
  "0x21a31ee1afc51d94c2efccaa2092ad1028285549": { name: "Binance" },
  "0xdfd5293d8e347dfe59e90efd55b2956a1343963d": { name: "Binance" },
  "0x56eddb7aa87536c09ccc2793473599fd21a8b17f": { name: "Binance" },
  "0x9696f59e4d72e237be84ffd425dcad154bf96976": { name: "Binance" },
  "0xf977814e90da44bfa03b6295a0616a897441acec": { name: "Binance" },
  "0x8894e0a0c962cb723c1ef8a1b46e5fb3969917d6": { name: "Binance" },
  "0xe2fc31f816a9b94326492132018c3aecc4a93ae1": { name: "Binance" },
  "0x3c783c21a0383057d128bae431894a5c19f9cf06": { name: "Binance" },
  "0xbe0eb53f46cd790cd13851d5eff43d12404d33e8": { name: "Binance" },
  "0xf17aced3c7a8daa29ebb90db8d1b6efd8c364a18": { name: "Binance" },
  // Coinbase
  "0x503828976d22510aad0201ac7ec88293211d23da": { name: "Coinbase" },
  "0xddfabcdc4d8ffc6d5beaf154f18b778f892a0740": { name: "Coinbase" },
  "0x3cd751e6b0078be393132286c442345e68ff0afc": { name: "Coinbase" },
  "0xb5d85cbf7cb3ee0d56b3bb207d5fc4b82f43f511": { name: "Coinbase" },
  "0xeb2629a2734e272bcc07bda959863f316f4bd4cf": { name: "Coinbase" },
  "0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43": { name: "Coinbase" },
  "0x77696bb39917c91a0c3908d577d5e322095425ca": { name: "Coinbase" },
  "0x7c195d981abfdc3ddecd2ca0fed0958430488e34": { name: "Coinbase" },
  // Kraken
  "0x2910543af39aba0cd09dbb2d50200b3e800a63d2": { name: "Kraken" },
  "0x0a869d79a7052c7f1b55a8ebabbea3420f0d1e13": { name: "Kraken" },
  "0xe853c56864a2ebe4576a807d26fdc4a0ada51919": { name: "Kraken" },
  "0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0": { name: "Kraken" },
  // OKX
  "0x6cc5f688a315f3dc28a7781717a9a798a59fda7b": { name: "OKX" },
  "0x236f9f97e0e62388479bf9e5ba4889e46b0273c3": { name: "OKX" },
  "0xa7efae728d2936e78bda97dc267687568dd593f3": { name: "OKX" },
  // KuCoin
  "0xd6216fc19db775df9774a6e33526131da7d19a2c": { name: "KuCoin" },
  "0xf3f094484ec6901ffc9681bcb808b96bafd0b8a8": { name: "KuCoin" },
  // Bybit
  "0xf89d7b9c864f589bbf53a82105107622b35eaa40": { name: "Bybit" },
  "0x1db92e2eebc8e0c075a02bea49a2935bcd2dfcf4": { name: "Bybit" },
  // Gate.io
  "0x0d0707963952f2fba59dd06f2b425ace40b492fe": { name: "Gate.io" },
  "0x1c4b70a3968436b9a0a9cf5205c787eb81bb558c": { name: "Gate.io" },
  // Bitfinex
  "0x876eabf441b2ee5b5b0554fd502a8e0600950cfa": { name: "Bitfinex" },
  "0x742d35cc6634c0532925a3b844bc9e7595f2bd3e": { name: "Bitfinex" },
  // Gemini
  "0xd24400ae8bfebb18ca49be86258a3c749cf46853": { name: "Gemini" },
  "0x6fc82a5fe25a5cdb58bc74600a40a69c065263f8": { name: "Gemini" },
  // Huobi / HTX
  "0xab5c66752a9e8167967685f1450532fb96d5d24f": { name: "HTX" },
  "0x6748f50f686bfbca6fe8ad62b22228b87f31ff2b": { name: "HTX" },
  "0xfdb16996831753d5331ff813c29a93c76834a0ad": { name: "HTX" },
  // Crypto.com
  "0x6262998ced04146fa42253a5c0af90ca02dfd2a3": { name: "Crypto.com" },
  "0x46340b20830761efd32832a74d7169b29feb9758": { name: "Crypto.com" },
  // Robinhood
  "0x40b38765696e3d5d8d9d834d8aad4bb6e418e489": { name: "Robinhood" },
  // Uniswap / DEX routers & pools (label differently)
  "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad": { name: "Uniswap Router" },
  "0x7a250d5630b4cf539739df2c5dacb4c659f2488d": { name: "Uniswap V2 Router" },
  "0xe592427a0aece92de3edee1f18e0157c05861564": { name: "Uniswap V3 Router" },
  // Dead / Burn addresses
  "0x000000000000000000000000000000000000dead": { name: "Burn Address" },
  "0x0000000000000000000000000000000000000000": { name: "Null Address" },
  "0x0000000000000000000000000000000000000001": { name: "Burn Address" },
};

// BSC-specific (many overlap with EVM)
const BSC_EXCHANGES: Record<string, ExchangeInfo> = {
  ...EVM_EXCHANGES,
  "0x8894e0a0c962cb723c1ef8a1b46e5fb3969917d6": { name: "Binance (BSC)" },
  "0xe2fc31f816a9b94326492132018c3aecc4a93ae1": { name: "Binance (BSC)" },
  "0x4b16c5de96eb2117bbe5fd171e4d203624b014aa": { name: "PancakeSwap Router" },
  "0x10ed43c718714eb63d5aa57b78b54704e256024e": { name: "PancakeSwap V2 Router" },
  "0x13f4ea83d0bd40e75c8222255bc855a974568dd4": { name: "PancakeSwap V3 Router" },
};

// Solana exchange addresses
const SOL_EXCHANGES: Record<string, ExchangeInfo> = {
  // Binance
  "5tzFkiKscjHuJGo2ZcCYzQ3SRKCTn2C3Q6AoivGFaHki": { name: "Binance" },
  "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM": { name: "Binance" },
  "3yFwqXBfZY4jBVUafQ1YEXw189y2dN3V5KQq9uzBDy1E": { name: "Binance" },
  "2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S": { name: "Binance" },
  // Coinbase
  "H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS": { name: "Coinbase" },
  "2AQdTYJYGW28Y98ruNUaEQ1GgEghTqDqEEwJF8SC1JBK": { name: "Coinbase" },
  "GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7npE": { name: "Coinbase" },
  // Kraken
  "CsJFn1DQMnr8GDApqXBHRBmMGAtYtrfJB2iHMnSAoRCx": { name: "Kraken" },
  "FWznbcNXWQuHTawe9RxvQ2LdCENssh12dsznf4RiouN5": { name: "Kraken" },
  // OKX
  "5VCwKtCXgCJ6kit5FybXjvriW3xELsFDhYrPSqtJNmcD": { name: "OKX" },
  // Raydium
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": { name: "Raydium AMM" },
  "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1": { name: "Raydium V4" },
  // Jupiter
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4": { name: "Jupiter" },
  // Pump.fun
  "Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjQ7GWqE1YqA": { name: "Pump.fun" },
  // Burn
  "1nc1nerator11111111111111111111111111111111": { name: "Burn Address" },
};

const CHAIN_MAP: Record<string, Record<string, ExchangeInfo>> = {
  eth: EVM_EXCHANGES,
  bsc: BSC_EXCHANGES,
  base: EVM_EXCHANGES,
  sol: SOL_EXCHANGES,
};

export function getExchangeInfo(address: string, chain: string): ExchangeInfo | null {
  const exchanges = CHAIN_MAP[chain] || EVM_EXCHANGES;
  return exchanges[address.toLowerCase()] || null;
}

export function isExchange(address: string, chain: string): boolean {
  return getExchangeInfo(address, chain) !== null;
}

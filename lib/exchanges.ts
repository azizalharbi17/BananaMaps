export interface ExchangeInfo {
  name: string;
  type?: "cex" | "dex" | "burn" | "contract";
}

// Ethereum / EVM exchange addresses (lowercase)
const EVM_EXCHANGES: Record<string, ExchangeInfo> = {
  // Binance
  "0x28c6c06298d514db089934071355e5743bf21d60": { name: "Binance", type: "cex" },
  "0x21a31ee1afc51d94c2efccaa2092ad1028285549": { name: "Binance", type: "cex" },
  "0xdfd5293d8e347dfe59e90efd55b2956a1343963d": { name: "Binance", type: "cex" },
  "0x56eddb7aa87536c09ccc2793473599fd21a8b17f": { name: "Binance", type: "cex" },
  "0x9696f59e4d72e237be84ffd425dcad154bf96976": { name: "Binance", type: "cex" },
  "0xf977814e90da44bfa03b6295a0616a897441acec": { name: "Binance", type: "cex" },
  "0x8894e0a0c962cb723c1ef8a1b46e5fb3969917d6": { name: "Binance", type: "cex" },
  "0xe2fc31f816a9b94326492132018c3aecc4a93ae1": { name: "Binance", type: "cex" },
  "0x3c783c21a0383057d128bae431894a5c19f9cf06": { name: "Binance", type: "cex" },
  "0xbe0eb53f46cd790cd13851d5eff43d12404d33e8": { name: "Binance", type: "cex" },
  "0xf17aced3c7a8daa29ebb90db8d1b6efd8c364a18": { name: "Binance", type: "cex" },
  "0x5a52e96bacdabb82fd05763e25335261b270efcb": { name: "Binance", type: "cex" },
  "0x835678a611b28684005a5e2233695fb6cbbb0007": { name: "Binance", type: "cex" },
  "0x47ac0fb4f2d84898e4d9e7b4dab3c24507a6d503": { name: "Binance", type: "cex" },
  "0xab83d182f3485cf1d6ccdd34c7cfef95b4c08da4": { name: "Binance", type: "cex" },
  "0xc3c8e163b2a4a8b0e38a3e33e7b5aabc39b34647": { name: "Binance", type: "cex" },
  // Coinbase
  "0x503828976d22510aad0201ac7ec88293211d23da": { name: "Coinbase", type: "cex" },
  "0xddfabcdc4d8ffc6d5beaf154f18b778f892a0740": { name: "Coinbase", type: "cex" },
  "0x3cd751e6b0078be393132286c442345e68ff0afc": { name: "Coinbase", type: "cex" },
  "0xb5d85cbf7cb3ee0d56b3bb207d5fc4b82f43f511": { name: "Coinbase", type: "cex" },
  "0xeb2629a2734e272bcc07bda959863f316f4bd4cf": { name: "Coinbase", type: "cex" },
  "0xa9d1e08c7793af67e9d92fe308d5697fb81d3e43": { name: "Coinbase", type: "cex" },
  "0x77696bb39917c91a0c3908d577d5e322095425ca": { name: "Coinbase", type: "cex" },
  "0x7c195d981abfdc3ddecd2ca0fed0958430488e34": { name: "Coinbase", type: "cex" },
  "0x95a9bd206ae52c4ba8eecfc93d18eacdd41c88cc": { name: "Coinbase", type: "cex" },
  "0xb739d0895772dbb71a89a3754a160269068f0d45": { name: "Coinbase", type: "cex" },
  "0xa090e606e30bd747d4e6245a1517ebe430f0057e": { name: "Coinbase", type: "cex" },
  "0x71660c4005ba85c37ccec55d0c4493e66fe775d3": { name: "Coinbase", type: "cex" },
  // Kraken
  "0x2910543af39aba0cd09dbb2d50200b3e800a63d2": { name: "Kraken", type: "cex" },
  "0x0a869d79a7052c7f1b55a8ebabbea3420f0d1e13": { name: "Kraken", type: "cex" },
  "0xe853c56864a2ebe4576a807d26fdc4a0ada51919": { name: "Kraken", type: "cex" },
  "0x267be1c1d684f78cb4f6a176c4911b741e4ffdc0": { name: "Kraken", type: "cex" },
  "0xfa52274dd61e1643d2205169732f29114bc240b3": { name: "Kraken", type: "cex" },
  "0xae2d4617c862309a3d75a0ffb358c7a5009c673f": { name: "Kraken", type: "cex" },
  "0x43984d578803891dfa9706bdeee6078d80cfc668": { name: "Kraken", type: "cex" },
  "0x66f820a414680b5bcda5eeca5dea238543f42054": { name: "Kraken", type: "cex" },
  // OKX
  "0x6cc5f688a315f3dc28a7781717a9a798a59fda7b": { name: "OKX", type: "cex" },
  "0x236f9f97e0e62388479bf9e5ba4889e46b0273c3": { name: "OKX", type: "cex" },
  "0xa7efae728d2936e78bda97dc267687568dd593f3": { name: "OKX", type: "cex" },
  "0x98ec059dc3adfbdd63429454aeb0c990fba4a128": { name: "OKX", type: "cex" },
  "0x6fb624b48571b93e5616632c1334768f7e4e6923": { name: "OKX", type: "cex" },
  // KuCoin
  "0xd6216fc19db775df9774a6e33526131da7d19a2c": { name: "KuCoin", type: "cex" },
  "0xf3f094484ec6901ffc9681bcb808b96bafd0b8a8": { name: "KuCoin", type: "cex" },
  "0x1692e170361cefd1eb7240ec13d048fd9af6d667": { name: "KuCoin", type: "cex" },
  // Bybit
  "0xf89d7b9c864f589bbf53a82105107622b35eaa40": { name: "Bybit", type: "cex" },
  "0x1db92e2eebc8e0c075a02bea49a2935bcd2dfcf4": { name: "Bybit", type: "cex" },
  "0xee5b5b923ffce93a870b3104b7ca09c3db80047a": { name: "Bybit", type: "cex" },
  // Gate.io
  "0x0d0707963952f2fba59dd06f2b425ace40b492fe": { name: "Gate.io", type: "cex" },
  "0x1c4b70a3968436b9a0a9cf5205c787eb81bb558c": { name: "Gate.io", type: "cex" },
  "0xd793281b45cebbcfee34f7b1539e8bfae88ba0ed": { name: "Gate.io", type: "cex" },
  // Bitfinex
  "0x876eabf441b2ee5b5b0554fd502a8e0600950cfa": { name: "Bitfinex", type: "cex" },
  "0x742d35cc6634c0532925a3b844bc9e7595f2bd3e": { name: "Bitfinex", type: "cex" },
  "0x1151314c646ce4e0efd76d1af4760ae66a9fe30f": { name: "Bitfinex", type: "cex" },
  "0x36a85757645e8e8aec062a1dee289c7d615901ca": { name: "Bitfinex", type: "cex" },
  // Gemini
  "0xd24400ae8bfebb18ca49be86258a3c749cf46853": { name: "Gemini", type: "cex" },
  "0x6fc82a5fe25a5cdb58bc74600a40a69c065263f8": { name: "Gemini", type: "cex" },
  "0x61edcdf5bb737adffe5043706e7c5bb1f1a56eea": { name: "Gemini", type: "cex" },
  // Huobi / HTX
  "0xab5c66752a9e8167967685f1450532fb96d5d24f": { name: "HTX", type: "cex" },
  "0x6748f50f686bfbca6fe8ad62b22228b87f31ff2b": { name: "HTX", type: "cex" },
  "0xfdb16996831753d5331ff813c29a93c76834a0ad": { name: "HTX", type: "cex" },
  "0x46340b20830761efd32832a74d7169b29feb9758": { name: "HTX", type: "cex" },
  "0x1062a747393198f70f71ec65a582423dba7e5ab3": { name: "HTX", type: "cex" },
  // Crypto.com
  "0x6262998ced04146fa42253a5c0af90ca02dfd2a3": { name: "Crypto.com", type: "cex" },
  "0x72a53cdbbcc1b9efa39c834a540550e23463aacb": { name: "Crypto.com", type: "cex" },
  "0xcffad3200574698b78f32232aa9d63eabd290703": { name: "Crypto.com", type: "cex" },
  // Robinhood
  "0x40b38765696e3d5d8d9d834d8aad4bb6e418e489": { name: "Robinhood", type: "cex" },
  // MEXC
  "0x75e89d5979e4f6fba9f97c104c2f0afb3f1dcb88": { name: "MEXC", type: "cex" },
  "0x0211f3cedbef3143223d3acf0e589747933e8527": { name: "MEXC", type: "cex" },
  // Bitget
  "0x1ab4973a48dc892cd9971ece8e01dcc7688f8f23": { name: "Bitget", type: "cex" },
  "0x5bdf85216ec1e38d6458c870992a69e38e03f7ef": { name: "Bitget", type: "cex" },
  "0x97b9d2102a9a65a26e1ee82d59e42d1b73b68689": { name: "Bitget", type: "cex" },
  // Upbit
  "0x390de26d772d2e2005c6d1d24afc902bae37a4bb": { name: "Upbit", type: "cex" },
  "0xba826fec90cefdf6706858e5fbafcb27a290fbe0": { name: "Upbit", type: "cex" },
  // Uniswap
  "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad": { name: "Uniswap Router", type: "dex" },
  "0x7a250d5630b4cf539739df2c5dacb4c659f2488d": { name: "Uniswap V2 Router", type: "dex" },
  "0xe592427a0aece92de3edee1f18e0157c05861564": { name: "Uniswap V3 Router", type: "dex" },
  "0x000000fee13a103a10d593b9ae06b3e05f2e7e1c": { name: "Uniswap V4", type: "dex" },
  // 1inch
  "0x1111111254eeb25477b68fb85ed929f73a960582": { name: "1inch", type: "dex" },
  "0x11111112542d85b3ef69ae05771c2dccff4faa26": { name: "1inch V3", type: "dex" },
  // Burn / Null
  "0x000000000000000000000000000000000000dead": { name: "Burn Address", type: "burn" },
  "0x0000000000000000000000000000000000000000": { name: "Null Address", type: "burn" },
  "0x0000000000000000000000000000000000000001": { name: "Burn Address", type: "burn" },
  "0xdead000000000000000000000042069420694206": { name: "Burn Address", type: "burn" },
};

// BSC-specific
const BSC_EXCHANGES: Record<string, ExchangeInfo> = {
  ...EVM_EXCHANGES,
  // Binance BSC-specific
  "0x631fc1ea2270e98fbd9d92658ece0f5a269aa161": { name: "Binance", type: "cex" },
  "0xb1256d6b31e4ae87da1d56e5890c66be7f1c038e": { name: "Binance", type: "cex" },
  "0x01c952174c24e1210d26961d456a77a39e1f0bb0": { name: "Binance", type: "cex" },
  "0x161ba15a5f335c9f06bb5bbb0a9ce14076fbb645": { name: "Binance", type: "cex" },
  "0x515b72ed8a97f42c568d6a143232775f954c3d8a": { name: "Binance", type: "cex" },
  "0x8ff804cc2143451f454779a40de386f913dcff20": { name: "Binance Staking", type: "cex" },
  "0x73f5ebe90f27b46ea12e5795d16c4b408b19cc6f": { name: "Binance", type: "cex" },
  // PancakeSwap
  "0x10ed43c718714eb63d5aa57b78b54704e256024e": { name: "PancakeSwap V2", type: "dex" },
  "0x13f4ea83d0bd40e75c8222255bc855a974568dd4": { name: "PancakeSwap V3", type: "dex" },
  "0x4b16c5de96eb2117bbe5fd171e4d203624b014aa": { name: "PancakeSwap", type: "dex" },
  "0x1b81d678ffb9c0263b24a97847620c99d213eb14": { name: "PancakeSwap", type: "dex" },
  // Gate.io BSC
  "0xce1e9629d7f3a8f73f4aacd01d2437d5a9ef2862": { name: "Gate.io", type: "cex" },
  // MEXC BSC
  "0x4982085c9e2f89f2ecb8131eca71afad896e89cb": { name: "MEXC", type: "cex" },
  // KuCoin BSC
  "0x0c952174c24e1210d26961d456a77a39e1f0bb0c": { name: "KuCoin", type: "cex" },
  // Biswap
  "0x3a6d8ca21d1cf76f653a67577fa0d27453350dd8": { name: "Biswap Router", type: "dex" },
};

// Base chain
const BASE_EXCHANGES: Record<string, ExchangeInfo> = {
  ...EVM_EXCHANGES,
  // Coinbase on Base
  "0x1a0ad011913a150f69f6a19df447a0cfd9551054": { name: "Coinbase", type: "cex" },
  // Aerodrome (main Base DEX)
  "0xcf77a3ba9a5ca399b7c97c74d54e5b1beb874e43": { name: "Aerodrome Router", type: "dex" },
  // BaseSwap
  "0x327df1e6de05895d2ab08513aadd9313fe505d86": { name: "BaseSwap Router", type: "dex" },
};

// Solana exchange addresses
const SOL_EXCHANGES: Record<string, ExchangeInfo> = {
  // Binance
  "5tzFkiKscjHuJGo2ZcCYzQ3SRKCTn2C3Q6AoivGFaHki": { name: "Binance", type: "cex" },
  "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM": { name: "Binance", type: "cex" },
  "3yFwqXBfZY4jBVUafQ1YEXw189y2dN3V5KQq9uzBDy1E": { name: "Binance", type: "cex" },
  "2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S": { name: "Binance", type: "cex" },
  "BQx4BNVZ3VZn7FXZbfAWcBFjbMVNaccXMtVkjADJ3413": { name: "Binance", type: "cex" },
  "4cgKDM4VHPMsY9bqfVSBjX4dPLZKHMbBgQfgJHNMzSqu": { name: "Binance", type: "cex" },
  "AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWt1Pi": { name: "Binance", type: "cex" },
  // Coinbase
  "H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS": { name: "Coinbase", type: "cex" },
  "2AQdTYJYGW28Y98ruNUaEQ1GgEghTqDqEEwJF8SC1JBK": { name: "Coinbase", type: "cex" },
  "GJRs4FwHtemZ5ZE9x3FNvJ8TMwitKTh21yxdRPqn7npE": { name: "Coinbase", type: "cex" },
  // Kraken
  "CsJFn1DQMnr8GDApqXBHRBmMGAtYtrfJB2iHMnSAoRCx": { name: "Kraken", type: "cex" },
  "FWznbcNXWQuHTawe9RxvQ2LdCENssh12dsznf4RiouN5": { name: "Kraken", type: "cex" },
  "GXZbKyVLEG7Ns6DTyRME5tis32GGfFNaLux3cUuQPPRo": { name: "Kraken", type: "cex" },
  // OKX
  "5VCwKtCXgCJ6kit5FybXjvriW3xELsFDhYrPSqtJNmcD": { name: "OKX", type: "cex" },
  "4sJSojVxCjBBBi5sJj8uVj5d5AQ1VQoi5hcxB4GSA1A6": { name: "OKX", type: "cex" },
  // Bybit
  "AC5RDfQFmDS1deWZos921JfqscXdByf8BKHs5ACWt1Pi": { name: "Bybit", type: "cex" },
  "Dd1k91cWpXNrVFi2tJkYqfYJzBnYsC3cMmw8Rp3eUiF": { name: "Bybit", type: "cex" },
  // KuCoin
  "BmFdpraQhkiDQE6SnfG5PkRHMuAu4KQ5kSm25mFv3Dk4": { name: "KuCoin", type: "cex" },
  // Gate.io
  "u6PJ8DtQuPFnfmwHbGFULQ4u4EgjDiyYKjVEsynXq2w": { name: "Gate.io", type: "cex" },
  // Bitget
  "CEiGqk7kVCnJGQc77CWDHqkVMzi45t2935J4FMRM37sM": { name: "Bitget", type: "cex" },
  // MEXC
  "ASTyfSima4LLAdDgoFGkgqoKowG1LZFDr9fAQrg7iaJZ": { name: "MEXC", type: "cex" },
  // HTX
  "HGtAdvZ6MxD8k1bvfGxGVRRmYETR2Z6pBqHjRt1XViV": { name: "HTX", type: "cex" },
  // Crypto.com
  "AobVSwdW9BbpMdJvTqeCN4hPAmh4rHm7vwLnQ5ATbo3w": { name: "Crypto.com", type: "cex" },
  // Upbit
  "2Pdn9LFGBCQ9VRBMqw7aPsirirXqJBWjFmEdSSaGRZu5": { name: "Upbit", type: "cex" },
  // Robinhood
  "3ux3z57rALDAVRYidiUTPJiJ3SXcGgnkHkQ7pjAEDxU7": { name: "Robinhood", type: "cex" },
  // Raydium
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": { name: "Raydium AMM", type: "dex" },
  "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1": { name: "Raydium V4", type: "dex" },
  "CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK": { name: "Raydium CLMM", type: "dex" },
  "routeUGWgWzqBWFcrCfv8tritsqukccJPu3q5GPP3xS": { name: "Raydium Route", type: "dex" },
  // Jupiter
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4": { name: "Jupiter V6", type: "dex" },
  "JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB": { name: "Jupiter V4", type: "dex" },
  "JUP2jxvXaqu7NQY1GmNF4m1vodw12LVXYxbFL2uN9vFo": { name: "Jupiter V2", type: "dex" },
  // Orca
  "whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc": { name: "Orca Whirlpool", type: "dex" },
  "9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP": { name: "Orca V2", type: "dex" },
  // Pump.fun
  "Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjQ7GWqE1YqA": { name: "Pump.fun", type: "dex" },
  "39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg": { name: "Pump.fun Fee", type: "dex" },
  // Meteora
  "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo": { name: "Meteora", type: "dex" },
  // Burn
  "1nc1nerator11111111111111111111111111111111": { name: "Burn Address", type: "burn" },
  "11111111111111111111111111111111": { name: "System Program", type: "contract" },
};

const CHAIN_MAP: Record<string, Record<string, ExchangeInfo>> = {
  eth: EVM_EXCHANGES,
  bsc: BSC_EXCHANGES,
  base: BASE_EXCHANGES,
  sol: SOL_EXCHANGES,
};

export function getExchangeInfo(address: string, chain: string): ExchangeInfo | null {
  const exchanges = CHAIN_MAP[chain] || EVM_EXCHANGES;
  // EVM addresses are case-insensitive, Solana addresses are case-sensitive
  if (chain === "sol") {
    return exchanges[address] || null;
  }
  return exchanges[address.toLowerCase()] || null;
}

export function isExchange(address: string, chain: string): boolean {
  return getExchangeInfo(address, chain) !== null;
}

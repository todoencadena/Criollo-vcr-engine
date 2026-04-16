baseMainnet: {
  type:     "http",
  url:      process.env.BASE_MAINNET_RPC || "https://mainnet.base.org",
  accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
  chainId:  8453,
},

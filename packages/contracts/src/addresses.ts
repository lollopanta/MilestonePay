export const avalancheFujiChainId = 43113 as const

export const deployments = {
  [avalancheFujiChainId]: {
    escrowFactory: "0xee7328dc4002742d3e50da2eed62b98f7ab2f003",
    paymentToken: "0x42af675ae147084a063058ededdc729c9f1fbf35",
  },
} as const

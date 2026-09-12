export const avalancheFujiChainId = 43113 as const

// Updated by the Fuji deployment export. Addresses are intentionally absent until deployment.
export const deployments = {
  [avalancheFujiChainId]: {
    escrowFactory: undefined,
    paymentToken: undefined,
  },
} as const

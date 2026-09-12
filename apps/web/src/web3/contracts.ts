import { avalancheFujiChainId, deployments } from "@milestonepay/contracts"
import type { Address } from "viem"

export const contracts = {
  escrowFactory: deployments[avalancheFujiChainId].escrowFactory as Address,
  paymentToken: deployments[avalancheFujiChainId].paymentToken as Address,
}

export const tokenDecimals = 6

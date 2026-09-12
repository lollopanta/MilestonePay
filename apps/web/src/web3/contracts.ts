import { avalancheFujiChainId, deployments } from "@milestonepay/contracts"
import { isAddress, type Address } from "viem"

function addressFromEnv(value: string | undefined): Address | undefined {
  return value && isAddress(value) ? value : undefined
}

export const contracts = {
  escrowFactory: addressFromEnv(import.meta.env.VITE_ESCROW_FACTORY) ?? addressFromEnv(deployments[avalancheFujiChainId].escrowFactory),
  paymentToken: addressFromEnv(import.meta.env.VITE_PAYMENT_TOKEN_ADDRESS) ?? addressFromEnv(deployments[avalancheFujiChainId].paymentToken),
}

export const tokenDecimals = 6

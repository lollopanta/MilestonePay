import { createPublicClient, createWalletClient, type PublicArkivClient, type WalletArkivClient } from "@arkiv-network/sdk"
import { tiramisu } from "@arkiv-network/sdk/chains"
import { http } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import type { Address } from "viem"

const defaultRpc = "https://rpc.tiramisu.db-chain.testnet.arkiv.network"
const transport = () => { const rpc = (process.env.ARKIV_RPC || defaultRpc).replace(/\/$/, ""); return http(process.env.ARKIV_ACCESS_KEY ? `${rpc}/${process.env.ARKIV_ACCESS_KEY}` : rpc) }
export const createArkivPublicClient = (): PublicArkivClient => createPublicClient({ chain: tiramisu, transport: transport() })
export function trustedWriter(): Address {
  const key = process.env.ARKIV_PRIVATE_KEY
  if (!key || !/^0x[\da-f]{64}$/i.test(key)) throw new Error("Arkiv writer is not configured")
  return privateKeyToAccount(key as `0x${string}`).address
}
export function createArkivWalletClient(): WalletArkivClient {
  const key = process.env.ARKIV_PRIVATE_KEY
  if (!key || !/^0x[\da-f]{64}$/i.test(key)) throw new Error("Arkiv writer is not configured")
  return createWalletClient({ chain: tiramisu, transport: transport(), account: privateKeyToAccount(key as `0x${string}`) })
}
export const getArkivBlockNumber = () => createArkivPublicClient().getBlockNumber()

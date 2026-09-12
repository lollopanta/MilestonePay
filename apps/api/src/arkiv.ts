import {
  createPublicClient,
  createWalletClient,
  type PublicArkivClient,
  type WalletArkivClient,
} from '@arkiv-network/sdk'
import { tiramisu } from '@arkiv-network/sdk/chains'
import { http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

const publicRpc = 'https://rpc.tiramisu.db-chain.testnet.arkiv.network'

function transport() {
  const rpc = (process.env.ARKIV_RPC || publicRpc).replace(/\/$/, '')
  const accessKey = process.env.ARKIV_ACCESS_KEY
  return http(accessKey ? `${rpc}/${accessKey}` : rpc)
}

export function createArkivPublicClient(): PublicArkivClient {
  return createPublicClient({ chain: tiramisu, transport: transport() })
}

export function createArkivWalletClient(): WalletArkivClient {
  const privateKey = process.env.ARKIV_PRIVATE_KEY
  if (!privateKey || !/^0x[\da-f]{64}$/i.test(privateKey)) {
    throw new Error('ARKIV_PRIVATE_KEY must be a 32-byte hex private key')
  }

  return createWalletClient({
    chain: tiramisu,
    transport: transport(),
    account: privateKeyToAccount(privateKey as `0x${string}`),
  })
}

export async function getArkivBlockNumber() {
  return createArkivPublicClient().getBlockNumber()
}

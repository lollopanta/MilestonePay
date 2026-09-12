import { EscrowFactoryAbi, MilestoneEscrowAbi, avalancheFujiChainId, deployments } from "@milestonepay/contracts"
import { createPublicClient, decodeEventLog, http, isAddress, type Address, type Hex, type PublicClient } from "viem"
import { avalancheFuji } from "viem/chains"
import type { NormalizedEvent } from "./sync.js"

export const FUJI_DEPLOYMENT_BLOCK = 58_333_416n
const chunkSize = 10_000n
const lower = (value: string) => value.toLowerCase()
const scalar = (value: unknown): string | number | boolean => typeof value === "bigint" ? value.toString() : typeof value === "string" && isAddress(value) ? lower(value) : typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : String(value)
const snake = (value: string) => value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)

export type EscrowState = {
  client: Address; provider: Address; arbiter: Address; paymentToken: Address; totalAmount: bigint; reviewPeriod: bigint
  status: "created" | "active" | "disputed" | "completed" | "cancelled"; currentMilestone: bigint; totalReleased: bigint; totalRefunded: bigint
}

export type AvalancheReader = {
  chainId: number
  factory: Address
  readEvents(fromBlock: bigint, toBlock?: bigint, knownEscrows?: readonly Address[]): Promise<NormalizedEvent[]>
  readEscrow(escrow: Address): Promise<EscrowState>
  isEscrow(escrow: Address): Promise<boolean>
  evidenceHash(escrow: Address, milestoneId: bigint, kind: "milestone" | "dispute-client" | "dispute-provider"): Promise<Hex>
}

function normalizeLog(log: { address: Address; data: Hex; topics: readonly Hex[]; blockNumber?: bigint; transactionHash?: Hex; transactionIndex?: number; logIndex?: number }, abi: typeof EscrowFactoryAbi | typeof MilestoneEscrowAbi): NormalizedEvent | undefined {
  try {
    const decoded = decodeEventLog({ abi, data: log.data, topics: log.topics as [Hex, ...Hex[]], strict: true })
    const args = Object.fromEntries(Object.entries(decoded.args).map(([key, value]) => [snake(key), scalar(value)]))
    const escrow = decoded.eventName === "EscrowCreated" ? String(args.escrow) : lower(log.address)
    if (!log.transactionHash || log.blockNumber === undefined || log.logIndex === undefined) return undefined
    return { chainId: avalancheFujiChainId, txHash: log.transactionHash, logIndex: log.logIndex, transactionIndex: log.transactionIndex ?? 0, blockNumber: Number(log.blockNumber), contract: lower(log.address), eventName: decoded.eventName, escrow, attributes: args }
  } catch { return undefined }
}

async function logsInChunks(client: PublicClient, address: Address, fromBlock: bigint, toBlock: bigint) {
  const logs: Awaited<ReturnType<PublicClient["getLogs"]>> = []
  for (let start = fromBlock; start <= toBlock; start += chunkSize) logs.push(...await client.getLogs({ address, fromBlock: start, toBlock: start + chunkSize - 1n > toBlock ? toBlock : start + chunkSize - 1n }))
  return logs
}

export function createAvalancheReader(options: { rpcUrl?: string; factory?: Address; startBlock?: bigint } = {}): AvalancheReader {
  const factory = options.factory ?? deployments[avalancheFujiChainId].escrowFactory as Address
  const client = createPublicClient({ chain: avalancheFuji, transport: http(options.rpcUrl ?? process.env.FUJI_RPC_URL) })
  const stateName = ["created", "active", "disputed", "completed", "cancelled"] as const
  return {
    chainId: avalancheFujiChainId,
    factory,
    async readEvents(fromBlock, requestedToBlock, knownEscrows = []) {
      const toBlock = requestedToBlock ?? await client.getBlockNumber()
      const factoryLogs = await logsInChunks(client, factory, fromBlock, toBlock)
      const events = factoryLogs.map((log) => normalizeLog(log as unknown as Parameters<typeof normalizeLog>[0], EscrowFactoryAbi)).filter((event): event is NormalizedEvent => Boolean(event))
      const escrows = [...new Set([...knownEscrows.map(lower) as Address[], ...events.filter((event) => event.eventName === "EscrowCreated").map((event) => event.escrow as Address)])]
      for (const escrow of escrows) {
        const escrowLogs = await logsInChunks(client, escrow, fromBlock, toBlock)
        events.push(...escrowLogs.map((log) => normalizeLog(log as unknown as Parameters<typeof normalizeLog>[0], MilestoneEscrowAbi)).filter((event): event is NormalizedEvent => Boolean(event)))
      }
      return events.sort((a, b) => a.blockNumber - b.blockNumber || a.transactionIndex - b.transactionIndex || a.logIndex - b.logIndex)
    },
    async isEscrow(escrow) { return client.readContract({ address: factory, abi: EscrowFactoryAbi, functionName: "isEscrow", args: [escrow] }) },
    async readEscrow(escrow) {
      const [clientAddress, provider, arbiter, paymentToken, totalAmount, reviewPeriod, status, currentMilestone, totalReleased, totalRefunded] = await Promise.all([
        client.readContract({ address: escrow, abi: MilestoneEscrowAbi, functionName: "client" }), client.readContract({ address: escrow, abi: MilestoneEscrowAbi, functionName: "provider" }), client.readContract({ address: escrow, abi: MilestoneEscrowAbi, functionName: "arbiter" }), client.readContract({ address: escrow, abi: MilestoneEscrowAbi, functionName: "paymentToken" }), client.readContract({ address: escrow, abi: MilestoneEscrowAbi, functionName: "totalAmount" }), client.readContract({ address: escrow, abi: MilestoneEscrowAbi, functionName: "reviewPeriod" }), client.readContract({ address: escrow, abi: MilestoneEscrowAbi, functionName: "status" }), client.readContract({ address: escrow, abi: MilestoneEscrowAbi, functionName: "currentMilestone" }), client.readContract({ address: escrow, abi: MilestoneEscrowAbi, functionName: "totalReleased" }), client.readContract({ address: escrow, abi: MilestoneEscrowAbi, functionName: "totalRefunded" }),
      ])
      return { client: clientAddress, provider, arbiter, paymentToken, totalAmount, reviewPeriod, status: stateName[Number(status)], currentMilestone, totalReleased, totalRefunded }
    },
    async evidenceHash(escrow, milestoneId, kind) {
      if (kind === "milestone") return (await client.readContract({ address: escrow, abi: MilestoneEscrowAbi, functionName: "getMilestone", args: [milestoneId] })).evidenceHash
      const dispute = await client.readContract({ address: escrow, abi: MilestoneEscrowAbi, functionName: "getDispute", args: [milestoneId] })
      return kind === "dispute-client" ? dispute.clientEvidenceHash : dispute.providerEvidenceHash
    },
  }
}

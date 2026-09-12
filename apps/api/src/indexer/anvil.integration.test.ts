import assert from "node:assert/strict"
import { existsSync, readFileSync } from "node:fs"
import { spawn } from "node:child_process"
import { resolve } from "node:path"
import { test } from "node:test"
import { createPublicClient, createWalletClient, decodeEventLog, http, type Address, type Hex } from "viem"
import { foundry } from "viem/chains"
import { EscrowFactoryAbi, MilestoneEscrowAbi, MockUSDTAbi } from "@milestonepay/contracts"
import { MemoryArkivRepository } from "../arkiv/writer.js"
import { ProtocolService } from "../services/protocol.js"
import { createEvmReader } from "./avalanche.js"
import { syncAvalanche } from "./sync.js"

const rpc = "http://127.0.0.1:18545"
const artifact = (name: string) => JSON.parse(readFileSync(resolve(import.meta.dirname, `../../../../contracts/out/${name}.sol/${name}.json`), "utf8")) as { bytecode: { object: string } }
const bytecode = (name: string) => {
  const object = artifact(name).bytecode.object
  return (object.startsWith("0x") ? object : `0x${object}`) as Hex
}
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

test("Anvil contracts emit logs that materialize without duplicate settlements on replay", async () => {
  const anvil = process.env.ANVIL_BIN ?? resolve(process.env.HOME ?? "", ".foundry/bin/anvil")
  assert.ok(existsSync(anvil), "Anvil is required for the real-contract indexer integration test")
  const anvilProcess = spawn(anvil, ["--silent", "--port", "18545", "--chain-id", "31337"], { stdio: "ignore" })
  const publicClient = createPublicClient({ chain: foundry, transport: http(rpc, { retryCount: 0, timeout: 1_000 }) })
  try {
    let ready = false
    for (let i = 0; i < 40; i++) {
      try { await publicClient.getBlockNumber(); ready = true; break } catch { await wait(50) }
    }
    assert.ok(ready, "Anvil did not start")
    const accounts = await publicClient.request({ method: "eth_accounts" }) as Address[]
    const wallets = accounts.slice(0, 4).map((account) => createWalletClient({ account, chain: foundry, transport: http(rpc) }))
    const [deployer, client, provider, arbiter] = wallets
    const deployed = async (abi: typeof MockUSDTAbi | typeof EscrowFactoryAbi, code: Hex) => { const hash = await deployer.deployContract({ abi, bytecode: code } as never); return (await publicClient.waitForTransactionReceipt({ hash, pollingInterval: 50 })).contractAddress! }
    const token = await deployed(MockUSDTAbi, bytecode("MockUSDT")); const factory = await deployed(EscrowFactoryAbi, bytecode("EscrowFactory"))
    const send = async (wallet: typeof client, request: object) => publicClient.waitForTransactionReceipt({ hash: await wallet.writeContract(request as never), pollingInterval: 50 })
    const create = async (amounts: bigint[], reviewPeriod = 60n) => {
      const receipt = await send(client, { address: factory, abi: EscrowFactoryAbi, functionName: "createEscrow", args: [provider.account.address, arbiter.account.address, token, amounts, reviewPeriod] })
      return decodeEventLog({ abi: EscrowFactoryAbi, data: receipt.logs[0].data, topics: receipt.logs[0].topics }).args.escrow as Address
    }
    const fund = async (escrow: Address, amount: bigint) => { await send(deployer, { address: token, abi: MockUSDTAbi, functionName: "mint", args: [client.account.address, amount] }); await send(client, { address: token, abi: MockUSDTAbi, functionName: "approve", args: [escrow, amount] }); await send(client, { address: escrow, abi: MilestoneEscrowAbi, functionName: "fund" }) }
    const evidence = `0x${"1".repeat(64)}` as Hex
    const primary = await create([3_000_000n, 3_000_000n, 4_000_000n]); await fund(primary, 10_000_000n)
    await send(provider, { address: primary, abi: MilestoneEscrowAbi, functionName: "submitMilestone", args: [0n, evidence] }); await send(client, { address: primary, abi: MilestoneEscrowAbi, functionName: "approveMilestone", args: [0n] })
    await send(provider, { address: primary, abi: MilestoneEscrowAbi, functionName: "submitMilestone", args: [1n, evidence] }); await send(client, { address: primary, abi: MilestoneEscrowAbi, functionName: "openDispute", args: [1n, evidence] }); await send(provider, { address: primary, abi: MilestoneEscrowAbi, functionName: "submitDisputeEvidence", args: [1n, `0x${"2".repeat(64)}`] }); await send(arbiter, { address: primary, abi: MilestoneEscrowAbi, functionName: "resolveDispute", args: [1n, 7000, false] }); await send(provider, { address: primary, abi: MilestoneEscrowAbi, functionName: "submitMilestone", args: [2n, evidence] }); await send(client, { address: primary, abi: MilestoneEscrowAbi, functionName: "approveMilestone", args: [2n] })
    const termination = await create([3_000_000n, 7_000_000n]); await fund(termination, 10_000_000n); await send(client, { address: termination, abi: MilestoneEscrowAbi, functionName: "openDispute", args: [0n, evidence] }); await send(arbiter, { address: termination, abi: MilestoneEscrowAbi, functionName: "resolveDispute", args: [0n, 3000, true] })
    const cancellation = await create([2_000_000n]); await fund(cancellation, 2_000_000n); await send(client, { address: cancellation, abi: MilestoneEscrowAbi, functionName: "requestCancellation" }); await send(provider, { address: cancellation, abi: MilestoneEscrowAbi, functionName: "acceptCancellation" })
    const timeout = await create([1_000_000n], 1n); await fund(timeout, 1_000_000n); await send(provider, { address: timeout, abi: MilestoneEscrowAbi, functionName: "submitMilestone", args: [0n, evidence] }); await publicClient.request({ method: "evm_increaseTime", params: [2] } as never); await publicClient.request({ method: "evm_mine", params: [] } as never); await send(provider, { address: timeout, abi: MilestoneEscrowAbi, functionName: "claimAfterReviewTimeout", args: [0n] })
    for (const [escrow, released, refunded, status] of [[primary, 9_100_000n, 900_000n, "completed"], [termination, 900_000n, 9_100_000n, "cancelled"], [cancellation, 0n, 2_000_000n, "cancelled"], [timeout, 1_000_000n, 0n, "completed"]] as const) {
      const state = await createEvmReader({ rpcUrl: rpc, factory, chainId: 31337 }).readEscrow(escrow)
      const balance = await publicClient.readContract({ address: token, abi: MockUSDTAbi, functionName: "balanceOf", args: [escrow] })
      assert.equal(state.status, status); assert.equal(state.totalReleased, released); assert.equal(state.totalRefunded, refunded); assert.equal(balance + released + refunded, state.totalAmount)
    }
    const repo = new MemoryArkivRepository("0x0000000000000000000000000000000000000001"); const reader = createEvmReader({ rpcUrl: rpc, factory, chainId: 31337 })
    await syncAvalanche(repo, reader, { startBlock: 0n }); const before = { events: (await repo.all("protocol_event")).length, settlements: (await repo.all("settlement")).length, disputes: (await repo.all("dispute")).length }
    const restarted = new MemoryArkivRepository(repo.writer); restarted.entities.push(...repo.entities)
    await syncAvalanche(restarted, createEvmReader({ rpcUrl: rpc, factory, chainId: 31337 }), { startBlock: 0n })
    assert.deepEqual({ events: (await restarted.all("protocol_event")).length, settlements: (await restarted.all("settlement")).length, disputes: (await restarted.all("dispute")).length }, before)
    assert.equal(before.settlements, 5); assert.equal((await repo.find("deal", "escrow", primary.toLowerCase())).at(-1)?.attributes.status, "completed"); assert.equal((await repo.find("deal", "escrow", termination.toLowerCase())).at(-1)?.attributes.status, "cancelled"); assert.equal((await repo.find("deal", "escrow", cancellation.toLowerCase())).at(-1)?.attributes.status, "cancelled")
    const reputation = await new ProtocolService(restarted, reader).reputation(provider.account.address)
    assert.ok(reputation.overallScore >= 0 && reputation.overallScore <= 100); assert.equal(reputation.metrics.volumeByToken.length, 1); assert.ok(reputation.roles.provider)
  } finally { anvilProcess.kill("SIGTERM") }
})

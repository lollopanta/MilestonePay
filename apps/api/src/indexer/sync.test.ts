import assert from "node:assert/strict"
import { test } from "node:test"
import { MemoryArkivRepository } from "../arkiv/writer.js"
import { syncAvalanche, syncEvents } from "./sync.js"
import type { AvalancheReader } from "./avalanche.js"

const repo = new MemoryArkivRepository("0x0000000000000000000000000000000000000001")
const event = { chainId: 43113, txHash: `0x${"a".repeat(64)}` as const, logIndex: 7, transactionIndex: 0, blockNumber: 100, contract: "0x0000000000000000000000000000000000000002", eventName: "EscrowFunded", escrow: "0x0000000000000000000000000000000000000003" }
test("overlap sync is idempotent and persists a checkpoint", async () => { assert.equal((await syncEvents(repo, [event])).written, 1); assert.equal((await syncEvents(repo, [event])).written, 0); assert.equal((await repo.all("protocol_event")).length, 1); assert.equal((await repo.all("sync_checkpoint")).at(-1)?.attributes.block_number, 100) })

test("real-shaped events materialize one settlement across approval and release", async () => {
  const store = new MemoryArkivRepository("0x0000000000000000000000000000000000000001")
  const escrow = "0x0000000000000000000000000000000000000003" as const
  const events = [
    { ...event, eventName: "EscrowCreated", escrow, attributes: { escrow, client: "0x0000000000000000000000000000000000000004", provider: "0x0000000000000000000000000000000000000005", arbiter: "0x0000000000000000000000000000000000000006", payment_token: "0x0000000000000000000000000000000000000007", review_period: "60" } },
    { ...event, logIndex: 8, transactionIndex: 1, eventName: "MilestoneApproved", escrow, attributes: { milestone_id: "0", amount: "3000000000" } },
    { ...event, logIndex: 9, transactionIndex: 1, eventName: "FundsReleased", escrow, attributes: { milestone_id: "0", amount: "3000000000" } },
  ]
  const reader: AvalancheReader = { chainId: 43113, factory: "0x0000000000000000000000000000000000000002", readEvents: async () => events, isEscrow: async () => true, evidenceHash: async () => `0x${"0".repeat(64)}`, readEscrow: async () => ({ client: "0x0000000000000000000000000000000000000004", provider: "0x0000000000000000000000000000000000000005", arbiter: "0x0000000000000000000000000000000000000006", paymentToken: "0x0000000000000000000000000000000000000007", totalAmount: 3000000000n, reviewPeriod: 60n, status: "completed", currentMilestone: 0n, totalReleased: 3000000000n, totalRefunded: 0n }) }
  await syncAvalanche(store, reader, { startBlock: 100n })
  await syncAvalanche(store, reader, { startBlock: 100n })
  assert.equal((await store.all("protocol_event")).length, 3)
  assert.equal((await store.all("settlement")).length, 1)
  assert.equal((await store.all("deal")).length, 1)
})

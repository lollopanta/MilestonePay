import assert from "node:assert/strict"
import { test } from "node:test"
import { MemoryArkivRepository } from "../arkiv/writer.js"
import { syncEvents } from "./sync.js"

const repo = new MemoryArkivRepository("0x0000000000000000000000000000000000000001")
const event = { chainId: 43113, txHash: `0x${"a".repeat(64)}` as const, logIndex: 7, blockNumber: 100, contract: "0x0000000000000000000000000000000000000002", eventName: "EscrowFunded", escrow: "0x0000000000000000000000000000000000000003" }
test("overlap sync is idempotent and persists a checkpoint", async () => { assert.equal((await syncEvents(repo, [event])).written, 1); assert.equal((await syncEvents(repo, [event])).written, 0); assert.equal((await repo.all("protocol_event")).length, 1); assert.equal((await repo.all("sync_checkpoint")).at(-1)?.attributes.block_number, 100) })

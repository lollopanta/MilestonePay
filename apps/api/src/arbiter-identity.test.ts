import assert from "node:assert/strict"
import { test } from "node:test"
import { privateKeyToAccount } from "viem/accounts"
import { evidenceIdentityMessage } from "@milestonepay/evidence"
import { buildApp } from "./app.js"
import { MemoryArkivRepository } from "./arkiv/writer.js"
import type { AvalancheReader } from "./indexer/avalanche.js"
import { ProtocolService } from "./services/protocol.js"

const chainId = 43113
const reader: AvalancheReader = { chainId, factory: "0x0000000000000000000000000000000000000001", readEvents: async () => [], isEscrow: async () => false, evidenceHash: async () => `0x${"0".repeat(64)}`, readEscrow: async () => { throw new Error("not used") } }
const identity = async (key: string, swarmPublicKey = `02${"a".repeat(64)}`) => { const account = privateKeyToAccount(key as `0x${string}`); return { version: 1, chainId, identity: { wallet: account.address, swarmPublicKey, signature: await account.signMessage({ message: evidenceIdentityMessage(account.address, swarmPublicKey, chainId) }) } } }

test("arbiter identity registry verifies, discovers, preserves history, and distinguishes chains", async () => {
  const repo = new MemoryArkivRepository("0x0000000000000000000000000000000000000002")
  const app = buildApp(async () => 1n, { repo, reader })
  const first = await identity(`0x${"1".repeat(64)}`)
  const second = await identity(`0x${"1".repeat(64)}`, `03${"b".repeat(64)}`)
  try {
    assert.equal((await app.inject({ method: "POST", url: "/arbiter-identities", payload: first })).statusCode, 200)
    assert.equal((await app.inject(`/arbiter-identities/${first.identity.wallet}?chainId=${chainId}`)).json().identity.swarmPublicKey, first.identity.swarmPublicKey)
    assert.equal((await app.inject({ method: "POST", url: "/arbiter-identities", payload: second })).statusCode, 200)
    assert.equal((await repo.all("arbiter_swarm_identity")).length, 2)
    assert.equal((await app.inject(`/arbiter-identities/${first.identity.wallet}?chainId=${chainId + 1}`)).statusCode, 400)
    assert.equal((await app.inject(`/arbiter-identities/0x0000000000000000000000000000000000000003?chainId=${chainId}`)).statusCode, 404)
  } finally { await app.close() }
})

test("arbiter registry rejects invalid signatures and wallet/signature mismatches", async () => {
  const app = buildApp(async () => 1n, { repo: new MemoryArkivRepository("0x0000000000000000000000000000000000000002"), reader })
  const record = await identity(`0x${"1".repeat(64)}`)
  const other = privateKeyToAccount(`0x${"2".repeat(64)}`)
  try {
    assert.equal((await app.inject({ method: "POST", url: "/arbiter-identities", payload: { ...record, identity: { ...record.identity, signature: `0x${"0".repeat(130)}` } } })).statusCode, 400)
    assert.equal((await app.inject({ method: "POST", url: "/arbiter-identities", payload: { ...record, identity: { ...record.identity, wallet: other.address } } })).statusCode, 400)
  } finally { await app.close() }
})

test("a new registry identity never changes an identity already bound to an escrow", async () => {
  const first = await identity(`0x${"1".repeat(64)}`)
  const second = await identity(`0x${"1".repeat(64)}`, `03${"c".repeat(64)}`)
  const escrow = "0x0000000000000000000000000000000000000003" as const
  const boundReader: AvalancheReader = { ...reader, isEscrow: async () => true, readEscrow: async () => ({ client: "0x0000000000000000000000000000000000000004", provider: "0x0000000000000000000000000000000000000005", arbiter: first.identity.wallet, paymentToken: "0x0000000000000000000000000000000000000006", totalAmount: 1n, reviewPeriod: 1n, status: "active", currentMilestone: 0n, totalReleased: 0n, totalRefunded: 0n }) }
  const repo = new MemoryArkivRepository("0x0000000000000000000000000000000000000002")
  const service = new ProtocolService(repo, boundReader)
  await service.bindAgreementIdentity({ version: 1, chainId, escrow, role: "arbiter", identity: first.identity })
  await service.registerArbiterSwarmIdentity(second)
  assert.equal(((await repo.find("agreement_identity", "identity_id", `${escrow}:arbiter`)).at(0)?.payload as { identity: { swarmPublicKey: string } }).identity.swarmPublicKey, first.identity.swarmPublicKey)
})

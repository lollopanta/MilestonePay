import assert from "node:assert/strict"
import { test } from "node:test"
import { calculateReputation, type ReputationHistory } from "./index.js"

const client = "0x0000000000000000000000000000000000000001" as const
const provider = "0x0000000000000000000000000000000000000002" as const
const token = "0x0000000000000000000000000000000000000003" as const
const empty: ReputationHistory = { deals: [], settlements: [] }
test("new wallets are neutral with low confidence and deterministic output", () => { assert.deepEqual(calculateReputation(client, empty), calculateReputation(client, empty)); assert.equal(calculateReputation(client, empty).overallScore, 50); assert.equal(calculateReputation(client, empty).confidence, "low") })
test("outcomes and timeouts affect score without raw token volume", () => {
  const history: ReputationHistory = { deals: [{ escrow: token, client, provider, status: "completed" }], settlements: [{ escrow: token, client, provider, chainId: 1, token, providerAmount: 1_000_000_000_000n, clientRefundAmount: 0n, type: "approved" }, { escrow: token, client, provider, chainId: 1, token, providerAmount: 0n, clientRefundAmount: 1n, type: "timeout" }] }
  assert.ok(calculateReputation(provider, history).overallScore > 50)
  assert.ok(calculateReputation(client, history).overallScore < calculateReputation(provider, history).overallScore)
  assert.equal(calculateReputation(provider, history).metrics.volumeByToken[0]?.amount, 1_000_000_000_000n)
})

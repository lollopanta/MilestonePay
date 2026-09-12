import assert from "node:assert/strict"
import test from "node:test"
import { type Address } from "viem"

import {
  canApproveMilestone,
  canSubmitMilestone,
  formatUsdt,
  progressPercentage,
} from "./deal"
import { hashEvidenceNote } from "./evidence"

const client = "0x0000000000000000000000000000000000000001" as Address
const provider = "0x0000000000000000000000000000000000000002" as Address
const stranger = "0x0000000000000000000000000000000000000003" as Address

test("roles can only act on the active current lifecycle state", () => {
  assert.equal(canSubmitMilestone(provider, provider, 1, 0), true)
  assert.equal(canSubmitMilestone(client, provider, 1, 0), false)
  assert.equal(canSubmitMilestone(stranger, provider, 1, 0), false)
  assert.equal(canSubmitMilestone(provider, provider, 1, 1), false)
  assert.equal(canSubmitMilestone(provider, provider, 2, 0), false)

  assert.equal(canApproveMilestone(client, client, 1, 1), true)
  assert.equal(canApproveMilestone(provider, client, 1, 1), false)
  assert.equal(canApproveMilestone(client, client, 1, 0), false)
  assert.equal(canApproveMilestone(client, client, 1, 2), false)
  assert.equal(canApproveMilestone(client, client, 2, 1), false)
})

test("formats USDT and computes monetary progress without floating point", () => {
  assert.equal(formatUsdt(3_000n * 10n ** 6n), "3,000 USDT")
  assert.equal(formatUsdt(3_000_250_001n), "3,000.250001 USDT")
  assert.equal(progressPercentage(3_000n * 10n ** 6n, 10_000n * 10n ** 6n), 30n)
  assert.equal(progressPercentage(1n, 3n), 33n)
})

test("evidence placeholder is deterministic and never accepts empty input", () => {
  assert.equal(
    hashEvidenceNote("Website homepage completed"),
    hashEvidenceNote("Website homepage completed")
  )
  assert.equal(hashEvidenceNote("   "), undefined)
})

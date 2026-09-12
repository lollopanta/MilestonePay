import assert from "node:assert/strict"
import test from "node:test"

import {
  FUJI_DEPLOYMENT_BLOCK,
  RECENT_BLOCK_WINDOW,
  blockDate,
  recentBlockRange,
} from "./explorer/blocks"

test("limits the explorer feed to the configured recent block window", () => {
  const range = recentBlockRange(
    FUJI_DEPLOYMENT_BLOCK + RECENT_BLOCK_WINDOW + 1n
  )

  assert.equal(range.fromBlock, FUJI_DEPLOYMENT_BLOCK + 1n)
  assert.equal(range.toBlock, FUJI_DEPLOYMENT_BLOCK + RECENT_BLOCK_WINDOW + 1n)
})

test("never queries before the canonical deployment block", () => {
  assert.deepEqual(recentBlockRange(FUJI_DEPLOYMENT_BLOCK + 10n), {
    fromBlock: FUJI_DEPLOYMENT_BLOCK,
    toBlock: FUJI_DEPLOYMENT_BLOCK + 10n,
  })
})

test("converts an on-chain timestamp from seconds to a date", () => {
  assert.equal(
    blockDate(1_700_000_000n).toISOString(),
    "2023-11-14T22:13:20.000Z"
  )
})

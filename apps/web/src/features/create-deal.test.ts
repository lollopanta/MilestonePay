import assert from "node:assert/strict"
import test from "node:test"

import { allocationFor } from "./create-deal/allocation"

test("sums valid milestone amounts at token precision", () => {
  const allocation = allocationFor(["250", "499.5", "0.5"])

  assert.equal("error" in allocation, false)
  assert.equal(allocation.total, 750n * 10n ** 6n)
})

test("rejects empty and non-positive milestone values", () => {
  assert.equal("error" in allocationFor([""]), true)
  assert.equal("error" in allocationFor(["0"]), true)
})

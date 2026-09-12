import assert from "node:assert/strict"
import { test } from "node:test"

import { eventPresentation, sortEvents } from "./presentation.js"

test("presents and orders indexed protocol events", () => {
  const events = sortEvents([
    { event_name: "EscrowCreated", block_number: 10 },
    {
      event_name: "DisputeResolved",
      block_number: 12,
      provider_amount: "490000000",
    },
  ])

  assert.equal(eventPresentation(events[0]!).title, "Dispute resolved")
  assert.equal(eventPresentation(events[0]!).amount, "490000000")
})

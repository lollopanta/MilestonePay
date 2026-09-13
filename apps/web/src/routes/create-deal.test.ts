import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"

test("create-deal discovers registered arbiter identities instead of collecting manual proofs", async () => {
  const source = await readFile(new URL("./create-deal.tsx", import.meta.url), "utf8")
  assert.equal(source.includes(["arbiter", "SwarmPublicKey"].join("")), false)
  assert.equal(source.includes(["arbiter", "SwarmSignature"].join("")), false)
  assert.match(source, /arbiterSwarmIdentity/)
  assert.match(source, /verifyEvidenceIdentity/)
})

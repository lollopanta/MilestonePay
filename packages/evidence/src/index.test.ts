import assert from "node:assert/strict"
import { test } from "node:test"
import { canonicalizeEvidenceDescriptor, hashEvidenceDescriptor, validateEvidenceDescriptor, type EvidenceDescriptorV1 } from "./index.js"

const descriptor: EvidenceDescriptorV1 = { version: 1, kind: "milestone", chainId: 43113, escrow: "0x0000000000000000000000000000000000000001", milestoneId: 0, act: { encryptedReference: "a".repeat(64), historyReference: "b".repeat(64), publisherPublicKey: `02${"c".repeat(64)}`, actReference: "d".repeat(64) }, createdAt: 1_700_000_000 }

test("canonical evidence commitment is construction-order independent", () => {
  const reordered = { escrow: descriptor.escrow, createdAt: descriptor.createdAt, act: { actReference: descriptor.act.actReference, publisherPublicKey: descriptor.act.publisherPublicKey, historyReference: descriptor.act.historyReference, encryptedReference: descriptor.act.encryptedReference }, kind: descriptor.kind, version: 1, milestoneId: 0, chainId: 43113 } as EvidenceDescriptorV1
  assert.equal(canonicalizeEvidenceDescriptor(descriptor), canonicalizeEvidenceDescriptor(reordered))
  assert.equal(hashEvidenceDescriptor(descriptor), hashEvidenceDescriptor(reordered))
  assert.notEqual(hashEvidenceDescriptor(descriptor), hashEvidenceDescriptor({ ...descriptor, milestoneId: 1 }))
})

test("descriptor validation rejects public metadata that could be malformed", () => {
  assert.throws(() => validateEvidenceDescriptor({ ...descriptor, act: { ...descriptor.act, encryptedReference: "not-a-reference" } }))
})

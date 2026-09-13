import assert from "node:assert/strict"
import { test } from "node:test"
import { privateKeyToAccount } from "viem/accounts"
import { canonicalizeAgreementEvidenceIdentity, canonicalizeDisputeEvidenceSnapshot, canonicalizeEvidenceDescriptor, createEvidenceClient, decodeMilestoneEvidenceBundle, encodeMilestoneEvidenceBundle, evidenceIdentityMessage, hashAgreementEvidenceIdentity, hashDisputeEvidenceSnapshot, hashEvidenceDescriptor, sha256, validateEvidenceDescriptor, verifyAgreementEvidenceIdentity, type AgreementEvidenceIdentityV1, type DisputeEvidenceSnapshotV1, type EvidenceDescriptorV1 } from "./index.js"

const descriptor: EvidenceDescriptorV1 = { version: 1, kind: "milestone", chainId: 43113, escrow: "0x0000000000000000000000000000000000000001", milestoneId: 0, act: { encryptedReference: "a".repeat(64), historyReference: "b".repeat(64), publisherPublicKey: `02${"c".repeat(64)}`, actReference: "d".repeat(64) }, createdAt: 1_700_000_000 }

test("canonical evidence commitment is construction-order independent", () => {
  const reordered = { escrow: descriptor.escrow, createdAt: descriptor.createdAt, act: { actReference: descriptor.act.actReference, publisherPublicKey: descriptor.act.publisherPublicKey, historyReference: descriptor.act.historyReference, encryptedReference: descriptor.act.encryptedReference }, kind: descriptor.kind, version: 1, milestoneId: 0, chainId: 43113 } as EvidenceDescriptorV1
  assert.equal(canonicalizeEvidenceDescriptor(descriptor), canonicalizeEvidenceDescriptor(reordered))
  assert.equal(hashEvidenceDescriptor(descriptor), hashEvidenceDescriptor(reordered))
  assert.notEqual(hashEvidenceDescriptor(descriptor), hashEvidenceDescriptor({ ...descriptor, milestoneId: 1 }))
})

test("descriptor validation rejects public metadata that could be malformed", () => {
  assert.throws(() => validateEvidenceDescriptor({ ...descriptor, act: { ...descriptor.act, encryptedReference: "not-a-reference" } }))
  assert.throws(() => validateEvidenceDescriptor({ ...descriptor, plaintext: "never accepted" }))
})

test("agreement identity is a signed, stable arbiter commitment", async () => {
  const account = privateKeyToAccount(`0x${"1".repeat(64)}`)
  const identity: AgreementEvidenceIdentityV1 = {
    version: 1,
    chainId: 43113,
    escrow: descriptor.escrow,
    role: "arbiter",
    identity: { wallet: account.address, swarmPublicKey: `02${"d".repeat(64)}`, signature: await account.signMessage({ message: evidenceIdentityMessage(account.address, `02${"d".repeat(64)}`, 43113) }) },
  }
  assert.equal(await verifyAgreementEvidenceIdentity(identity), true)
  assert.equal(hashAgreementEvidenceIdentity(identity), hashAgreementEvidenceIdentity(JSON.parse(canonicalizeAgreementEvidenceIdentity(identity))))
})

test("adding the bound arbiter is idempotent and snapshots the patched ACT state", async () => {
  let adds = 0
  const arbiter = `02${"e".repeat(64)}`
  const grantees: string[] = []
  const client = createEvidenceClient({
    actUploadData: async () => ({ encryptedReference: "", historyReference: "", publisherPubKey: "", actReference: "" }),
    actDownloadData: async () => new Uint8Array(),
    actGetGrantees: async () => grantees,
    actAddGrantees: async (_history, values) => { adds++; grantees.push(...values); return { historyReference: "e".repeat(64), actReference: "f".repeat(64) } },
    actRevokeGrantees: async () => ({ encryptedReference: "", historyReference: "", actReference: "" }),
  })
  const first = await client.addGrantees(descriptor, [arbiter])
  const second = await client.addGrantees(descriptor, [arbiter])
  assert.equal(first.patched, true)
  assert.equal(second.patched, false)
  assert.equal(adds, 1)
  const snapshot: DisputeEvidenceSnapshotV1 = { version: 1, kind: "dispute-provider", chainId: 43113, escrow: descriptor.escrow, milestoneId: 0, sourceEvidenceHash: hashEvidenceDescriptor(descriptor), act: { ...descriptor.act, historyReference: first.historyReference, actReference: first.actReference }, arbiterIdentityCommitment: `0x${"a".repeat(64)}` }
  assert.equal(hashDisputeEvidenceSnapshot(snapshot), hashDisputeEvidenceSnapshot(JSON.parse(canonicalizeDisputeEvidenceSnapshot(snapshot))))
})

test("an ACT patch failure leaves evidence unsealed and retryable", async () => {
  const client = createEvidenceClient({
    actUploadData: async () => ({ encryptedReference: "", historyReference: "", publisherPubKey: "", actReference: "" }),
    actDownloadData: async () => new Uint8Array(),
    actGetGrantees: async () => [],
    actAddGrantees: async () => { throw new Error("publisher unavailable") },
    actRevokeGrantees: async () => ({ encryptedReference: "", historyReference: "", actReference: "" }),
  })
  await assert.rejects(() => client.addGrantees(descriptor, [`02${"e".repeat(64)}`]))
})

test("private delivery bundles preserve notes, multiple files, integrity, and legacy text", async () => {
  const first = new TextEncoder().encode("first")
  const second = new TextEncoder().encode("second")
  const encoded = await encodeMilestoneEvidenceBundle({ note: "Private delivery", attachments: [{ name: "../first.txt", type: "text/plain", bytes: first, sha256: await sha256(first) }, { name: "second.txt", type: "text/plain", bytes: second, sha256: await sha256(second) }] })
  const decoded = await decodeMilestoneEvidenceBundle(encoded)
  assert.equal(decoded.note, "Private delivery")
  assert.deepEqual(decoded.attachments.map((file) => file.name), [".._first.txt", "second.txt"])
  assert.equal((await decodeMilestoneEvidenceBundle(new TextEncoder().encode("old text-only note"))).note, "old text-only note")
  await assert.rejects(() => decodeMilestoneEvidenceBundle(new TextEncoder().encode('{"version":1,"note":"x","attachments":[{"name":"x","type":"text/plain","data":"eA==","sha256":"' + "0".repeat(64) + '"}]}')))
})

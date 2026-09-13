/* global Buffer, btoa, atob, TextEncoder, TextDecoder, crypto */
import { isAddress, keccak256, toBytes, verifyMessage, type Address, type Hex } from "viem"

export type EvidenceKind = "milestone" | "dispute-client" | "dispute-provider"
export type ParticipantEvidenceIdentity = { wallet: Address; swarmPublicKey: string; signature: Hex }
export type EvidenceDescriptorV1 = {
  version: 1
  kind: EvidenceKind
  chainId: number
  escrow: Address
  milestoneId: number
  act: { encryptedReference: string; historyReference: string; publisherPublicKey: string; actReference: string }
  createdAt: number
}
export type AgreementIdentityRole = "client" | "provider" | "arbiter"
export type ChatRole = "client" | "provider"
export type AgreementChatFeedBindingV1 = { version: 1; chainId: number; escrow: Address; role: ChatRole; wallet: Address; feedOwner: Address; topic: Hex; signature: Hex }
export type ChatMessageV1 = { version: 1; chainId: number; escrow: Address; sender: Address; senderRole: ChatRole; createdAt: number; messageId: Hex; text: string }
export type ChatFeedEntryV1 = { version: 1; messageId: Hex; act: EvidenceDescriptorV1["act"] }
export type AgreementEvidenceIdentityV1 = {
  version: 1
  chainId: number
  escrow: Address
  role: AgreementIdentityRole
  identity: ParticipantEvidenceIdentity
}
/**
 * The immutable arbitration input. It freezes the ACT version under review;
 * ACT history cannot revoke a reader's knowledge of an earlier version.
 */
export type DisputeEvidenceSnapshotV1 = {
  version: 1
  kind: "dispute-client" | "dispute-provider"
  chainId: number
  escrow: Address
  milestoneId: number
  sourceEvidenceHash: Hex
  act: EvidenceDescriptorV1["act"]
  arbiterIdentityCommitment: Hex
}
export type DisputeEvidenceSealV1 = {
  version: 1
  snapshot: DisputeEvidenceSnapshotV1
  publisher: Address
  signature: Hex
}

export type SwarmActClient = {
  actUploadData(data: Uint8Array, grantees: string[]): Promise<{ encryptedReference: string; historyReference: string; publisherPubKey: string; actReference: string }>
  actDownloadData(encryptedReference: string, historyReference: string, publisherPubKey: string): Promise<Uint8Array>
  actAddGrantees(historyReference: string, grantees: string[]): Promise<{ historyReference: string; actReference: string }>
  actGetGrantees(historyReference: string): Promise<string[]>
  actRevokeGrantees(historyReference: string, encryptedReference: string, grantees: string[]): Promise<{ encryptedReference: string; historyReference: string; actReference: string }>
}

const reference = /^[0-9a-f]{64,128}$/i
const publicKey = /^(?:0x)?[0-9a-f]{66}$/i
const kinds = new Set<EvidenceKind>(["milestone", "dispute-client", "dispute-provider"])
const identityRoles = new Set<AgreementIdentityRole>(["client", "provider", "arbiter"])
const chatRoles = new Set<ChatRole>(["client", "provider"])

export const MAX_EVIDENCE_ATTACHMENT_BYTES = 10 * 1024 * 1024
export type EvidenceAttachmentV1 = { name: string; type: string; bytes: Uint8Array; sha256: string }
export type MilestoneEvidenceBundleV1 = { version: 1; note: string; attachments: EvidenceAttachmentV1[] }

// eslint-disable-next-line no-control-regex
const safeName = (name: string) => name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").slice(0, 128) || "download"
const base64 = (bytes: Uint8Array) => typeof Buffer !== "undefined" ? Buffer.from(bytes).toString("base64") : btoa(String.fromCharCode(...bytes))
const unbase64 = (value: string) => typeof Buffer !== "undefined" ? new Uint8Array(Buffer.from(value, "base64")) : Uint8Array.from(atob(value), (char) => char.charCodeAt(0))

/** Private payload only: this is uploaded under ACT, never sent to Arkiv or Fastify. */
export async function encodeMilestoneEvidenceBundle(bundle: Omit<MilestoneEvidenceBundleV1, "version">) {
  if (!bundle.note.trim() && !bundle.attachments.length) throw new Error("Add a delivery note or file")
  if (bundle.attachments.some((file) => !file.bytes.byteLength || file.bytes.byteLength > MAX_EVIDENCE_ATTACHMENT_BYTES || !/^[a-f0-9]{64}$/i.test(file.sha256))) throw new Error("Invalid delivery attachment")
  return new TextEncoder().encode(JSON.stringify({ version: 1, note: bundle.note, attachments: bundle.attachments.map((file) => ({ name: safeName(file.name), type: file.type.slice(0, 128), data: base64(file.bytes), sha256: file.sha256 })) }))
}

export async function decodeMilestoneEvidenceBundle(data: Uint8Array): Promise<MilestoneEvidenceBundleV1> {
  const text = new TextDecoder().decode(data)
  // V1 text-only evidence predates bundles and remains readable.
  if (!text.trim().startsWith("{")) return { version: 1, note: text, attachments: [] }
  let value: { version?: unknown; note?: unknown; attachments?: unknown }
  try { value = JSON.parse(text) } catch { throw new Error("Malformed private evidence bundle") }
  if (value.version !== 1 || typeof value.note !== "string" || !Array.isArray(value.attachments)) throw new Error("Malformed private evidence bundle")
  const attachments = await Promise.all(value.attachments.map(async (file) => {
    if (!file || typeof file !== "object") throw new Error("Malformed private evidence attachment")
    const entry = file as { name?: unknown; type?: unknown; data?: unknown; sha256?: unknown }
    if (typeof entry.name !== "string" || typeof entry.type !== "string" || typeof entry.data !== "string" || typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(entry.sha256)) throw new Error("Malformed private evidence attachment")
    const bytes = unbase64(entry.data)
    if (!bytes.byteLength || bytes.byteLength > MAX_EVIDENCE_ATTACHMENT_BYTES || (await sha256(bytes)) !== entry.sha256.toLowerCase()) throw new Error("Evidence attachment integrity check failed")
    return { name: safeName(entry.name), type: entry.type, bytes, sha256: entry.sha256.toLowerCase() }
  }))
  return { version: 1, note: value.note, attachments }
}

export async function sha256(data: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", data as BufferSource)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export function chatFeedTopic(chainId: number, escrow: Address, role: ChatRole): Hex {
  if (!Number.isSafeInteger(chainId) || chainId <= 0 || !isAddress(escrow) || !chatRoles.has(role)) throw new Error("Invalid chat feed topic")
  return keccak256(toBytes(`milestonepay-chat-v1:${chainId}:${escrow.toLowerCase()}:${role}`))
}
export function chatFeedBindingMessage(value: Omit<AgreementChatFeedBindingV1, "signature">) {
  validateChatFeedBinding({ ...value, signature: `0x${"0".repeat(130)}` })
  return `MilestonePay Chat Feed v1\nchainId: ${value.chainId}\nescrow: ${value.escrow.toLowerCase()}\nrole: ${value.role}\nwallet: ${value.wallet.toLowerCase()}\nfeedOwner: ${value.feedOwner.toLowerCase()}\ntopic: ${value.topic.toLowerCase()}`
}
export function canonicalizeChatFeedBinding(value: AgreementChatFeedBindingV1) { validateChatFeedBinding(value); return `{"version":1,"chainId":${value.chainId},"escrow":${quoted(value.escrow.toLowerCase())},"role":${quoted(value.role)},"wallet":${quoted(value.wallet.toLowerCase())},"feedOwner":${quoted(value.feedOwner.toLowerCase())},"topic":${quoted(value.topic.toLowerCase())},"signature":${quoted(value.signature.toLowerCase())}}` }
export function validateChatFeedBinding(value: unknown): asserts value is AgreementChatFeedBindingV1 {
  const binding = value as AgreementChatFeedBindingV1
  if (!binding || Object.keys(binding).length !== 8 || binding.version !== 1 || !Number.isSafeInteger(binding.chainId) || binding.chainId <= 0 || !isAddress(binding.escrow) || !chatRoles.has(binding.role) || !isAddress(binding.wallet) || !isAddress(binding.feedOwner) || !/^0x[0-9a-f]{64}$/i.test(binding.topic) || !/^0x[0-9a-f]{130}$/i.test(binding.signature) || binding.topic.toLowerCase() !== chatFeedTopic(binding.chainId, binding.escrow, binding.role).toLowerCase()) throw new Error("Invalid chat feed binding")
}
export async function verifyChatFeedBinding(value: AgreementChatFeedBindingV1) { validateChatFeedBinding(value); return verifyMessage({ address: value.wallet, message: chatFeedBindingMessage(value), signature: value.signature }) }
export function canonicalizeChatMessage(value: Omit<ChatMessageV1, "messageId">) {
  if (value.version !== 1 || !Number.isSafeInteger(value.chainId) || value.chainId <= 0 || !isAddress(value.escrow) || !isAddress(value.sender) || !chatRoles.has(value.senderRole) || !Number.isSafeInteger(value.createdAt) || value.createdAt <= 0 || typeof value.text !== "string" || !value.text.trim() || value.text.length > 4_000) throw new Error("Invalid private chat message")
  return `{"version":1,"chainId":${value.chainId},"escrow":${quoted(value.escrow.toLowerCase())},"sender":${quoted(value.sender.toLowerCase())},"senderRole":${quoted(value.senderRole)},"createdAt":${value.createdAt},"text":${quoted(value.text)}}`
}
export function createChatMessage(value: Omit<ChatMessageV1, "messageId">): ChatMessageV1 { return { ...value, messageId: keccak256(toBytes(canonicalizeChatMessage(value))) } }
export function validateChatMessage(value: unknown): asserts value is ChatMessageV1 { const message = value as ChatMessageV1; if (!message || !/^0x[0-9a-f]{64}$/i.test(message.messageId) || message.messageId.toLowerCase() !== keccak256(toBytes(canonicalizeChatMessage(message))).toLowerCase()) throw new Error("Invalid private chat message") }
export function validateChatFeedEntry(value: unknown): asserts value is ChatFeedEntryV1 { const entry = value as ChatFeedEntryV1; if (!entry || Object.keys(entry).length !== 3 || entry.version !== 1 || !/^0x[0-9a-f]{64}$/i.test(entry.messageId)) throw new Error("Invalid chat feed entry"); validateEvidenceDescriptor({ version: 1, kind: "milestone", chainId: 1, escrow: "0x0000000000000000000000000000000000000001", milestoneId: 0, createdAt: 1, act: entry.act }) }

function quoted(value: string) { return JSON.stringify(value) }
function key(value: string) { return value.replace(/^0x/, "").toLowerCase() }

export function evidenceIdentityMessage(wallet: Address, swarmPublicKey: string, chainId: number) {
  if (!isAddress(wallet) || !publicKey.test(swarmPublicKey) || !Number.isSafeInteger(chainId) || chainId <= 0) throw new Error("Invalid evidence identity")
  return `MilestonePay Swarm Identity v1\nwallet: ${wallet.toLowerCase()}\nswarmPublicKey: ${key(swarmPublicKey)}\nchainId: ${chainId}`
}

export async function verifyEvidenceIdentity(identity: ParticipantEvidenceIdentity, chainId: number) {
  return isAddress(identity.wallet) && publicKey.test(identity.swarmPublicKey) && await verifyMessage({ address: identity.wallet, message: evidenceIdentityMessage(identity.wallet, identity.swarmPublicKey, chainId), signature: identity.signature })
}

export function validateAgreementEvidenceIdentity(value: unknown): asserts value is AgreementEvidenceIdentityV1 {
  const binding = value as AgreementEvidenceIdentityV1
  if (!binding || binding.version !== 1 || !Number.isSafeInteger(binding.chainId) || binding.chainId <= 0 || !isAddress(binding.escrow) || !identityRoles.has(binding.role) || !binding.identity) throw new Error("Invalid agreement evidence identity")
}

export async function verifyAgreementEvidenceIdentity(value: AgreementEvidenceIdentityV1) {
  validateAgreementEvidenceIdentity(value)
  return verifyEvidenceIdentity(value.identity, value.chainId)
}

export function canonicalizeAgreementEvidenceIdentity(value: AgreementEvidenceIdentityV1) {
  validateAgreementEvidenceIdentity(value)
  const { identity } = value
  return `{"version":1,"chainId":${value.chainId},"escrow":${quoted(value.escrow.toLowerCase())},"role":${quoted(value.role)},"identity":{"wallet":${quoted(identity.wallet.toLowerCase())},"swarmPublicKey":${quoted(key(identity.swarmPublicKey))},"signature":${quoted(identity.signature.toLowerCase())}}}`
}

export function hashAgreementEvidenceIdentity(value: AgreementEvidenceIdentityV1): Hex { return keccak256(toBytes(canonicalizeAgreementEvidenceIdentity(value))) }

export function validateEvidenceDescriptor(value: unknown): asserts value is EvidenceDescriptorV1 {
  const d = value as EvidenceDescriptorV1
  if (!d || Object.keys(d).length !== 7 || !["version", "kind", "chainId", "escrow", "milestoneId", "act", "createdAt"].every((field) => field in d) || d.version !== 1 || !kinds.has(d.kind) || !Number.isSafeInteger(d.chainId) || d.chainId <= 0 || !isAddress(d.escrow) || !Number.isSafeInteger(d.milestoneId) || d.milestoneId < 0 || !Number.isSafeInteger(d.createdAt) || d.createdAt <= 0 || !d.act || Object.keys(d.act).length !== 4 || !["encryptedReference", "historyReference", "publisherPublicKey", "actReference"].every((field) => field in d.act) || !reference.test(d.act.encryptedReference) || !reference.test(d.act.historyReference) || !reference.test(d.act.actReference) || !publicKey.test(d.act.publisherPublicKey)) throw new Error("Invalid evidence descriptor")
}

/** Fixed-key JSON is the V1 commitment format; do not replace with arbitrary JSON.stringify. */
export function canonicalizeEvidenceDescriptor(value: EvidenceDescriptorV1) {
  validateEvidenceDescriptor(value)
  const d = value
  return `{"version":1,"kind":${quoted(d.kind)},"chainId":${d.chainId},"escrow":${quoted(d.escrow.toLowerCase())},"milestoneId":${d.milestoneId},"act":{"encryptedReference":${quoted(key(d.act.encryptedReference))},"historyReference":${quoted(key(d.act.historyReference))},"publisherPublicKey":${quoted(key(d.act.publisherPublicKey))},"actReference":${quoted(key(d.act.actReference))}},"createdAt":${d.createdAt}}`
}

export function hashEvidenceDescriptor(value: EvidenceDescriptorV1): Hex { return keccak256(toBytes(canonicalizeEvidenceDescriptor(value))) }

export function validateDisputeEvidenceSnapshot(value: unknown): asserts value is DisputeEvidenceSnapshotV1 {
  const snapshot = value as DisputeEvidenceSnapshotV1
  if (!snapshot || Object.keys(snapshot).length !== 8 || snapshot.version !== 1 || (snapshot.kind !== "dispute-client" && snapshot.kind !== "dispute-provider") || !Number.isSafeInteger(snapshot.chainId) || snapshot.chainId <= 0 || !isAddress(snapshot.escrow) || !Number.isSafeInteger(snapshot.milestoneId) || snapshot.milestoneId < 0 || !/^0x[0-9a-f]{64}$/i.test(snapshot.sourceEvidenceHash) || !/^0x[0-9a-f]{64}$/i.test(snapshot.arbiterIdentityCommitment)) throw new Error("Invalid dispute evidence snapshot")
  validateEvidenceDescriptor({ version: 1, kind: snapshot.kind, chainId: snapshot.chainId, escrow: snapshot.escrow, milestoneId: snapshot.milestoneId, act: snapshot.act, createdAt: 1 })
}

export function canonicalizeDisputeEvidenceSnapshot(value: DisputeEvidenceSnapshotV1) {
  validateDisputeEvidenceSnapshot(value)
  const snapshot = value
  return `{"version":1,"kind":${quoted(snapshot.kind)},"chainId":${snapshot.chainId},"escrow":${quoted(snapshot.escrow.toLowerCase())},"milestoneId":${snapshot.milestoneId},"sourceEvidenceHash":${quoted(snapshot.sourceEvidenceHash.toLowerCase())},"act":{"encryptedReference":${quoted(key(snapshot.act.encryptedReference))},"historyReference":${quoted(key(snapshot.act.historyReference))},"publisherPublicKey":${quoted(key(snapshot.act.publisherPublicKey))},"actReference":${quoted(key(snapshot.act.actReference))}},"arbiterIdentityCommitment":${quoted(snapshot.arbiterIdentityCommitment.toLowerCase())}}`
}

export function hashDisputeEvidenceSnapshot(value: DisputeEvidenceSnapshotV1): Hex { return keccak256(toBytes(canonicalizeDisputeEvidenceSnapshot(value))) }

export function disputeEvidenceSealMessage(snapshot: DisputeEvidenceSnapshotV1) {
  return `MilestonePay Dispute Evidence Seal v1\nsnapshot: ${hashDisputeEvidenceSnapshot(snapshot)}`
}

export function validateDisputeEvidenceSeal(value: unknown): asserts value is DisputeEvidenceSealV1 {
  const seal = value as DisputeEvidenceSealV1
  if (!seal || Object.keys(seal).length !== 4 || seal.version !== 1 || !isAddress(seal.publisher) || !/^0x[0-9a-f]{130}$/i.test(seal.signature)) throw new Error("Invalid dispute evidence seal")
  validateDisputeEvidenceSnapshot(seal.snapshot)
}

export async function verifyDisputeEvidenceSeal(value: DisputeEvidenceSealV1) {
  validateDisputeEvidenceSeal(value)
  return verifyMessage({ address: value.publisher, message: disputeEvidenceSealMessage(value.snapshot), signature: value.signature })
}

export function createEvidenceClient(client: SwarmActClient) {
  return {
    async uploadEvidence(data: Uint8Array, input: Omit<EvidenceDescriptorV1, "version" | "act"> & { grantees: readonly ParticipantEvidenceIdentity[] }) {
      if (!data.byteLength || input.grantees.length === 0) throw new Error("Evidence and participant identities are required")
      for (const identity of input.grantees) if (!await verifyEvidenceIdentity(identity, input.chainId)) throw new Error("Unverified participant Swarm identity")
      const uploaded = await client.actUploadData(data, [...new Set(input.grantees.map((identity) => key(identity.swarmPublicKey)))])
      const descriptor: EvidenceDescriptorV1 = { version: 1, kind: input.kind, chainId: input.chainId, escrow: input.escrow, milestoneId: input.milestoneId, createdAt: input.createdAt, act: { encryptedReference: uploaded.encryptedReference, historyReference: uploaded.historyReference, publisherPublicKey: uploaded.publisherPubKey, actReference: uploaded.actReference } }
      return { descriptor, evidenceHash: hashEvidenceDescriptor(descriptor) }
    },
    downloadEvidence(descriptor: EvidenceDescriptorV1) { validateEvidenceDescriptor(descriptor); return client.actDownloadData(descriptor.act.encryptedReference, descriptor.act.historyReference, descriptor.act.publisherPublicKey) },
    async addGrantees(descriptor: EvidenceDescriptorV1, grantees: readonly string[]) {
      validateEvidenceDescriptor(descriptor)
      const requested = [...new Set(grantees.map(key))]
      const existing = new Set((await client.actGetGrantees(descriptor.act.historyReference)).map(key))
      const missing = requested.filter((grantee) => !existing.has(grantee))
      if (!missing.length) return { historyReference: descriptor.act.historyReference, actReference: descriptor.act.actReference, patched: false }
      return { ...await client.actAddGrantees(descriptor.act.historyReference, missing), patched: true }
    },
    revokeGrantees(descriptor: EvidenceDescriptorV1, grantees: readonly string[]) { validateEvidenceDescriptor(descriptor); return client.actRevokeGrantees(descriptor.act.historyReference, descriptor.act.encryptedReference, grantees.map(key)) },
  }
}

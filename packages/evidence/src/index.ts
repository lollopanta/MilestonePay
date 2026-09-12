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

export type SwarmActClient = {
  actUploadData(data: Uint8Array, grantees: string[]): Promise<{ encryptedReference: string; historyReference: string; publisherPubKey: string; actReference: string }>
  actDownloadData(encryptedReference: string, historyReference: string, publisherPubKey: string): Promise<Uint8Array>
  actAddGrantees(historyReference: string, grantees: string[]): Promise<{ historyReference: string; actReference: string }>
  actRevokeGrantees(historyReference: string, encryptedReference: string, grantees: string[]): Promise<{ encryptedReference: string; historyReference: string; actReference: string }>
}

const reference = /^[0-9a-f]{64,128}$/i
const publicKey = /^(?:0x)?[0-9a-f]{66}$/i
const kinds = new Set<EvidenceKind>(["milestone", "dispute-client", "dispute-provider"])

function quoted(value: string) { return JSON.stringify(value) }
function key(value: string) { return value.replace(/^0x/, "").toLowerCase() }

export function evidenceIdentityMessage(wallet: Address, swarmPublicKey: string, chainId: number) {
  if (!isAddress(wallet) || !publicKey.test(swarmPublicKey) || !Number.isSafeInteger(chainId) || chainId <= 0) throw new Error("Invalid evidence identity")
  return `MilestonePay Swarm Identity v1\nwallet: ${wallet.toLowerCase()}\nswarmPublicKey: ${key(swarmPublicKey)}\nchainId: ${chainId}`
}

export async function verifyEvidenceIdentity(identity: ParticipantEvidenceIdentity, chainId: number) {
  return isAddress(identity.wallet) && publicKey.test(identity.swarmPublicKey) && await verifyMessage({ address: identity.wallet, message: evidenceIdentityMessage(identity.wallet, identity.swarmPublicKey, chainId), signature: identity.signature })
}

export function validateEvidenceDescriptor(value: unknown): asserts value is EvidenceDescriptorV1 {
  const d = value as EvidenceDescriptorV1
  if (!d || d.version !== 1 || !kinds.has(d.kind) || !Number.isSafeInteger(d.chainId) || d.chainId <= 0 || !isAddress(d.escrow) || !Number.isSafeInteger(d.milestoneId) || d.milestoneId < 0 || !Number.isSafeInteger(d.createdAt) || d.createdAt <= 0 || !d.act || !reference.test(d.act.encryptedReference) || !reference.test(d.act.historyReference) || !reference.test(d.act.actReference) || !publicKey.test(d.act.publisherPublicKey)) throw new Error("Invalid evidence descriptor")
}

/** Fixed-key JSON is the V1 commitment format; do not replace with arbitrary JSON.stringify. */
export function canonicalizeEvidenceDescriptor(value: EvidenceDescriptorV1) {
  validateEvidenceDescriptor(value)
  const d = value
  return `{"version":1,"kind":${quoted(d.kind)},"chainId":${d.chainId},"escrow":${quoted(d.escrow.toLowerCase())},"milestoneId":${d.milestoneId},"act":{"encryptedReference":${quoted(key(d.act.encryptedReference))},"historyReference":${quoted(key(d.act.historyReference))},"publisherPublicKey":${quoted(key(d.act.publisherPublicKey))},"actReference":${quoted(key(d.act.actReference))}},"createdAt":${d.createdAt}}`
}

export function hashEvidenceDescriptor(value: EvidenceDescriptorV1): Hex { return keccak256(toBytes(canonicalizeEvidenceDescriptor(value))) }

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
    addGrantees(descriptor: EvidenceDescriptorV1, grantees: readonly string[]) { validateEvidenceDescriptor(descriptor); return client.actAddGrantees(descriptor.act.historyReference, grantees.map(key)) },
    revokeGrantees(descriptor: EvidenceDescriptorV1, grantees: readonly string[]) { validateEvidenceDescriptor(descriptor); return client.actRevokeGrantees(descriptor.act.historyReference, descriptor.act.encryptedReference, grantees.map(key)) },
  }
}

import { canonicalizeAgreementEvidenceIdentity, canonicalizeEvidenceDescriptor, canonicalizeDisputeEvidenceSnapshot, hashAgreementEvidenceIdentity, hashEvidenceDescriptor, hashDisputeEvidenceSnapshot, verifyAgreementEvidenceIdentity, verifyDisputeEvidenceSeal, type AgreementEvidenceIdentityV1, type DisputeEvidenceSealV1, type DisputeEvidenceSnapshotV1, type EvidenceDescriptorV1 } from "@milestonepay/evidence"
import { calculateReputation, type Address as ReputationAddress, type ReputationHistory } from "@milestonepay/reputation"
import { isAddress, type Address, type Hex } from "viem"
import { getAgreementIdentities, getAgreementIdentity, getDeal, getDisputeEvidenceForDispute, getDisputeEvidenceForSource, getEvidenceDescriptor, getWalletDisputes, getWalletHistory, getWalletSettlements } from "../arkiv/queries.js"
import { jsonSafe } from "../arkiv/schema.js"
import type { ArkivRepository } from "../arkiv/writer.js"
import type { AvalancheReader } from "../indexer/avalanche.js"

const lower = (value: string) => value.toLowerCase()
const asAddress = (value: string) => value as Address
export class ProtocolError extends Error { constructor(readonly statusCode: 400 | 404 | 409 | 503, message: string) { super(message) } }

export class ProtocolService {
  constructor(readonly repo: ArkivRepository, readonly reader: AvalancheReader) {}
  async deal(escrow: Address) {
    if (!await this.reader.isEscrow(escrow)) throw new ProtocolError(404, "Deal not found")
    const indexed = await getDeal(this.repo, escrow)
    if (!indexed) throw new ProtocolError(404, "Deal has not been indexed")
    const state = await this.reader.readEscrow(escrow)
    return { ...indexed.attributes, state: { status: state.status, currentMilestone: state.currentMilestone.toString(), totalReleased: state.totalReleased.toString(), totalRefunded: state.totalRefunded.toString() } }
  }
  async history(wallet: Address) {
    const [events, settlements, disputes, deals] = await Promise.all([getWalletHistory(this.repo, wallet), getWalletSettlements(this.repo, wallet), getWalletDisputes(this.repo, wallet), this.repo.all("deal")])
    const latestDeals = new Map<string, typeof deals[number]>()
    for (const deal of deals) {
      const escrow = lower(String(deal.attributes.escrow)); const current = latestDeals.get(escrow)
      if (!current || Number(deal.attributes.last_event_block) > Number(current.attributes.last_event_block) || deal.attributes.last_event_block === current.attributes.last_event_block && String(deal.attributes.last_event_id) > String(current.attributes.last_event_id)) latestDeals.set(escrow, deal)
    }
    const matchingDeals = [...latestDeals.values()].filter((deal) => lower(String(deal.attributes.client)) === lower(wallet) || lower(String(deal.attributes.provider)) === lower(wallet))
    return { deals: matchingDeals.map((deal) => deal.attributes), events: events.map((event) => event.attributes), settlements: settlements.map((settlement) => settlement.attributes), disputes: disputes.map((dispute) => dispute.attributes) }
  }
  async reputation(wallet: Address) { return jsonSafe(calculateReputation(wallet as ReputationAddress, normalizeProtocolHistory(await this.history(wallet)))) }
  async registerEvidence(descriptor: EvidenceDescriptorV1) {
    const hash = hashEvidenceDescriptor(descriptor)
    if (descriptor.chainId !== this.reader.chainId || !await this.reader.isEscrow(descriptor.escrow)) throw new ProtocolError(404, "Canonical deal not found")
    let committed: Hex
    try { committed = await this.reader.evidenceHash(descriptor.escrow, BigInt(descriptor.milestoneId), descriptor.kind) } catch { throw new ProtocolError(404, "Evidence commitment not found") }
    if (lower(committed) !== lower(hash)) throw new ProtocolError(404, "Evidence commitment not found")
    const existing = await getEvidenceDescriptor(this.repo, hash)
    if (existing) {
      if (canonicalizeEvidenceDescriptor(existing.payload as EvidenceDescriptorV1) !== canonicalizeEvidenceDescriptor(descriptor)) throw new ProtocolError(409, "Evidence hash conflicts with an existing descriptor")
      return { evidenceHash: hash, descriptor: existing.payload }
    }
    await this.repo.put({ type: "evidence", attributes: { evidence_hash: lower(hash), chain_id: descriptor.chainId, escrow: lower(descriptor.escrow), milestone_id: descriptor.milestoneId, kind: descriptor.kind }, payload: descriptor })
    return { evidenceHash: hash, descriptor }
  }
  async evidence(hash: Hex) { const evidence = await getEvidenceDescriptor(this.repo, hash); if (!evidence) throw new ProtocolError(404, "Evidence descriptor not found"); return { evidenceHash: evidence.attributes.evidence_hash, descriptor: evidence.payload } }
  async bindAgreementIdentity(binding: AgreementEvidenceIdentityV1) {
    if (binding.chainId !== this.reader.chainId || !await this.reader.isEscrow(binding.escrow)) throw new ProtocolError(404, "Canonical deal not found")
    if (!await verifyAgreementEvidenceIdentity(binding)) throw new ProtocolError(400, "Invalid signed Swarm identity")
    const state = await this.reader.readEscrow(binding.escrow)
    const expected = binding.role === "client" ? state.client : binding.role === "provider" ? state.provider : state.arbiter
    if (lower(binding.identity.wallet) !== lower(expected)) throw new ProtocolError(400, "Swarm identity does not belong to the agreement role")
    const existing = await getAgreementIdentity(this.repo, binding.escrow, binding.role)
    if (existing) {
      if (canonicalizeAgreementEvidenceIdentity(existing.payload as AgreementEvidenceIdentityV1) !== canonicalizeAgreementEvidenceIdentity(binding)) throw new ProtocolError(409, "Agreement Swarm identity is already bound")
      return { commitment: existing.attributes.commitment, binding: existing.payload }
    }
    const commitment = hashAgreementEvidenceIdentity(binding)
    await this.repo.put({ type: "agreement_identity", attributes: { identity_id: `${binding.escrow.toLowerCase()}:${binding.role}`, escrow: binding.escrow.toLowerCase(), role: binding.role, commitment: commitment.toLowerCase() }, payload: binding })
    return { commitment, binding }
  }
  async agreementIdentities(escrow: Address) {
    if (!await this.reader.isEscrow(escrow)) throw new ProtocolError(404, "Deal not found")
    const [client, arbiter] = await getAgreementIdentities(this.repo, escrow)
    const provider = await getAgreementIdentity(this.repo, escrow, "provider")
    if (!client || !arbiter) throw new ProtocolError(404, "Agreement Swarm identities have not been bound")
    return { client: { commitment: client.attributes.commitment, binding: client.payload }, ...(provider ? { provider: { commitment: provider.attributes.commitment, binding: provider.payload } } : {}), arbiter: { commitment: arbiter.attributes.commitment, binding: arbiter.payload } }
  }
  async registerDisputeEvidence(seal: DisputeEvidenceSealV1) {
    const { snapshot } = seal
    const hash = hashDisputeEvidenceSnapshot(snapshot)
    if (snapshot.chainId !== this.reader.chainId || !await this.reader.isEscrow(snapshot.escrow)) throw new ProtocolError(404, "Canonical deal not found")
    const state = await this.reader.readEscrow(snapshot.escrow)
    if (state.status !== "disputed" || state.currentMilestone !== BigInt(snapshot.milestoneId)) throw new ProtocolError(409, "Dispute is not open for this milestone")
    if (lower(seal.publisher) !== lower(state.provider) || !await verifyDisputeEvidenceSeal(seal)) throw new ProtocolError(400, "Dispute evidence seal is not authorized by the publisher")
    const source = await getEvidenceDescriptor(this.repo, snapshot.sourceEvidenceHash)
    if (!source || source.attributes.escrow !== lower(snapshot.escrow) || Number(source.attributes.milestone_id) !== snapshot.milestoneId || source.attributes.kind !== "milestone") throw new ProtocolError(404, "Milestone evidence descriptor not found")
    const arbiter = await getAgreementIdentity(this.repo, snapshot.escrow, "arbiter")
    if (!arbiter || lower(String(arbiter.attributes.commitment)) !== lower(snapshot.arbiterIdentityCommitment)) throw new ProtocolError(409, "Dispute evidence does not use the bound arbiter identity")
    const existing = await getDisputeEvidenceForSource(this.repo, snapshot.escrow, snapshot.milestoneId, snapshot.sourceEvidenceHash, snapshot.arbiterIdentityCommitment)
    if (existing) {
      if (canonicalizeDisputeEvidenceSnapshot(existing.payload as DisputeEvidenceSnapshotV1) !== canonicalizeDisputeEvidenceSnapshot(snapshot)) throw new ProtocolError(409, "Dispute evidence hash conflicts with an existing snapshot")
      return { evidenceHash: hash, snapshot: existing.payload }
    }
    const disputeId = `${snapshot.escrow.toLowerCase()}:${snapshot.milestoneId}`
    const snapshotId = `${disputeId}:${snapshot.sourceEvidenceHash.toLowerCase()}:${snapshot.arbiterIdentityCommitment.toLowerCase()}`
    await this.repo.put({ type: "dispute_evidence", attributes: { evidence_hash: lower(hash), snapshot_id: snapshotId, dispute_id: disputeId, status: "sealed", chain_id: snapshot.chainId, escrow: lower(snapshot.escrow), milestone_id: snapshot.milestoneId, kind: snapshot.kind, source_evidence_hash: lower(snapshot.sourceEvidenceHash), publisher: lower(seal.publisher), publisher_public_key: lower(snapshot.act.publisherPublicKey), arbiter_identity_commitment: lower(snapshot.arbiterIdentityCommitment) }, payload: snapshot })
    return { evidenceHash: hash, snapshot }
  }
  async disputeEvidenceStatus(escrow: Address, milestoneId: number) {
    if (!await this.reader.isEscrow(escrow)) throw new ProtocolError(404, "Deal not found")
    const state = await this.reader.readEscrow(escrow)
    if (state.status !== "disputed" || state.currentMilestone !== BigInt(milestoneId)) throw new ProtocolError(409, "Dispute is not open for this milestone")
    const snapshots = await getDisputeEvidenceForDispute(this.repo, escrow, milestoneId)
    return { disputeId: `${escrow.toLowerCase()}:${milestoneId}`, evidenceStatus: snapshots.length ? "READY" : "PENDING", arbitrationReady: snapshots.length > 0, sealed: snapshots.map((snapshot) => ({ evidenceHash: snapshot.attributes.evidence_hash, sourceEvidenceHash: snapshot.attributes.source_evidence_hash, publisherPublicKey: snapshot.attributes.publisher_public_key })) }
  }
}

export function validAddress(value: string): Address { if (!isAddress(value)) throw new ProtocolError(400, "Invalid address"); return asAddress(lower(value)) }
export function validHash(value: string): Hex { if (!/^0x[\da-fA-F]{64}$/.test(value)) throw new ProtocolError(400, "Invalid evidence hash"); return lower(value) as Hex }
export function validMilestone(value: string): number { const milestone = Number(value); if (!Number.isSafeInteger(milestone) || milestone < 0) throw new ProtocolError(400, "Invalid milestone"); return milestone }
export function normalizeProtocolHistory(value: { deals: Record<string, unknown>[]; settlements: Record<string, unknown>[] }): ReputationHistory {
  return { deals: value.deals.map((deal) => ({ escrow: asAddress(String(deal.escrow)), client: asAddress(String(deal.client)), provider: asAddress(String(deal.provider)), status: String(deal.status) as "active" | "completed" | "cancelled" })), settlements: value.settlements.map((settlement) => ({ escrow: asAddress(String(settlement.escrow)), client: asAddress(String(settlement.client)), provider: asAddress(String(settlement.provider)), chainId: Number(settlement.chain_id), token: asAddress(String(settlement.token)), providerAmount: BigInt(String(settlement.provider_amount)), clientRefundAmount: BigInt(String(settlement.client_refund_amount)), type: String(settlement.kind) as "approved" | "timeout" | "dispute" })) }
}

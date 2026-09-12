import { canonicalizeEvidenceDescriptor, hashEvidenceDescriptor, type EvidenceDescriptorV1 } from "@milestonepay/evidence"
import { calculateReputation, type Address as ReputationAddress, type ReputationHistory } from "@milestonepay/reputation"
import { isAddress, type Address, type Hex } from "viem"
import { getDeal, getEvidenceDescriptor, getWalletDisputes, getWalletHistory, getWalletSettlements } from "../arkiv/queries.js"
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
    const matchingDeals = deals.filter((deal) => lower(String(deal.attributes.client)) === lower(wallet) || lower(String(deal.attributes.provider)) === lower(wallet))
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
}

export function validAddress(value: string): Address { if (!isAddress(value)) throw new ProtocolError(400, "Invalid address"); return asAddress(lower(value)) }
export function validHash(value: string): Hex { if (!/^0x[\da-fA-F]{64}$/.test(value)) throw new ProtocolError(400, "Invalid evidence hash"); return lower(value) as Hex }
export function normalizeProtocolHistory(value: { deals: Record<string, unknown>[]; settlements: Record<string, unknown>[] }): ReputationHistory {
  return { deals: value.deals.map((deal) => ({ escrow: asAddress(String(deal.escrow)), client: asAddress(String(deal.client)), provider: asAddress(String(deal.provider)), status: String(deal.status) as "active" | "completed" | "cancelled" })), settlements: value.settlements.map((settlement) => ({ escrow: asAddress(String(settlement.escrow)), client: asAddress(String(settlement.client)), provider: asAddress(String(settlement.provider)), chainId: Number(settlement.chain_id), token: asAddress(String(settlement.token)), providerAmount: BigInt(String(settlement.provider_amount)), clientRefundAmount: BigInt(String(settlement.client_refund_amount)), type: String(settlement.kind) as "approved" | "timeout" | "dispute" })) }
}

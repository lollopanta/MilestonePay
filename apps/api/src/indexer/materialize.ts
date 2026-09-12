import type { Address } from "viem"
import type { ArkivRepository } from "../arkiv/writer.js"
import type { NormalizedEvent } from "./sync.js"
import type { AvalancheReader } from "./avalanche.js"

const lower = (value: string) => value.toLowerCase()
const string = (value: unknown) => value === undefined ? undefined : String(value)
const number = (value: unknown) => Number(value)
const eventKey = (event: NormalizedEvent) => `${event.chainId}:${event.txHash.toLowerCase()}:${event.logIndex}`
const latest = <T extends { attributes: Record<string, string | number | boolean> }>(entities: T[]) => [...entities].sort((a, b) => number(a.attributes.last_event_block) - number(b.attributes.last_event_block) || String(a.attributes.last_event_id).localeCompare(String(b.attributes.last_event_id))).at(-1)

export async function materialize(repo: ArkivRepository, reader: AvalancheReader) {
  const eventEntities = await repo.all("protocol_event")
  const events = eventEntities.map((entity) => entity.payload as NormalizedEvent).filter((event): event is NormalizedEvent => Boolean(event)).sort((a, b) => a.blockNumber - b.blockNumber || a.transactionIndex - b.transactionIndex || a.logIndex - b.logIndex)
  const creates = new Map<string, NormalizedEvent>()
  for (const event of events) if (event.eventName === "EscrowCreated") creates.set(lower(event.escrow), event)
  const deals = await repo.all("deal")
  const dealSnapshots = new Map<string, Record<string, string | number | boolean>>()
  for (const [escrow, created] of creates) {
    const state = await reader.readEscrow(escrow as Address)
    const last = events.filter((event) => lower(event.escrow) === escrow).at(-1)!
    const existing = latest(deals.filter((deal) => lower(String(deal.attributes.escrow)) === escrow))
    if (existing?.attributes.last_event_id === eventKey(last)) { dealSnapshots.set(escrow, existing.attributes); continue }
    const attributes = { chain_id: state.client ? reader.chainId : 0, factory: lower(reader.factory), escrow, client: lower(state.client), provider: lower(state.provider), arbiter: lower(state.arbiter), payment_token: lower(state.paymentToken), total_amount: state.totalAmount.toString(), review_period: state.reviewPeriod.toString(), status: state.status, current_milestone: state.currentMilestone.toString(), total_released: state.totalReleased.toString(), total_refunded: state.totalRefunded.toString(), creation_block: created.blockNumber, creation_tx_hash: created.txHash.toLowerCase(), last_event_block: last.blockNumber, last_event_tx_hash: last.txHash.toLowerCase(), last_event_id: eventKey(last) }
    await repo.put({ type: "deal", attributes, payload: { escrow, state, creation: created, lastEvent: last } })
    dealSnapshots.set(escrow, attributes)
  }
  const dealFor = (escrow: string) => {
    const attributes = dealSnapshots.get(lower(escrow)) ?? latest(deals.filter((deal) => lower(String(deal.attributes.escrow)) === lower(escrow)))?.attributes
    return attributes ? { attributes } : undefined
  }
  const settlements = new Map<string, NormalizedEvent>()
  for (const event of events) {
    if (event.eventName === "DisputeResolved") settlements.set(`${event.txHash}:${event.attributes?.milestone_id}`, event)
    else if (event.eventName === "MilestoneApproved" || event.eventName === "ReviewTimeoutClaimed") {
      const key = `${event.txHash}:${event.attributes?.milestone_id}`
      if (event.eventName === "ReviewTimeoutClaimed" || !settlements.has(key)) settlements.set(key, event)
    }
  }
  for (const event of settlements.values()) {
    const deal = dealFor(event.escrow); if (!deal) continue
    const milestoneId = string(event.attributes?.milestone_id)!
    const settlementId = `${event.chainId}:${event.txHash.toLowerCase()}:${milestoneId}`
    if ((await repo.find("settlement", "settlement_id", settlementId)).length) continue
    const dispute = event.eventName === "DisputeResolved"
    await repo.put({ type: "settlement", attributes: { settlement_id: settlementId, chain_id: event.chainId, escrow: lower(event.escrow), milestone_id: milestoneId, client: deal.attributes.client, provider: deal.attributes.provider, token: deal.attributes.payment_token, provider_amount: string(event.attributes?.provider_amount ?? event.attributes?.amount)!, client_refund_amount: string(event.attributes?.client_refund_amount ?? "0")!, kind: dispute ? "dispute" : event.eventName === "ReviewTimeoutClaimed" ? "timeout" : "approved", ...(dispute ? { provider_bps: string(event.attributes?.provider_bps)! } : {}), block_number: event.blockNumber, tx_hash: event.txHash.toLowerCase() }, payload: event })
  }
  const disputes = new Map<string, Record<string, string | number | boolean>>()
  for (const event of events) {
    if (!event.eventName.startsWith("Dispute")) continue
    const deal = dealFor(event.escrow); if (!deal) continue
    const milestoneId = string(event.attributes?.milestone_id)!; const id = `${event.chainId}:${lower(event.escrow)}:${milestoneId}`
    const current = disputes.get(id) ?? { dispute_id: id, chain_id: event.chainId, escrow: lower(event.escrow), milestone_id: milestoneId, client: deal.attributes.client, provider: deal.attributes.provider, opened_by: "", client_evidence_hash: "", provider_evidence_hash: "", resolved: false, provider_bps: "", provider_amount: "", client_refund_amount: "", terminated: false }
    if (event.eventName === "DisputeOpened") Object.assign(current, { opened_by: string(event.attributes?.opened_by)!, client_evidence_hash: string(event.attributes?.client_evidence_hash)!, provider_evidence_hash: string(event.attributes?.provider_evidence_hash)! })
    if (event.eventName === "DisputeEvidenceSubmitted") { if (lower(string(event.attributes?.submitter)!) === lower(String(deal.attributes.client))) current.client_evidence_hash = string(event.attributes?.evidence_hash)!; else current.provider_evidence_hash = string(event.attributes?.evidence_hash)! }
    if (event.eventName === "DisputeResolved") Object.assign(current, { resolved: true, provider_bps: string(event.attributes?.provider_bps)!, provider_amount: string(event.attributes?.provider_amount)!, client_refund_amount: string(event.attributes?.client_refund_amount)!, terminated: event.attributes?.terminate_agreement === true })
    Object.assign(current, { last_event_block: event.blockNumber, last_event_id: eventKey(event), opened_tx: current.opened_tx || event.txHash.toLowerCase(), ...(event.eventName === "DisputeResolved" ? { resolved_tx: event.txHash.toLowerCase() } : {}) })
    disputes.set(id, current)
  }
  for (const [id, dispute] of disputes) { const existing = latest(await repo.find("dispute", "dispute_id", id)); if (existing?.attributes.last_event_id !== dispute.last_event_id) await repo.put({ type: "dispute", attributes: dispute, payload: dispute }) }
}

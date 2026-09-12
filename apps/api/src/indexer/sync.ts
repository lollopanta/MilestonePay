import type { Hex } from "viem"
import type { ArkivRepository } from "../arkiv/writer.js"
import { eventId, PROJECT, SCHEMA_VERSION } from "../arkiv/schema.js"

export type NormalizedEvent = { chainId: number; txHash: Hex; logIndex: number; blockNumber: number; contract: string; eventName: string; escrow: string; attributes?: Record<string, string | number | boolean> }
export async function writeProtocolEvent(repo: ArkivRepository, event: NormalizedEvent) {
  const id = eventId(event.chainId, event.txHash, event.logIndex)
  if ((await repo.find("protocol_event", "event_id", id)).length) return false
  await repo.put({ type: "protocol_event", attributes: { project: PROJECT, schema_version: SCHEMA_VERSION, entity_type: "protocol_event", event_id: id, chain_id: event.chainId, contract: event.contract.toLowerCase(), event_name: event.eventName, tx_hash: event.txHash.toLowerCase(), block_number: event.blockNumber, log_index: event.logIndex, escrow: event.escrow.toLowerCase(), ...event.attributes }, payload: event })
  return true
}
export async function syncEvents(repo: ArkivRepository, events: readonly NormalizedEvent[], overlap = 10) {
  let written = 0; let maxBlock = 0
  for (const event of events) { if (await writeProtocolEvent(repo, event)) written++; maxBlock = Math.max(maxBlock, event.blockNumber) }
  if (maxBlock) await repo.put({ type: "sync_checkpoint", attributes: { project: PROJECT, schema_version: SCHEMA_VERSION, entity_type: "sync_checkpoint", block_number: maxBlock, overlap }, payload: { blockNumber: maxBlock, overlap } })
  return { written, checkpoint: maxBlock }
}

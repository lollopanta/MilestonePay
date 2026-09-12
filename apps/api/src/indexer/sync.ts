import type { Address, Hex } from "viem"
import type { ArkivRepository } from "../arkiv/writer.js"
import { eventId, PROJECT, SCHEMA_VERSION } from "../arkiv/schema.js"
import type { AvalancheReader } from "./avalanche.js"
import { FUJI_DEPLOYMENT_BLOCK } from "./avalanche.js"
import { materialize } from "./materialize.js"

export type NormalizedEvent = { chainId: number; txHash: Hex; logIndex: number; transactionIndex: number; blockNumber: number; contract: string; eventName: string; escrow: string; attributes?: Record<string, string | number | boolean> }
export async function writeProtocolEvent(repo: ArkivRepository, event: NormalizedEvent) {
  const id = eventId(event.chainId, event.txHash, event.logIndex)
  if ((await repo.find("protocol_event", "event_id", id)).length) return false
  await repo.put({ type: "protocol_event", attributes: { project: PROJECT, schema_version: SCHEMA_VERSION, entity_type: "protocol_event", event_id: id, chain_id: event.chainId, contract: event.contract.toLowerCase(), event_name: event.eventName, tx_hash: event.txHash.toLowerCase(), block_number: event.blockNumber, log_index: event.logIndex, escrow: event.escrow.toLowerCase(), ...event.attributes }, payload: event })
  return true
}
export async function syncEvents(repo: ArkivRepository, events: readonly NormalizedEvent[], overlap = 10) {
  let written = 0; let maxBlock = 0
  for (const event of events) { if (await writeProtocolEvent(repo, event)) written++; maxBlock = Math.max(maxBlock, event.blockNumber) }
  const checkpoint = Math.max(0, ...(await repo.all("sync_checkpoint")).map((entity) => Number(entity.attributes.block_number)))
  if (maxBlock > checkpoint) await repo.put({ type: "sync_checkpoint", attributes: { project: PROJECT, schema_version: SCHEMA_VERSION, entity_type: "sync_checkpoint", block_number: maxBlock, overlap }, payload: { blockNumber: maxBlock, overlap } })
  return { written, checkpoint: maxBlock }
}

export async function syncAvalanche(repo: ArkivRepository, reader: AvalancheReader, options: { startBlock?: bigint; overlap?: number } = {}) {
  const overlap = options.overlap ?? 10
  const checkpoint = Math.max(0, ...(await repo.all("sync_checkpoint")).map((entity) => Number(entity.attributes.block_number)))
  const startBlock = checkpoint ? BigInt(Math.max(Number(options.startBlock ?? FUJI_DEPLOYMENT_BLOCK), checkpoint - overlap)) : options.startBlock ?? FUJI_DEPLOYMENT_BLOCK
  const knownEscrows = (await repo.all("protocol_event")).filter((entity) => entity.attributes.event_name === "EscrowCreated").map((entity) => String(entity.attributes.escrow) as Address)
  const events = await reader.readEvents(startBlock, undefined, knownEscrows)
  const result = await syncEvents(repo, events, overlap)
  await materialize(repo, reader)
  return { ...result, startBlock, events: events.length }
}

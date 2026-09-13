import type { Address, Hex } from "viem"

export const PROJECT = "milestonepay"
export const SCHEMA_VERSION = 1
export const ENTITY_LIFETIME_DAYS = 180
export type EntityType = "protocol_event" | "deal" | "settlement" | "dispute" | "evidence" | "agreement_identity" | "arbiter_swarm_identity" | "agreement_chat_feed" | "dispute_evidence" | "sync_checkpoint"
export type OfficialEntity = { id: string; type: EntityType; attributes: Record<string, string | number | boolean>; payload?: unknown; creator: Address }
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
export const jsonSafe = (value: unknown): JsonValue => {
  if (typeof value === "bigint") return value.toString()
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value
  if (Array.isArray(value)) return value.map(jsonSafe)
  if (typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, jsonSafe(v)]))
  throw new Error("Unsupported JSON value")
}
export const eventId = (chainId: number, txHash: Hex, logIndex: number) => `${chainId}:${txHash.toLowerCase()}:${logIndex}`

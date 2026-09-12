import type { Address, Hex } from "viem"
import type { ArkivRepository } from "./writer.js"
const latest = <T extends { attributes: Record<string, string | number | boolean> }>(entities: T[]) => [...entities].sort((a, b) => Number(a.attributes.last_event_block ?? 0) - Number(b.attributes.last_event_block ?? 0) || String(a.attributes.last_event_id ?? "").localeCompare(String(b.attributes.last_event_id ?? ""))).at(-1)
export const getDeal = async (repo: ArkivRepository, escrow: Address) => latest(await repo.find("deal", "escrow", escrow.toLowerCase()))
export const getEvidenceDescriptor = async (repo: ArkivRepository, hash: Hex) => latest(await repo.find("evidence", "evidence_hash", hash.toLowerCase()))
export async function getWalletHistory(repo: ArkivRepository, wallet: Address) { const events = await repo.all("protocol_event"); return events.filter((e) => Object.values(e.attributes).some((v) => String(v).toLowerCase() === wallet.toLowerCase())) }
export const getWalletSettlements = async (repo: ArkivRepository, wallet: Address) => (await repo.all("settlement")).filter((e) => e.attributes.client === wallet.toLowerCase() || e.attributes.provider === wallet.toLowerCase())
export const getWalletDisputes = async (repo: ArkivRepository, wallet: Address) => (await repo.all("dispute")).filter((e) => e.attributes.client === wallet.toLowerCase() || e.attributes.provider === wallet.toLowerCase() || e.attributes.opened_by === wallet.toLowerCase())

import type { Address, Hex } from "viem"
import type { ArkivRepository } from "./writer.js"
export const getDeal = async (repo: ArkivRepository, escrow: Address) => (await repo.find("deal", "escrow", escrow.toLowerCase())).at(-1)
export const getEvidenceDescriptor = async (repo: ArkivRepository, hash: Hex) => (await repo.find("evidence", "evidence_hash", hash.toLowerCase())).at(-1)
export async function getWalletHistory(repo: ArkivRepository, wallet: Address) { const events = await repo.all("protocol_event"); return events.filter((e) => Object.values(e.attributes).some((v) => String(v).toLowerCase() === wallet.toLowerCase())) }
export const getWalletSettlements = async (repo: ArkivRepository, wallet: Address) => (await repo.all("settlement")).filter((e) => e.attributes.client === wallet.toLowerCase() || e.attributes.provider === wallet.toLowerCase())
export const getWalletDisputes = async (repo: ArkivRepository, wallet: Address) => (await repo.all("dispute")).filter((e) => e.attributes.client === wallet.toLowerCase() || e.attributes.provider === wallet.toLowerCase() || e.attributes.opened_by === wallet.toLowerCase())

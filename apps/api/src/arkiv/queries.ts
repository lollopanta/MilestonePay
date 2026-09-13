import type { Address, Hex } from "viem"
import type { ArkivRepository } from "./writer.js"
const latest = <T extends { attributes: Record<string, string | number | boolean> }>(entities: T[]) => [...entities].sort((a, b) => Number(a.attributes.last_event_block ?? 0) - Number(b.attributes.last_event_block ?? 0) || String(a.attributes.last_event_id ?? "").localeCompare(String(b.attributes.last_event_id ?? ""))).at(-1)
export const getDeal = async (repo: ArkivRepository, escrow: Address) => latest(await repo.find("deal", "escrow", escrow.toLowerCase()))
export const getEvidenceDescriptor = async (repo: ArkivRepository, hash: Hex) => latest(await repo.find("evidence", "evidence_hash", hash.toLowerCase()))
export const getAgreementIdentity = async (repo: ArkivRepository, escrow: Address, role: "client" | "provider" | "arbiter") => (await repo.find("agreement_identity", "identity_id", `${escrow.toLowerCase()}:${role}`)).at(0)
export async function getArbiterSwarmIdentity(repo: ArkivRepository, wallet: Address, chainId: number) {
  const records = await repo.find("arbiter_swarm_identity", "wallet", wallet.toLowerCase())
  return records.filter((record) => Number(record.attributes.chain_id) === chainId).sort((a, b) => Number(b.attributes.registered_at) - Number(a.attributes.registered_at) || String(b.attributes.registration_id).localeCompare(String(a.attributes.registration_id))).at(0)
}
export async function hasArbiterSwarmIdentityForOtherChain(repo: ArkivRepository, wallet: Address, chainId: number) {
  return (await repo.find("arbiter_swarm_identity", "wallet", wallet.toLowerCase())).some((record) => Number(record.attributes.chain_id) !== chainId)
}
export const getAgreementIdentities = async (repo: ArkivRepository, escrow: Address) => Promise.all([getAgreementIdentity(repo, escrow, "client"), getAgreementIdentity(repo, escrow, "arbiter")])
export const getChatFeed = async (repo: ArkivRepository, escrow: Address, role: "client" | "provider") => (await repo.find("agreement_chat_feed", "feed_id", `${escrow.toLowerCase()}:${role}`)).at(0)
export const getChatFeeds = async (repo: ArkivRepository, escrow: Address) => Promise.all([getChatFeed(repo, escrow, "client"), getChatFeed(repo, escrow, "provider")])
export const getDisputeEvidence = async (repo: ArkivRepository, hash: Hex) => latest(await repo.find("dispute_evidence", "evidence_hash", hash.toLowerCase()))
export const getDisputeEvidenceForSource = async (repo: ArkivRepository, escrow: Address, milestoneId: number, sourceEvidenceHash: Hex, arbiterCommitment: Hex) => latest(await repo.find("dispute_evidence", "snapshot_id", `${escrow.toLowerCase()}:${milestoneId}:${sourceEvidenceHash.toLowerCase()}:${arbiterCommitment.toLowerCase()}`))
export const getDisputeEvidenceForDispute = async (repo: ArkivRepository, escrow: Address, milestoneId: number) => repo.find("dispute_evidence", "dispute_id", `${escrow.toLowerCase()}:${milestoneId}`)
export async function getWalletHistory(repo: ArkivRepository, wallet: Address) { const events = await repo.all("protocol_event"); return events.filter((e) => Object.values(e.attributes).some((v) => String(v).toLowerCase() === wallet.toLowerCase())) }
export const getWalletSettlements = async (repo: ArkivRepository, wallet: Address) => (await repo.all("settlement")).filter((e) => e.attributes.client === wallet.toLowerCase() || e.attributes.provider === wallet.toLowerCase())
export const getWalletDisputes = async (repo: ArkivRepository, wallet: Address) => (await repo.all("dispute")).filter((e) => e.attributes.client === wallet.toLowerCase() || e.attributes.provider === wallet.toLowerCase() || e.attributes.opened_by === wallet.toLowerCase())

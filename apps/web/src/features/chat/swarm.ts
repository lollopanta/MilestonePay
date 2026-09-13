import { chatFeedBindingMessage, chatFeedTopic, createChatMessage, type AgreementChatFeedBindingV1, type ChatMessageV1, validateChatFeedEntry, validateChatMessage } from "@milestonepay/evidence"
import type { Address } from "viem"
import { signMessage } from "wagmi/actions"
import { agreementIdentities, getEvidenceClient, getEvidenceReaderClient, getSwarmIdClient } from "@/lib/evidence"
import { wagmiConfig } from "@/web3/config"
import { bindChatFeed, getChatFeeds, type ChatFeeds } from "./api"

type Role = "client" | "provider"
export type LoadedChatMessage = ChatMessageV1 & { feedIndex: string }
const encoder = new TextEncoder()
const decode = (data: Uint8Array) => JSON.parse(new TextDecoder().decode(data)) as unknown

export async function ensureChatFeed(escrow: Address, chainId: number, wallet: Address, role: Role) {
  const swarm = await getSwarmIdClient()
  if (!swarm.connectionInfo.identity) throw new Error("Connect Swarm ID to use private chat")
  const topic = chatFeedTopic(chainId, escrow, role)
  const writer = swarm.makeSequentialFeedWriter({ topic })
  const feedOwner = await writer.getOwner() as Address
  const feeds = await getChatFeeds(escrow)
  const existing = feeds[role]
  if (existing) {
    if (existing.wallet.toLowerCase() !== wallet.toLowerCase() || existing.feedOwner.toLowerCase() !== feedOwner.toLowerCase()) throw new Error("This Swarm identity does not match the chat identity already bound to this agreement. Reconnect the original Swarm identity.")
    return { writer, binding: existing, feeds }
  }
  const unsigned = { version: 1 as const, chainId, escrow, role, wallet, feedOwner, topic }
  const signature = await signMessage(wagmiConfig, { message: chatFeedBindingMessage(unsigned) })
  const binding = await bindChatFeed({ ...unsigned, signature })
  return { writer, binding, feeds: { ...feeds, [role]: binding } }
}

export async function sendChatMessage(input: { escrow: Address; chainId: number; wallet: Address; role: Role; text: string }) {
  const text = input.text.trim()
  if (!text) throw new Error("Write a message before sending")
  const { writer } = await ensureChatFeed(input.escrow, input.chainId, input.wallet, input.role)
  const identities = await agreementIdentities(input.escrow)
  if (!identities.provider) throw new Error("Both participant Swarm identities must be connected before private chat can start")
  const message = createChatMessage({ version: 1, chainId: input.chainId, escrow: input.escrow, sender: input.wallet, senderRole: input.role, createdAt: Date.now(), text })
  const { descriptor } = await (await getEvidenceClient()).uploadEvidence(encoder.encode(JSON.stringify(message)), { kind: "milestone", chainId: input.chainId, escrow: input.escrow, milestoneId: 0, createdAt: Math.floor(Date.now() / 1_000), grantees: [identities.client.binding.identity, identities.provider.binding.identity] })
  const pointer = encoder.encode(JSON.stringify({ version: 1, messageId: message.messageId, act: descriptor.act }))
  try { await writer.uploadRawPayload(pointer) } catch { await (await ensureChatFeed(input.escrow, input.chainId, input.wallet, input.role)).writer.uploadRawPayload(pointer) }
  return message
}

async function readFeed(escrow: Address, chainId: number, role: Role, binding: AgreementChatFeedBindingV1): Promise<LoadedChatMessage[]> {
  const swarm = await getSwarmIdClient()
  const reader = swarm.makeSequentialFeedReader({ topic: binding.topic, owner: binding.feedOwner })
  if ((await reader.getOwner()).toLowerCase() !== binding.feedOwner.toLowerCase()) return []
  let latest: { feedIndex: string }
  try { latest = await reader.downloadRawPayload() } catch { return [] }
  const last = BigInt(latest.feedIndex)
  const first = last > 49n ? last - 49n : 0n
  const messages = await Promise.all(Array.from({ length: Number(last - first + 1n) }, async (_, offset) => {
    const index = first + BigInt(offset)
    try {
      const entry = decode((await reader.downloadRawPayload({ index })).payload); validateChatFeedEntry(entry)
      const pointer = entry as { messageId: `0x${string}`; act: { encryptedReference: string; historyReference: string; publisherPublicKey: string; actReference: string } }
      const data = await (await getEvidenceReaderClient()).downloadEvidence({ version: 1, kind: "milestone", chainId, escrow, milestoneId: 0, createdAt: 1, act: pointer.act })
      const message = decode(data); validateChatMessage(message)
      const valid = message as ChatMessageV1
      if (valid.chainId !== chainId || valid.escrow.toLowerCase() !== escrow.toLowerCase() || valid.senderRole !== role || valid.sender.toLowerCase() !== binding.wallet.toLowerCase() || valid.messageId.toLowerCase() !== pointer.messageId.toLowerCase()) return undefined
      return { ...valid, feedIndex: index.toString() }
    } catch { return undefined }
  }))
  return messages.filter((message): message is LoadedChatMessage => Boolean(message))
}

export async function loadChatMessages(escrow: Address, chainId: number): Promise<LoadedChatMessage[]> {
  const feeds: ChatFeeds = await getChatFeeds(escrow)
  const all = (await Promise.all((["client", "provider"] as const).map((role) => feeds[role] ? readFeed(escrow, chainId, role, feeds[role]) : []))).flat()
  return [...new Map(all.map((message) => [message.messageId.toLowerCase(), message])).values()].sort((a, b) => {
    const time = a.createdAt - b.createdAt; if (time) return time
    const role = a.senderRole.localeCompare(b.senderRole); if (role) return role
    return BigInt(a.feedIndex) === BigInt(b.feedIndex) ? a.messageId.localeCompare(b.messageId) : BigInt(a.feedIndex) < BigInt(b.feedIndex) ? -1 : 1
  })
}

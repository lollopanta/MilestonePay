import type { AgreementChatFeedBindingV1 } from "@milestonepay/evidence"
import type { Address } from "viem"

const base = (import.meta.env.VITE_API_URL || "/api").replace(/\/$/, "")
async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${base}${path}`, { headers: { "content-type": "application/json" }, ...init })
  if (!response.ok) throw new Error((await response.json().catch(() => ({ error: "Chat discovery unavailable" }))).error)
  return response.json() as Promise<T>
}
export type ChatFeeds = Partial<Record<"client" | "provider", AgreementChatFeedBindingV1>>
export const getChatFeeds = (escrow: Address) => request<ChatFeeds>(`/agreements/${escrow}/chat-feeds`)
export const bindChatFeed = (binding: AgreementChatFeedBindingV1) => request<AgreementChatFeedBindingV1>(`/agreements/${binding.escrow}/chat-feeds`, { method: "POST", body: JSON.stringify(binding) })

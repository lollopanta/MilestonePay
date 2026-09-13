import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import type { Address } from "viem"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { loadChatMessages, sendChatMessage } from "./swarm"

export function ChatPanel({ escrow, chainId, wallet, role }: { escrow: Address; chainId: number; wallet?: Address; role: "client" | "provider" | "arbiter" | "observer" }) {
  const [text, setText] = useState(""); const [error, setError] = useState<string>(); const [sending, setSending] = useState(false)
  const participant = role === "client" || role === "provider"
  const query = useQuery({ queryKey: ["private-chat", escrow, chainId], enabled: participant, queryFn: () => loadChatMessages(escrow, chainId) })
  const refresh = async () => { await query.refetch() }
  if (!participant) return <p className="text-sm text-muted-foreground">{role === "arbiter" ? "Private conversation between the agreement participants. Chat is not automatically shared with the arbiter." : "Only agreement participants can read private chat."}</p>
  const queryError = query.error instanceof Error ? query.error.message : undefined
  return <div className="flex flex-col gap-3"><p className="text-sm text-muted-foreground">Private via Swarm ACT. Messages remain between client and provider.</p>{(error || queryError) && <p className="text-sm text-destructive">{error || queryError}</p>}<div className="max-h-72 space-y-2 overflow-auto rounded-lg border p-3">{query.data?.length ? query.data.map((message) => <div key={message.messageId} className={message.sender.toLowerCase() === wallet?.toLowerCase() ? "ml-8 rounded bg-muted p-2 text-sm" : "mr-8 rounded border p-2 text-sm"}>{message.text}</div>) : <p className="text-sm text-muted-foreground">{query.isPending ? "Loading private messages…" : "No messages yet."}</p>}</div><Textarea value={text} onChange={(event) => setText(event.target.value)} maxLength={4000} placeholder="Write a private message"/><div className="flex gap-2"><Button disabled={sending || !text.trim()} onClick={async () => { if (!wallet) return; setSending(true); try { await sendChatMessage({ escrow, chainId, wallet, role, text }); setText(""); setError(undefined); await refresh() } catch (cause) { setError(cause instanceof Error ? cause.message : "Message could not be sent") } finally { setSending(false) } }}>{sending ? "Sending" : "Send"}</Button><Button variant="outline" disabled={sending} onClick={() => void refresh()}>Refresh</Button></div></div>
}

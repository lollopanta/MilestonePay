import { RiArrowRightLine, RiCheckLine, RiRefreshLine, RiShieldCheckLine } from "@remixicon/react"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Amount, WalletAddress } from "@/components/ui/financial"
import { PageHeader } from "@/components/ui/page"

const wallets = {
  client: { name: "Alice · Client", address: "0xA11cE0000000000000000000000000000000001" },
  provider: { name: "Bruno · Provider", address: "0xB2220000000000000000000000000000000002" },
  arbiter: { name: "Cora · Arbiter", address: "0xC3330000000000000000000000000000000003" },
} as const
type Role = keyof typeof wallets
type Stage = "draft" | "funded" | "delivered" | "approved" | "disputed" | "resolved"
const labels: Record<Stage, string> = { draft: "Ready to fund", funded: "Work in progress", delivered: "Awaiting approval", approved: "Milestone released", disputed: "In dispute", resolved: "Resolved" }
const next: Record<Stage, Stage | undefined> = { draft: "funded", funded: "delivered", delivered: "approved", approved: undefined, disputed: "resolved", resolved: undefined }

export function Demo() {
  const [role, setRole] = useState<Role>(() => (localStorage.getItem("milestonepay-demo-role") as Role) || "client")
  const [stage, setStage] = useState<Stage>(() => (localStorage.getItem("milestonepay-demo-stage") as Stage) || "draft")
  const [amount, setAmount] = useState("2,400")
  const [notice, setNotice] = useState("Demo data only — no wallet, blockchain, Arkiv, or Swarm request is made.")
  const selectRole = (value: Role) => { localStorage.setItem("milestonepay-demo-role", value); setRole(value); setNotice(`${wallets[value].name} is now the active demo wallet.`) }
  const advance = () => { const value = next[stage]; if (!value) return; localStorage.setItem("milestonepay-demo-stage", value); setStage(value); setNotice(`${labels[value]} — simulated on MilestonePay Demo Chain.`) }
  const reset = () => { localStorage.setItem("milestonepay-demo-stage", "draft"); setStage("draft"); setAmount("2,400"); setNotice("Demo reset. Start again when ready.") }
  const canAdvance = (stage === "draft" && role === "client") || (stage === "funded" && role === "provider") || (stage === "delivered" && role === "client") || (stage === "disputed" && role === "arbiter")
  const primary = stage === "draft" ? "Fund demo agreement" : stage === "funded" ? "Submit delivery" : stage === "delivered" ? "Approve & release" : stage === "disputed" ? "Resolve dispute" : "Complete"
  return <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-8 lg:px-10">
    <PageHeader eyebrow="Presentation mode" title="MilestonePay demo" description="A safe, local walkthrough for judges. Everything on this page is simulated and persists only in this browser." actions={<Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">Demo Chain · Block #1042</Badge>} />
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="flex flex-col gap-6">
        <Card className="border-primary/20 bg-primary/[0.03]"><CardHeader><CardTitle>Choose a demo wallet</CardTitle><CardDescription>Switch roles instantly — no extension or seed phrase required.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-3">{(Object.keys(wallets) as Role[]).map((key) => <button key={key} onClick={() => selectRole(key)} className={`rounded-lg border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${role === key ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"}`}><p className="text-sm font-medium">{wallets[key].name}</p><WalletAddress address={wallets[key].address} className="mt-2 block" />{role === key && <p className="mt-3 flex items-center gap-1 text-xs text-primary"><RiCheckLine /> Active wallet</p>}</button>)}</CardContent></Card>
        <Card><CardHeader><CardTitle>Demo agreement</CardTitle><CardDescription>Website redesign · client, provider, and arbiter are preconfigured for the presentation.</CardDescription></CardHeader><CardContent className="flex flex-col gap-5"><div className="grid gap-3 sm:grid-cols-3">{(["draft", "funded", "delivered"] as Stage[]).map((item, index) => <div key={item} className={`rounded-lg border p-3 ${stage === item ? "border-primary bg-primary/10" : "border-border"}`}><p className="text-xs text-muted-foreground">Step {index + 1}</p><p className="mt-1 text-sm font-medium">{labels[item]}</p></div>)}</div><div className="rounded-lg border bg-muted/30 p-4"><div className="flex items-center justify-between gap-4"><div><p className="text-sm text-muted-foreground">Agreement value</p><Amount value={amount.replace(/,/g, "")} /></div><Badge variant={stage === "disputed" ? "destructive" : "outline"}>{labels[stage]}</Badge></div><div className="mt-4 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${stage === "draft" ? 15 : stage === "funded" ? 45 : stage === "delivered" || stage === "disputed" ? 75 : 100}%` }} /></div></div>{stage === "draft" && <label className="flex flex-col gap-2 text-sm font-medium">Amount (demo USDT)<Input value={amount} onChange={(event) => setAmount(event.target.value.replace(/[^\d,]/g, ""))} inputMode="decimal" /></label>}{stage === "funded" && <Button variant="outline" className="w-fit" onClick={() => { setStage("disputed"); localStorage.setItem("milestonepay-demo-stage", "disputed"); setNotice("Dispute opened — switch to Cora to resolve it.") }}>Open demo dispute</Button>}<p aria-live="polite" className="text-sm text-muted-foreground">{notice}</p></CardContent><CardFooter className="justify-between border-t"><Button variant="ghost" onClick={reset}><RiRefreshLine data-icon="inline-start" /> Reset demo</Button><Button disabled={!canAdvance || !next[stage]} onClick={advance}>{primary}<RiArrowRightLine data-icon="inline-end" /></Button></CardFooter></Card>
      </div>
      <aside className="flex flex-col gap-4"><Card size="sm"><CardHeader><CardTitle>Demo wallet</CardTitle></CardHeader><CardContent><p className="font-medium">{wallets[role].name}</p><WalletAddress address={wallets[role].address} className="mt-1 block" /><p className="mt-4 text-xs text-muted-foreground">MilestonePay Demo Chain · chain ID 777777</p></CardContent></Card><Card size="sm"><CardHeader><CardTitle>What to show</CardTitle></CardHeader><CardContent className="text-sm text-muted-foreground">Client funds → provider delivers → client releases. At “work in progress”, open a dispute and switch to the arbiter for the alternative path.</CardContent></Card><Card size="sm"><CardHeader><CardTitle>Safe presentation mode</CardTitle></CardHeader><CardContent className="flex gap-2 text-sm text-muted-foreground"><RiShieldCheckLine className="mt-0.5 shrink-0" />No chain transactions, wallet signatures, private keys, Swarm data, or API writes.</CardContent></Card></aside>
    </div>
  </main>
}

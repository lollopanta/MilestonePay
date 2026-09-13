import { RiArrowLeftLine, RiCheckLine } from "@remixicon/react"
import { useEffect, useState } from "react"
import { Link } from "react-router"
import { type Address } from "viem"
import { useAccount } from "wagmi"
import { signMessage } from "wagmi/actions"
import { avalancheFuji } from "wagmi/chains"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { WalletButton } from "@/components/wallet-button"
import { arbiterSwarmIdentity, currentSwarmPublicKey, getSwarmIdClient, registerArbiterSwarmIdentity, swarmIdConnectUrl } from "@/lib/evidence"
import { wagmiConfig } from "@/web3/config"
import { evidenceIdentityMessage, verifyEvidenceIdentity } from "@milestonepay/evidence"

type State = "idle" | "checking" | "registered" | "missing" | "working" | "error"

export function SwarmIdentity() {
  const { address, chainId, isConnected } = useAccount()
  const [state, setState] = useState<State>("idle")
  const [publicKey, setPublicKey] = useState("")
  const [error, setError] = useState("")

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(async () => {
      setPublicKey("")
      if (!address || chainId !== avalancheFuji.id) return setState("idle")
      setState("checking")
      try {
        const record = await arbiterSwarmIdentity(address, chainId)
        if (cancelled) return
        setPublicKey(record.identity.swarmPublicKey)
        setState("registered")
      } catch (reason) {
        if (cancelled) return
        const message = reason instanceof Error ? reason.message : ""
        if (/not registered/i.test(message)) setState("missing")
        else { setError(message || "Arkiv identity registry is unavailable."); setState("error") }
      }
    })
    return () => { cancelled = true }
  }, [address, chainId])

  async function register() {
    if (!address) return
    if (chainId !== avalancheFuji.id) { setError("Switch to Avalanche Fuji before registering."); return setState("error") }
    setState("working"); setError("")
    try {
      const swarmPublicKey = currentSwarmPublicKey(await getSwarmIdClient())
      const signature = await signMessage(wagmiConfig, { message: evidenceIdentityMessage(address, swarmPublicKey, chainId) })
      const record = { version: 1 as const, chainId, identity: { wallet: address as Address, swarmPublicKey, signature } }
      if (!await verifyEvidenceIdentity(record.identity, chainId)) throw new Error("Wallet signature is invalid")
      await registerArbiterSwarmIdentity(record)
      setPublicKey(swarmPublicKey); setState("registered")
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : ""
      setError(/rejected|denied|cancelled/i.test(message) ? "Signature request was rejected." : /Swarm ID|Connect Swarm/i.test(message) ? "Swarm ID is not available. Connect Swarm ID and try again." : message || "Arkiv identity registry is unavailable.")
      setState("error")
    }
  }

  return <main className="mx-auto min-h-svh max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
    <header className="flex items-center justify-between gap-4 border-b border-border pb-5"><Link to="/" className="text-base font-semibold tracking-tight">MilestonePay</Link><WalletButton /></header>
    <div className="py-10"><Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><RiArrowLeftLine />Back to agreements</Link>
      <Card className="mt-6"><CardHeader><CardTitle>Swarm identity</CardTitle><CardDescription>Register the public Swarm key for this wallet before acting as an arbiter. No private key, seed, or secret is shared.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm"><div><span className="text-muted-foreground">Wallet</span><p className="mt-1 break-all font-mono">{address ?? "Connect a wallet"}</p></div><div><span className="text-muted-foreground">Swarm public key</span><p className="mt-1 break-all font-mono">{publicKey || (state === "checking" ? "Checking…" : "Available after connecting Swarm ID")}</p></div>
          {state === "registered" && <Alert><RiCheckLine /><AlertTitle>Identity registered</AlertTitle><AlertDescription>Your current public Swarm identity is ready for Fuji agreements.</AlertDescription></Alert>}
          {error && <Alert variant="destructive"><AlertTitle>Registration needs attention</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        </CardContent><CardFooter className="justify-end gap-3 border-t"><a className="text-sm text-primary hover:underline" href={swarmIdConnectUrl()} target="_blank" rel="noreferrer">Open Swarm ID</a><Button onClick={register} disabled={!isConnected || state === "working"}>{state === "working" && <Spinner data-icon="inline-start" />}{state === "registered" ? "Update identity" : "Register identity"}</Button></CardFooter>
      </Card>
    </div>
  </main>
}

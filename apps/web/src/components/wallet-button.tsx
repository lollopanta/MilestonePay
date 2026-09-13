import { useEffect, useState } from "react"
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi"
import { avalancheFuji } from "wagmi/chains"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { getSwarmIdClient, secureAppUrl } from "@/lib/evidence"

type AccountStep = "idle" | "wallet" | "network" | "swarm" | "error"
const shorten = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`

export function WalletButton() {
  const { address, chainId, isConnected } = useAccount()
  const { connectAsync, connectors, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain()
  const [step, setStep] = useState<AccountStep>("idle")
  const [isSwarmConnected, setSwarmConnected] = useState(false)
  const [isSwarmReady, setSwarmReady] = useState(false)

  useEffect(() => {
    void getSwarmIdClient().then(() => setSwarmReady(true)).catch(() => setStep("error"))
  }, [])

  async function connectAccount() {
    if (isSwarmConnected) {
      disconnect()
      setSwarmConnected(false)
      return
    }

    if (window.location.protocol !== "https:") {
      window.location.assign(secureAppUrl())
      return
    }

    setStep(isConnected ? "swarm" : "wallet")

    try {
      if (!isConnected) {
        const connector = connectors[0]
        if (!connector) throw new Error("No wallet connector is available.")
        await connectAsync({ connector })
        setStep("idle")
        return
      }

      if (chainId !== avalancheFuji.id) {
        setStep("network")
        await switchChainAsync({ chainId: avalancheFuji.id })
        setStep("idle")
        return
      }

      const swarm = await getSwarmIdClient()
      if (!swarm.connectionInfo.identity) await swarm.connect({ popupMode: "window" })
      setSwarmConnected(true)
      setStep("idle")
    } catch (error) {
      console.error("Account connection failed", error)
      setStep("error")
    }
  }

  const isBusy =
    isConnecting || isSwitching || ["wallet", "network", "swarm"].includes(step) || isConnected && chainId === avalancheFuji.id && !isSwarmReady
  const label = isSwarmConnected
    ? `Disconnect ${address ? shorten(address) : "account"}`
    : !isConnected
      ? step === "error"
        ? "Retry account connection"
        : "Connect account"
      : chainId !== avalancheFuji.id
        ? "Switch to Avalanche Fuji"
        : !isSwarmReady
          ? "Preparing Swarm ID"
        : step === "error"
          ? "Retry Swarm ID"
          : "Connect Swarm ID"

  return (
    <Button
      onClick={connectAccount}
      disabled={isBusy}
      aria-live="polite"
      title={
        isSwarmConnected ? "Disconnect and choose another wallet" : undefined
      }
    >
      {isBusy && <Spinner data-icon="inline-start" />}
      {isBusy
        ? step === "wallet"
          ? "Connecting wallet"
          : step === "network"
            ? "Switching network"
            : "Opening Swarm ID"
        : label}
    </Button>
  )
}

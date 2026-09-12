import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi"
import { avalancheFuji } from "wagmi/chains"

import { Button } from "@/components/ui/button"

const shorten = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`

export function WalletButton() {
  const { address, chainId, isConnected } = useAccount()
  const { connect, connectors, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitching } = useSwitchChain()

  if (!isConnected) {
    return <Button onClick={() => connectors[0] && connect({ connector: connectors[0] })} disabled={isPending}>Connect wallet</Button>
  }

  if (chainId !== avalancheFuji.id) {
    return <Button onClick={() => switchChain({ chainId: avalancheFuji.id })} disabled={isSwitching}>Switch to Avalanche Fuji</Button>
  }

  return <Button variant="outline" onClick={() => disconnect()}>Fuji · {address && shorten(address)}</Button>
}

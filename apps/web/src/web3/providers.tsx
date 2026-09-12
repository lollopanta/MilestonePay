import type { ReactNode } from "react"
import { WagmiProvider } from "wagmi"

import { wagmiConfig } from "@/web3/config"

export function Web3Provider({ children }: { children: ReactNode }) {
  return <WagmiProvider config={wagmiConfig}>{children}</WagmiProvider>
}

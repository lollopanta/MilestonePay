import { createConfig, http } from "wagmi"
import { injected } from "wagmi/connectors"
import { avalancheFuji } from "wagmi/chains"

const rpcUrl = import.meta.env.VITE_AVALANCHE_RPC || undefined

export const wagmiConfig = createConfig({
  chains: [avalancheFuji],
  connectors: [injected()],
  transports: { [avalancheFuji.id]: http(rpcUrl) },
})

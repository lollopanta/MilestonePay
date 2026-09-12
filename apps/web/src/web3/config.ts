import { createConfig, http } from "wagmi"
import { injected } from "wagmi/connectors"
import { avalancheFuji, mainnet } from "wagmi/chains"

const rpcUrl = import.meta.env.VITE_AVALANCHE_RPC || undefined

export const wagmiConfig = createConfig({
  chains: [avalancheFuji, mainnet],
  connectors: [injected()],
  transports: {
    [avalancheFuji.id]: http(rpcUrl),
    [mainnet.id]: http(),
  },
})

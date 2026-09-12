import { useEffect } from "react"
import type { SwarmIdClient } from "@snaha/swarm-id"

export function SwarmSetup() {
  useEffect(() => {
    let active = true
    let client: SwarmIdClient | undefined
    const gateway = import.meta.env.VITE_SWARM_GATEWAY
    import("@snaha/swarm-id")
      .then(async ({ SwarmIdClient }) => {
        if (!active) return
        client = new SwarmIdClient({
          iframeOrigin:
            import.meta.env.VITE_SWARM_ID_ORIGIN ||
            "https://swarm-id.snaha.net",
          ...(gateway ? { subsidisedGatewayUrl: gateway } : {}),
          metadata: {
            name: "MilestonePay",
            description: "Trustless milestone-based escrow",
          },
        })
        await client.initialize()
      })
      .catch((error: unknown) => {
        if (active) console.error("Swarm ID initialization failed", error)
      })

    return () => {
      active = false
      client?.destroy()
    }
  }, [])

  return null
}

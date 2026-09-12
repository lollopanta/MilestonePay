import { createEvidenceClient, type SwarmActClient } from "@milestonepay/evidence"
import type { SwarmIdClient } from "@snaha/swarm-id"
import { keccak256, toBytes, type Hex } from "viem"

let swarmId: SwarmIdClient | undefined
let swarmIdPromise: Promise<SwarmIdClient> | undefined

export function getSwarmIdClient() {
  if (!swarmIdPromise) {
    swarmIdPromise = import("@snaha/swarm-id")
      .then(async ({ SwarmIdClient }) => {
        swarmId = new SwarmIdClient({
          iframeOrigin: import.meta.env.VITE_SWARM_ID_ORIGIN || "https://swarm-id.snaha.net",
          metadata: { name: "MilestonePay", description: "Private milestone evidence" },
        })
        await swarmId.initialize()
        return swarmId
      })
      .catch((error: unknown) => {
        swarmIdPromise = undefined
        throw error
      })
  }
  return swarmIdPromise
}

export async function getEvidenceClient() {
  return createEvidenceClient((await getSwarmIdClient()) as SwarmActClient)
}

export function destroyEvidenceClient() {
  swarmId?.destroy()
  swarmId = undefined
  swarmIdPromise = undefined
}

/** Temporary V1 developer-flow commitment; production evidence uses descriptors above. */
export function hashEvidenceNote(note: string): Hex | undefined {
  const trimmed = note.trim()
  return trimmed ? keccak256(toBytes(trimmed)) : undefined
}

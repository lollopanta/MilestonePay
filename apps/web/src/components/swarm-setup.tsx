import { useEffect } from "react"
import { getSwarmIdClient } from "@/lib/evidence"

export function SwarmSetup() {
  useEffect(() => {
    void getSwarmIdClient().catch(() => undefined)
  }, [])

  return null
}

import {
  createEvidenceClient,
  type AgreementEvidenceIdentityV1,
  type DisputeEvidenceSealV1,
  type EvidenceDescriptorV1,
  type SwarmActClient,
} from "@milestonepay/evidence"
import type { SwarmIdClient } from "@snaha/swarm-id"
import { keccak256, toBytes, type Address, type Hex } from "viem"

let swarmId: SwarmIdClient | undefined
let swarmIdPromise: Promise<SwarmIdClient> | undefined

export function getSwarmIdClient() {
  if (!swarmIdPromise) {
    swarmIdPromise = import("@snaha/swarm-id")
      .then(async ({ SwarmIdClient }) => {
        swarmId = new SwarmIdClient({
          iframeOrigin:
            import.meta.env.VITE_SWARM_ID_ORIGIN ||
            "https://swarm-id.snaha.net",
          metadata: {
            name: "MilestonePay",
            description: "Private milestone evidence",
          },
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

export async function getEvidenceReaderClient() {
  const client = await getSwarmIdClient()
  if (!client.connectionInfo.identity) throw new Error("Connect Swarm ID before protecting private content")
  return createEvidenceClient(client as SwarmActClient)
}
export async function getEvidenceClient() {
  const client = await getSwarmIdClient()
  if (!client.connectionInfo.identity) throw new Error("Connect Swarm ID before protecting private content")
  if (!client.connectionInfo.canUpload) throw new Error("Swarm ID is connected but cannot upload. Add a postage stamp or use a supported gateway.")
  return createEvidenceClient(client as SwarmActClient)
}

const apiUrl = (path: string) => `${(import.meta.env.VITE_API_URL || "http://localhost:3001").replace(/\/$/, "")}${path}`

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), { headers: { "content-type": "application/json" }, ...init })
  if (!response.ok) throw new Error((await response.json().catch(() => ({ error: "Protocol metadata unavailable" }))).error)
  return response.json() as Promise<T>
}

export function currentSwarmPublicKey(client: SwarmIdClient) {
  const key = client.connectionInfo.identity?.sharingPublicKey ?? client.connectionInfo.identity?.publicKey
  if (!key) throw new Error("Connect Swarm ID before protecting evidence")
  return key
}

type BoundIdentity = { commitment: Hex; binding: AgreementEvidenceIdentityV1 }
export type AgreementIdentities = { client: BoundIdentity; provider?: BoundIdentity; arbiter: BoundIdentity }

export function agreementIdentities(escrow: Address) { return api<AgreementIdentities>(`/agreements/${escrow}/identities`) }
export function bindAgreementIdentity(binding: AgreementEvidenceIdentityV1) { return api(`/agreements/${binding.escrow}/identities`, { method: "POST", body: JSON.stringify(binding) }) }
export function evidenceDescriptor(hash: Hex) { return api<{ evidenceHash: Hex; descriptor: EvidenceDescriptorV1 }>(`/evidence/${hash}`) }
export function registerEvidence(descriptor: EvidenceDescriptorV1) { return api("/evidence", { method: "POST", body: JSON.stringify(descriptor) }) }
export function registerDisputeEvidence(seal: DisputeEvidenceSealV1) { return api("/dispute-evidence", { method: "POST", body: JSON.stringify(seal) }) }
export function disputeEvidenceStatus(escrow: Address, milestoneId: bigint) { return api<{ evidenceStatus: "PENDING" | "READY"; arbitrationReady: boolean; sealed: { evidenceHash: string; sourceEvidenceHash: string; publisherPublicKey: string }[] }>(`/disputes/${escrow}/${milestoneId}/evidence`) }

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

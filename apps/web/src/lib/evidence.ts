import { keccak256, toBytes, type Hex } from "viem"

/** Temporary local placeholder; replace with an encrypted Swarm reference hash later. */
export function hashEvidenceNote(note: string): Hex | undefined {
  const reference = note.trim()
  return reference ? keccak256(toBytes(reference)) : undefined
}

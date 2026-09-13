import { MilestoneEscrowAbi } from "@milestonepay/contracts"
import { useState } from "react"
import { decodeEventLog, type Address } from "viem"
import { useAccount } from "wagmi"
import { waitForTransactionReceipt, writeContract } from "wagmi/actions"
import { avalancheFuji } from "wagmi/chains"

import { agreementIdentities, getEvidenceClient, registerEvidence } from "@/lib/evidence"
import { encodeMilestoneEvidenceBundle, MAX_EVIDENCE_ATTACHMENT_BYTES, sha256 } from "@milestonepay/evidence"
import { sameAddress } from "@/lib/deal"
import { transactionError } from "@/lib/transaction-error"
import { wagmiConfig } from "@/web3/config"

type SubmitArgs = {
  escrowAddress: Address
  provider: Address
  milestoneId: bigint
  evidenceNote: string
  attachments: File[]
}

export function useSubmitMilestone(refetch: () => Promise<unknown>) {
  const { address: wallet, chainId } = useAccount()
  const [message, setMessage] = useState<string>()
  const [isPending, setIsPending] = useState(false)

  async function submit({
    escrowAddress,
    provider,
    milestoneId,
    evidenceNote,
    attachments,
  }: SubmitArgs) {
    if (!wallet || !sameAddress(wallet, provider))
      return setMessage("Only the provider can submit this milestone.")
    if (chainId !== avalancheFuji.id)
      return setMessage("Switch to Avalanche Fuji first.")
    if (!evidenceNote.trim() && !attachments.length)
      return setMessage("Add a delivery note or file before submitting.")
    if (attachments.some((file) => !file.size || file.size > MAX_EVIDENCE_ATTACHMENT_BYTES))
      return setMessage(`Each file must be under ${MAX_EVIDENCE_ATTACHMENT_BYTES / 1024 / 1024} MB.`)

    setIsPending(true)
    setMessage("Protecting evidence with Swarm ACT")
    try {
      const identities = await agreementIdentities(escrowAddress)
      const bundle = await Promise.all(attachments.map(async (file) => {
        const bytes = new Uint8Array(await file.arrayBuffer())
        return { name: file.name, type: file.type, bytes, sha256: await sha256(bytes) }
      }))
      const { descriptor, evidenceHash } = await (await getEvidenceClient()).uploadEvidence(
        await encodeMilestoneEvidenceBundle({ note: evidenceNote, attachments: bundle }),
        {
          kind: "milestone",
          chainId: avalancheFuji.id,
          escrow: escrowAddress,
          milestoneId: Number(milestoneId),
          createdAt: Math.floor(Date.now() / 1_000),
          grantees: [identities.client.binding.identity],
        }
      )
      setMessage("Confirm milestone submission in wallet")
      const hash = await writeContract(wagmiConfig, {
        address: escrowAddress,
        abi: MilestoneEscrowAbi,
        functionName: "submitMilestone",
        args: [milestoneId, evidenceHash],
      })
      setMessage("Transaction pending")
      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash })
      const submitted = receipt.logs.some((log) => {
        try {
          return (
            decodeEventLog({
              abi: MilestoneEscrowAbi,
              data: log.data,
              topics: log.topics,
            }).eventName === "MilestoneSubmitted"
          )
        } catch {
          return false
        }
      })
      await refetch()
      if (!submitted) throw new Error("MilestoneSubmitted event missing")
      setMessage("Registering protected evidence metadata")
      await registerEvidence(descriptor)
      setMessage("Milestone submitted with Swarm ACT-protected evidence")
      return hash
    } catch (error) {
      console.error(error)
      setMessage(transactionError(error, "submit"))
    } finally {
      setIsPending(false)
    }
  }

  return {
    submit,
    message,
    isPending,
    clearMessage: () => setMessage(undefined),
  }
}

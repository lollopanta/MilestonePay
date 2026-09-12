import { MilestoneEscrowAbi } from "@milestonepay/contracts"
import { useState } from "react"
import { decodeEventLog, type Address } from "viem"
import { useAccount } from "wagmi"
import { waitForTransactionReceipt, writeContract } from "wagmi/actions"
import { avalancheFuji } from "wagmi/chains"

import { hashEvidenceNote } from "@/lib/evidence"
import { sameAddress } from "@/lib/deal"
import { transactionError } from "@/lib/transaction-error"
import { wagmiConfig } from "@/web3/config"

type SubmitArgs = {
  escrowAddress: Address
  provider: Address
  milestoneId: bigint
  evidenceNote: string
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
  }: SubmitArgs) {
    const evidenceHash = hashEvidenceNote(evidenceNote)
    if (!wallet || !sameAddress(wallet, provider))
      return setMessage("Only the provider can submit this milestone.")
    if (chainId !== avalancheFuji.id)
      return setMessage("Switch to Avalanche Fuji first.")
    if (!evidenceHash)
      return setMessage("Add an evidence note before submitting.")

    setIsPending(true)
    setMessage("Confirm in wallet")
    try {
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
      setMessage(submitted ? "Milestone submitted" : "Transaction confirmed")
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

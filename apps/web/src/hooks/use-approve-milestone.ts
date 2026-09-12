import { MilestoneEscrowAbi } from "@milestonepay/contracts"
import { useState } from "react"
import { decodeEventLog, type Address } from "viem"
import { useAccount } from "wagmi"
import { waitForTransactionReceipt, writeContract } from "wagmi/actions"
import { avalancheFuji } from "wagmi/chains"

import { sameAddress } from "@/lib/deal"
import { transactionError } from "@/lib/transaction-error"
import { wagmiConfig } from "@/web3/config"

type ApproveArgs = {
  escrowAddress: Address
  client: Address
  milestoneId: bigint
}

export function useApproveMilestone(refetch: () => Promise<unknown>) {
  const { address: wallet, chainId } = useAccount()
  const [message, setMessage] = useState<string>()
  const [isPending, setIsPending] = useState(false)

  async function approve({ escrowAddress, client, milestoneId }: ApproveArgs) {
    if (!wallet || !sameAddress(wallet, client))
      return setMessage("Only the client can approve this milestone.")
    if (chainId !== avalancheFuji.id)
      return setMessage("Switch to Avalanche Fuji first.")

    setIsPending(true)
    setMessage("Confirm in wallet")
    try {
      const hash = await writeContract(wagmiConfig, {
        address: escrowAddress,
        abi: MilestoneEscrowAbi,
        functionName: "approveMilestone",
        args: [milestoneId],
      })
      setMessage("Approval pending")
      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash })
      const events = receipt.logs.map((log) => {
        try {
          return decodeEventLog({
            abi: MilestoneEscrowAbi,
            data: log.data,
            topics: log.topics,
          }).eventName
        } catch {
          return undefined
        }
      })
      const released =
        events.includes("FundsReleased") && events.includes("MilestoneApproved")
      const completed = events.includes("DealCompleted")
      await refetch()
      setMessage(
        completed
          ? "Agreement completed"
          : released
            ? "Funds released"
            : "Transaction confirmed"
      )
      return hash
    } catch (error) {
      console.error(error)
      setMessage(transactionError(error, "approve"))
    } finally {
      setIsPending(false)
    }
  }

  return {
    approve,
    message,
    isPending,
    clearMessage: () => setMessage(undefined),
  }
}

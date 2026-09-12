import { MilestoneEscrowAbi, MockUSDTAbi } from "@milestonepay/contracts"
import { useQuery } from "@tanstack/react-query"
import { type Address, type Hex } from "viem"
import { readContract } from "wagmi/actions"

import { wagmiConfig } from "@/web3/config"

type Milestone = { amount: bigint; evidenceHash: Hex; status: number }
export type Escrow = {
  client: Address
  provider: Address
  arbiter: Address
  paymentToken: Address
  totalAmount: bigint
  totalReleased: bigint
  status: number
  currentMilestone: bigint
  locked: bigint
  providerBalance: bigint
  milestones: Milestone[]
}

export function useEscrow(address: Address | undefined) {
  return useQuery({
    queryKey: ["escrow", address],
    enabled: Boolean(address),
    refetchInterval: 5_000,
    queryFn: async (): Promise<Escrow> => {
      const target = address as Address
      const [
        client,
        provider,
        arbiter,
        paymentToken,
        totalAmount,
        totalReleased,
        status,
        currentMilestone,
        milestoneCount,
      ] = await Promise.all([
        readContract(wagmiConfig, {
          address: target,
          abi: MilestoneEscrowAbi,
          functionName: "client",
        }),
        readContract(wagmiConfig, {
          address: target,
          abi: MilestoneEscrowAbi,
          functionName: "provider",
        }),
        readContract(wagmiConfig, {
          address: target,
          abi: MilestoneEscrowAbi,
          functionName: "arbiter",
        }),
        readContract(wagmiConfig, {
          address: target,
          abi: MilestoneEscrowAbi,
          functionName: "paymentToken",
        }),
        readContract(wagmiConfig, {
          address: target,
          abi: MilestoneEscrowAbi,
          functionName: "totalAmount",
        }),
        readContract(wagmiConfig, {
          address: target,
          abi: MilestoneEscrowAbi,
          functionName: "totalReleased",
        }),
        readContract(wagmiConfig, {
          address: target,
          abi: MilestoneEscrowAbi,
          functionName: "status",
        }),
        readContract(wagmiConfig, {
          address: target,
          abi: MilestoneEscrowAbi,
          functionName: "currentMilestone",
        }),
        readContract(wagmiConfig, {
          address: target,
          abi: MilestoneEscrowAbi,
          functionName: "milestoneCount",
        }),
      ])
      const milestones = await Promise.all(
        Array.from(
          { length: Number(milestoneCount) },
          async (_, milestoneId) => {
            const result = await readContract(wagmiConfig, {
              address: target,
              abi: MilestoneEscrowAbi,
              functionName: "getMilestone",
              args: [BigInt(milestoneId)],
            })
            return {
              amount: result.amount,
              evidenceHash: result.evidenceHash,
              status: Number(result.status),
            }
          }
        )
      )
      const [locked, providerBalance] = await Promise.all([
        readContract(wagmiConfig, {
          address: paymentToken,
          abi: MockUSDTAbi,
          functionName: "balanceOf",
          args: [target],
        }),
        readContract(wagmiConfig, {
          address: paymentToken,
          abi: MockUSDTAbi,
          functionName: "balanceOf",
          args: [provider],
        }),
      ])
      return {
        client,
        provider,
        arbiter,
        paymentToken,
        totalAmount,
        totalReleased,
        status: Number(status),
        currentMilestone,
        locked,
        providerBalance,
        milestones,
      }
    },
  })
}

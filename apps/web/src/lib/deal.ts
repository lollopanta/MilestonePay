import { formatUnits, type Address } from "viem"

export function sameAddress(first: Address | undefined, second: Address) {
  return Boolean(first && first.toLowerCase() === second.toLowerCase())
}

export function formatUsdt(value: bigint) {
  const [whole, fraction] = formatUnits(value, 6).split(".")
  return `${BigInt(whole).toLocaleString("en-US")}${fraction ? `.${fraction}` : ""} USDT`
}

export function progressPercentage(released: bigint, total: bigint) {
  return total === 0n ? 0n : (released * 100n) / total
}

export function canSubmitMilestone(
  wallet: Address | undefined,
  provider: Address,
  dealStatus: number,
  milestoneStatus: number
) {
  return (
    sameAddress(wallet, provider) && dealStatus === 1 && milestoneStatus === 0
  )
}

export function canApproveMilestone(
  wallet: Address | undefined,
  client: Address,
  dealStatus: number,
  milestoneStatus: number
) {
  return (
    sameAddress(wallet, client) && dealStatus === 1 && milestoneStatus === 1
  )
}

export type ProtocolEvent = Record<string, unknown>

const titles: Record<string, string> = {
  EscrowCreated: "Agreement created",
  EscrowFunded: "Funds deposited",
  MilestoneSubmitted: "Milestone submitted",
  MilestoneApproved: "Milestone approved",
  FundsReleased: "Settlement executed",
  DisputeOpened: "Dispute opened",
  DisputeEvidenceSubmitted: "Dispute evidence submitted",
  DisputeResolved: "Dispute resolved",
  ReviewTimeoutClaimed: "Review timeout claimed",
}

const string = (value: unknown) => (typeof value === "string" ? value : "")

export function eventPresentation(event: ProtocolEvent) {
  const eventName = string(event.event_name)
  const amount = [event.amount, event.provider_amount]
    .map(string)
    .find((value) => /^\d+$/.test(value))

  return {
    title:
      (titles[eventName] ?? eventName.replace(/([a-z])([A-Z])/g, "$1 $2")) ||
      "Protocol event",
    escrow: string(event.escrow),
    transaction: string(event.tx_hash),
    block: string(event.block_number),
    amount,
  }
}

export const sortEvents = (events: ProtocolEvent[]) =>
  [...events].sort(
    (first, second) =>
      Number(second.block_number ?? 0) - Number(first.block_number ?? 0)
  )

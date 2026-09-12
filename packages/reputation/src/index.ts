export type Address = `0x${string}`
export type Settlement = { escrow: Address; client: Address; provider: Address; chainId: number; token: Address; providerAmount: bigint; clientRefundAmount: bigint; type: "approved" | "timeout" | "dispute" }
export type Deal = { escrow: Address; client: Address; provider: Address; status: "completed" | "cancelled" | "active" }
export type ReputationHistory = { deals: Deal[]; settlements: Settlement[] }
export type ReputationFactor = { code: string; impact: number; description: string }
export type ReputationResult = { overallScore: number; confidence: "low" | "medium" | "high"; roles: { client?: { score: number }; provider?: { score: number } }; metrics: { deals: number; completedDeals: number; cancelledDeals: number; settlements: number; disputesOpened: number; disputesResolved: number; timeoutClaimsAgainstClient: number; uniqueCounterparties: number; volumeByToken: { chainId: number; token: Address; amount: bigint }[] }; factors: ReputationFactor[] }

const clamp = (score: number) => Math.max(0, Math.min(100, score))
const key = (address: Address) => address.toLowerCase()

export function calculateReputation(wallet: Address, history: ReputationHistory): ReputationResult {
  const walletKey = key(wallet)
  const deals = history.deals.filter((deal) => key(deal.client) === walletKey || key(deal.provider) === walletKey)
  const settlements = history.settlements.filter((s) => key(s.client) === walletKey || key(s.provider) === walletKey)
  const asClient = deals.some((deal) => key(deal.client) === walletKey)
  const asProvider = deals.some((deal) => key(deal.provider) === walletKey)
  const completed = deals.filter((deal) => deal.status === "completed").length
  const cancelled = deals.filter((deal) => deal.status === "cancelled").length
  const disputes = settlements.filter((s) => s.type === "dispute")
  const timeoutClaims = settlements.filter((s) => s.type === "timeout" && key(s.client) === walletKey).length
  const counterparties = new Set(deals.map((deal) => key(deal.client) === walletKey ? key(deal.provider) : key(deal.client)))
  const factors: ReputationFactor[] = []
  let score = 50
  const completedImpact = Math.min(20, completed * 4); if (completedImpact) factors.push({ code: "COMPLETED_DEALS", impact: completedImpact, description: `${completed} completed agreements` })
  score += completedImpact
  const diversityImpact = Math.min(10, counterparties.size * 2); if (diversityImpact) factors.push({ code: "COUNTERPARTY_DIVERSITY", impact: diversityImpact, description: `${counterparties.size} unique counterparties` })
  score += diversityImpact
  const roleDisputes = disputes.map((s) => key(s.provider) === walletKey ? s.providerAmount * 10_000n / (s.providerAmount + s.clientRefundAmount || 1n) : s.clientRefundAmount * 10_000n / (s.providerAmount + s.clientRefundAmount || 1n))
  const outcomeImpact = roleDisputes.reduce((sum, bps) => sum + (bps >= 7_000n ? 3 : bps <= 3_000n ? -4 : 0), 0)
  if (outcomeImpact) factors.push({ code: "DISPUTE_OUTCOMES", impact: outcomeImpact, description: `${disputes.length} resolved dispute outcomes` })
  score += Math.max(-20, Math.min(12, outcomeImpact))
  const timeoutImpact = -Math.min(20, timeoutClaims * 5); if (timeoutImpact) factors.push({ code: "REVIEW_TIMEOUTS", impact: timeoutImpact, description: `${timeoutClaims} provider timeout claims` })
  score += timeoutImpact
  const volumes = new Map<string, { chainId: number; token: Address; amount: bigint }>()
  for (const s of settlements) { const amount = key(s.provider) === walletKey ? s.providerAmount : s.clientRefundAmount; const volumeKey = `${s.chainId}:${key(s.token)}`; const current = volumes.get(volumeKey); volumes.set(volumeKey, current ? { ...current, amount: current.amount + amount } : { chainId: s.chainId, token: s.token, amount }) }
  const interactions = settlements.length
  return { overallScore: clamp(score), confidence: interactions >= 10 ? "high" : interactions >= 3 ? "medium" : "low", roles: { ...(asClient ? { client: { score: clamp(score) } } : {}), ...(asProvider ? { provider: { score: clamp(score) } } : {}) }, metrics: { deals: deals.length, completedDeals: completed, cancelledDeals: cancelled, settlements: interactions, disputesOpened: disputes.length, disputesResolved: disputes.length, timeoutClaimsAgainstClient: timeoutClaims, uniqueCounterparties: counterparties.size, volumeByToken: [...volumes.values()] }, factors }
}

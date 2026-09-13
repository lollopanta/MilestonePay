export type Reputation = {
  overallScore: number
  confidence: "low" | "medium" | "high"
  roles: { client?: { score: number }; provider?: { score: number } }
  metrics: {
    deals: number
    completedDeals: number
    cancelledDeals: number
    settlements: number
    disputesOpened: number
    disputesResolved: number
    timeoutClaimsAgainstClient: number
    uniqueCounterparties: number
    volumeByToken: { chainId: number; token: string; amount: string }[]
  }
  factors: { code: string; impact: number; description: string }[]
}

const baseUrl = (
  import.meta.env.VITE_API_URL || "/api"
).replace(/\/$/, "")

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {}

const number = (value: unknown) => (typeof value === "number" ? value : 0)
const string = (value: unknown) => (typeof value === "string" ? value : "")

export async function getReputation(
  address: string,
  signal?: AbortSignal
): Promise<Reputation> {
  const response = await fetch(`${baseUrl}/wallets/${address}/reputation`, {
    signal,
  })
  if (!response.ok) throw new Error("Reputation data is unavailable")

  const body = record(await response.json())
  const metrics = record(body.metrics)
  const roles = record(body.roles)
  const volumes = Array.isArray(metrics.volumeByToken)
    ? metrics.volumeByToken
    : []
  const factors = Array.isArray(body.factors) ? body.factors : []

  return {
    overallScore: number(body.overallScore),
    confidence: ["low", "medium", "high"].includes(string(body.confidence))
      ? (string(body.confidence) as Reputation["confidence"])
      : "low",
    roles: {
      ...(record(roles.client).score !== undefined
        ? { client: { score: number(record(roles.client).score) } }
        : {}),
      ...(record(roles.provider).score !== undefined
        ? { provider: { score: number(record(roles.provider).score) } }
        : {}),
    },
    metrics: {
      deals: number(metrics.deals),
      completedDeals: number(metrics.completedDeals),
      cancelledDeals: number(metrics.cancelledDeals),
      settlements: number(metrics.settlements),
      disputesOpened: number(metrics.disputesOpened),
      disputesResolved: number(metrics.disputesResolved),
      timeoutClaimsAgainstClient: number(metrics.timeoutClaimsAgainstClient),
      uniqueCounterparties: number(metrics.uniqueCounterparties),
      volumeByToken: volumes.map((volume) => {
        const item = record(volume)
        return {
          chainId: number(item.chainId),
          token: string(item.token),
          amount: string(item.amount),
        }
      }),
    },
    factors: factors.map((factor) => {
      const item = record(factor)
      return {
        code: string(item.code),
        impact: number(item.impact),
        description: string(item.description),
      }
    }),
  }
}

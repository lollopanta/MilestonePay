import { RiDatabase2Line, RiShieldCheckLine } from "@remixicon/react"

import type { Reputation } from "@/features/reputation/api"
import { formatUsdt } from "@/lib/deal"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

const shortAddress = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`

const confidenceVariant = (confidence: Reputation["confidence"]) =>
  confidence === "low"
    ? "outline"
    : confidence === "medium"
      ? "secondary"
      : "default"

const formatVolume = (value: string) =>
  /^\d+$/.test(value) ? formatUsdt(BigInt(value)) : "—"

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}

export function ReputationSignal({
  address,
  reputation,
}: {
  address: string
  reputation: Reputation
}) {
  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Reputation signal</CardTitle>
          <CardDescription>{shortAddress(address)}</CardDescription>
        </CardHeader>
        <CardContent className="gap-5">
          <div className="flex items-end justify-between gap-4">
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-semibold tracking-tight tabular-nums">
                {reputation.overallScore}
              </span>
              <span className="text-sm text-muted-foreground">out of 100</span>
            </div>
            <Badge variant={confidenceVariant(reputation.confidence)}>
              {reputation.confidence} confidence
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            MilestonePay protocol reputation based on verifiable interaction history.
            It is not a statement of human trustworthiness.
          </p>
          <Separator />
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <Metric label="Agreements" value={reputation.metrics.deals} />
            <Metric
              label="Completed"
              value={reputation.metrics.completedDeals}
            />
            <Metric
              label="Settlements"
              value={reputation.metrics.settlements}
            />
            <Metric
              label="Counterparties"
              value={reputation.metrics.uniqueCounterparties}
            />
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RiDatabase2Line aria-hidden="true" />
            Data source
          </CardTitle>
          <CardDescription>
            Verified MilestonePay protocol history, indexed through Arkiv.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Score factors</CardTitle>
            <CardDescription>
              Only outcomes recorded by the protocol affect this signal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {reputation.factors.length ? (
              reputation.factors.map((factor) => (
                <div
                  key={factor.code}
                  className="flex items-center justify-between gap-4 text-sm"
                >
                  <span className="text-muted-foreground">
                    {factor.description}
                  </span>
                  <Badge
                    variant={factor.impact < 0 ? "destructive" : "secondary"}
                  >
                    {factor.impact > 0 ? "+" : ""}
                    {factor.impact}
                  </Badge>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No completed protocol outcomes yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle>Analyzed volume</CardTitle>
            <CardDescription>
              Settled value grouped by token and network.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {reputation.metrics.volumeByToken.length ? (
              reputation.metrics.volumeByToken.map((volume) => (
                <div
                  key={`${volume.chainId}:${volume.token}`}
                  className="flex items-center justify-between gap-4 text-sm"
                >
                  <span className="text-muted-foreground">
                    {shortAddress(volume.token)} · Fuji
                  </span>
                  <span className="font-medium tabular-nums">
                    {formatVolume(volume.amount)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No settled volume recorded yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {(reputation.metrics.disputesOpened > 0 ||
        reputation.metrics.timeoutClaimsAgainstClient > 0) && (
        <Card size="sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RiShieldCheckLine aria-hidden="true" />
              Protocol indicators
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-5 sm:grid-cols-3">
            <Metric
              label="Disputes"
              value={reputation.metrics.disputesOpened}
            />
            <Metric
              label="Resolved disputes"
              value={reputation.metrics.disputesResolved}
            />
            <Metric
              label="Review timeouts"
              value={reputation.metrics.timeoutClaimsAgainstClient}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

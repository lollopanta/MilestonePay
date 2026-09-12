import { useQuery } from "@tanstack/react-query"
import {
  RiAddLine,
  RiArrowRightUpLine,
  RiFileList3Line,
  RiInformationLine,
  RiPulseLine,
  RiShieldCheckLine,
} from "@remixicon/react"
import { Link } from "react-router"
import { useAccount } from "wagmi"

import { WalletButton } from "@/components/wallet-button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Amount, StatusBadge, WalletAddress } from "@/components/ui/financial"
import {
  EmptyState,
  LoadingState,
  MetricCard,
  PageHeader,
  SectionHeader,
} from "@/components/ui/page"

type Deal = {
  escrow: string
  status: string | number
  total_amount?: string
}
type WalletHistory = {
  deals: Deal[]
  events: Array<{
    event_name?: string
    escrow?: string
    arbiter?: string
    block_number?: number | string
  }>
  settlements: unknown[]
}
type Reputation = {
  overallScore: number
  confidence: "low" | "medium" | "high"
}

const apiUrl = (path: string) =>
  `${(import.meta.env.VITE_API_URL || "http://localhost:3001").replace(/\/$/, "")}${path}`

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(apiUrl(path))
  if (!response.ok) throw new Error("Protocol history is unavailable")
  return response.json() as Promise<T>
}

const eventLabel = (event?: string) =>
  event?.replace(/([a-z])([A-Z])/g, "$1 $2") ?? "Protocol event"

type DashboardStatus =
  "active" | "pending" | "completed" | "disputed" | "cancelled" | "neutral"

const statusFor = (status: Deal["status"]): DashboardStatus => {
  if (typeof status === "number") {
    return (
      (["pending", "active", "disputed", "completed", "cancelled"] as const)[
        status
      ] ?? "neutral"
    )
  }
  if (status === "created") return "pending"
  return ["active", "pending", "completed", "disputed", "cancelled"].includes(
    status
  )
    ? (status as DashboardStatus)
    : "neutral"
}

export function Home() {
  const { address, isConnected } = useAccount()
  const history = useQuery({
    queryKey: ["wallet-history", address],
    queryFn: () => getJson<WalletHistory>(`/wallets/${address}/history`),
    enabled: Boolean(address),
  })
  const reputation = useQuery({
    queryKey: ["wallet-reputation", address],
    queryFn: () => getJson<Reputation>(`/wallets/${address}/reputation`),
    enabled: Boolean(address),
  })
  const arbiterEscrows = [
    ...new Set(
      history.data?.events
        .filter(
          (event) => event.arbiter?.toLowerCase() === address?.toLowerCase()
        )
        .map((event) => event.escrow)
        .filter((escrow): escrow is string => Boolean(escrow)) ?? []
    ),
  ]
  const arbiterDeals = useQuery({
    queryKey: ["arbiter-deals", address, arbiterEscrows],
    enabled: Boolean(address && arbiterEscrows.length),
    queryFn: async () => {
      const results = await Promise.allSettled(
        arbiterEscrows.map((escrow) => getJson<Deal>(`/deals/${escrow}`))
      )
      return results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : []
      )
    },
  })
  const deals = [
    ...(history.data?.deals ?? []),
    ...(arbiterDeals.data ?? []),
  ].filter(
    (deal, index, items) =>
      items.findIndex(
        (candidate) =>
          candidate.escrow.toLowerCase() === deal.escrow.toLowerCase()
      ) === index
  )
  const openDeals = deals.filter((deal) => {
    const status = statusFor(deal.status)
    return status === "active" || status === "disputed"
  })
  const totalEscrowed = openDeals.reduce(
    (total, deal) => total + BigInt(deal.total_amount ?? "0"),
    0n
  )

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-8 sm:px-8 lg:px-10">
      <PageHeader
        eyebrow="Overview"
        title={isConnected ? "Your agreements" : "Your escrow workspace"}
        description={
          isConnected
            ? "Live protocol history for your connected wallet."
            : "Connect a wallet to review escrow activity and create an agreement."
        }
        actions={
          <Button nativeButton={false} render={<Link to="/create" />}>
            <RiAddLine data-icon="inline-start" />
            New agreement
          </Button>
        }
      />

      {!isConnected ? (
        <EmptyState
          icon={<RiShieldCheckLine />}
          title="Connect to view your workspace"
          description="MilestonePay reads your agreements and settlement history from the connected wallet."
          action={<WalletButton />}
        />
      ) : (
        <>
          <section
            aria-label="Account metrics"
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
          >
            <MetricCard
              label="Active escrowed"
              value={<Amount value={totalEscrowed} />}
              detail="Across active agreements"
            />
            <MetricCard
              label="Open agreements"
              value={openDeals.length}
              detail={`${openDeals.filter((deal) => statusFor(deal.status) === "disputed").length} in dispute`}
            />
            <MetricCard
              label="Completed settlements"
              value={history.data?.settlements.length ?? "—"}
              detail="Verified protocol outcomes"
            />
            <MetricCard
              label="Reputation signal"
              value={reputation.data ? reputation.data.overallScore : "—"}
              detail={
                reputation.data
                  ? `${reputation.data.confidence} confidence`
                  : "Based on protocol history"
              }
            />
          </section>

          {(history.isError || reputation.isError) && (
            <Alert variant="destructive">
              <RiInformationLine />
              <AlertTitle>Some protocol data is unavailable</AlertTitle>
              <AlertDescription>
                Reconnect or try again once the history index is available.
              </AlertDescription>
            </Alert>
          )}

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(18rem,0.8fr)]">
            <div className="flex flex-col gap-4">
              <SectionHeader
                title="Open agreements"
                description="Active agreements and disputes requiring attention."
              />
              {history.isPending ||
              (arbiterEscrows.length > 0 && arbiterDeals.isPending) ? (
                <LoadingState rows={3} />
              ) : openDeals.length ? (
                <Card className="bg-card/80" size="sm">
                  <CardContent className="gap-0">
                    {openDeals.map((deal) => {
                      const status = statusFor(deal.status)
                      return (
                        <Link
                          className="group flex items-center justify-between gap-4 border-b border-border py-4 first:pt-0 last:border-0 last:pb-0"
                          key={deal.escrow}
                          to={`/deal/${deal.escrow}`}
                        >
                          <div className="flex min-w-0 flex-col gap-1">
                            <span className="font-medium group-hover:text-primary">
                              Agreement
                            </span>
                            <WalletAddress address={deal.escrow} />
                          </div>
                          <div className="flex shrink-0 items-center gap-3 text-right">
                            <div className="hidden flex-col gap-1 sm:flex">
                              <Amount
                                value={BigInt(deal.total_amount ?? "0")}
                              />
                              <span className="text-xs text-muted-foreground">
                                Total agreement
                              </span>
                            </div>
                            <StatusBadge status={status} />
                            <RiArrowRightUpLine className="text-muted-foreground" />
                          </div>
                        </Link>
                      )
                    })}
                  </CardContent>
                </Card>
              ) : (
                <EmptyState
                  icon={<RiFileList3Line />}
                  title="No open agreements"
                  description="Create an agreement to secure the first milestone in escrow."
                  action={
                    <Button
                      nativeButton={false}
                      render={<Link to="/create" />}
                      variant="outline"
                    >
                      Create agreement
                    </Button>
                  }
                />
              )}
            </div>

            <div className="flex flex-col gap-4">
              <SectionHeader
                title="Recent activity"
                description="Latest indexed protocol events."
              />
              <Card className="bg-card/80" size="sm">
                <CardHeader>
                  <CardTitle className="text-sm font-medium">
                    Protocol history
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {history.isPending ? (
                    <LoadingState rows={2} />
                  ) : history.data?.events.length ? (
                    history.data.events
                      .slice(-4)
                      .reverse()
                      .map((event, index) => (
                        <div
                          className="flex items-start gap-3 border-b border-border py-3 first:pt-0 last:border-0 last:pb-0"
                          key={`${event.escrow}-${event.block_number}-${index}`}
                        >
                          <span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                            <RiPulseLine />
                          </span>
                          <div className="flex min-w-0 flex-1 flex-col gap-1">
                            <span className="text-sm font-medium">
                              {eventLabel(event.event_name)}
                            </span>
                            <WalletAddress address={event.escrow} />
                          </div>
                          {event.block_number && (
                            <span className="text-xs text-muted-foreground tabular-nums">
                              Block {event.block_number}
                            </span>
                          )}
                        </div>
                      ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      New protocol events will appear here.
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>
        </>
      )}
    </main>
  )
}

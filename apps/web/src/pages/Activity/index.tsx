import { useQuery } from "@tanstack/react-query"
import { RiErrorWarningLine, RiPulseLine } from "@remixicon/react"
import { isAddress } from "viem"
import { useAccount } from "wagmi"

import { ActivityTimeline } from "@/components/activity/activity-timeline"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import type { ProtocolEvent } from "@/features/activity/presentation"

const baseUrl = (
  import.meta.env.VITE_API_URL || "http://localhost:3001"
).replace(/\/$/, "")

async function getHistory(address: string, signal?: AbortSignal) {
  const response = await fetch(`${baseUrl}/wallets/${address}/history`, {
    signal,
  })
  if (!response.ok) throw new Error("Activity data is unavailable")
  const body: unknown = await response.json()
  if (
    typeof body !== "object" ||
    body === null ||
    !("events" in body) ||
    !Array.isArray(body.events)
  ) {
    throw new Error("Activity data is unavailable")
  }
  return body.events.filter(
    (event): event is ProtocolEvent =>
      typeof event === "object" && event !== null
  )
}

export function ActivityPage({ address }: { address?: string }) {
  const { address: connectedAddress } = useAccount()
  const targetAddress = address ?? connectedAddress
  const query = useQuery({
    queryKey: ["activity", targetAddress],
    enabled: Boolean(targetAddress && isAddress(targetAddress)),
    queryFn: ({ signal }) => getHistory(targetAddress!, signal),
  })

  if (!targetAddress)
    return (
      <ActivityEmpty
        title="Select a wallet"
        description="Connect a wallet or open a wallet-specific activity link."
      />
    )
  if (!isAddress(targetAddress))
    return (
      <ActivityEmpty
        title="Wallet unavailable"
        description="The wallet address in this link is not valid."
      />
    )

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-8 sm:px-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-muted-foreground">
          Arkiv-backed history
        </p>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Activity
        </h1>
      </header>
      {query.isPending ? (
        <Skeleton className="h-96" aria-label="Loading activity" />
      ) : null}
      {query.isError ? (
        <Alert variant="destructive">
          <RiErrorWarningLine aria-hidden="true" />
          <AlertTitle>Activity unavailable</AlertTitle>
          <AlertDescription>
            Protocol history could not be loaded. Check the API connection and
            try again.
          </AlertDescription>
        </Alert>
      ) : null}
      {query.data?.length ? <ActivityTimeline events={query.data} /> : null}
      {query.data && !query.data.length ? (
        <ActivityEmpty
          title="No protocol activity"
          description="Events will appear here after this wallet participates in an agreement."
          compact
        />
      ) : null}
    </main>
  )
}

function ActivityEmpty({
  title,
  description,
  compact = false,
}: {
  title: string
  description: string
  compact?: boolean
}) {
  return (
    <main
      className={
        compact
          ? ""
          : "mx-auto flex min-h-svh w-full max-w-5xl px-5 py-8 sm:px-8"
      }
    >
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <RiPulseLine aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </main>
  )
}

import { useQuery } from "@tanstack/react-query"
import { RiErrorWarningLine, RiShieldCheckLine } from "@remixicon/react"
import { isAddress } from "viem"
import { useAccount } from "wagmi"

import { ReputationSignal } from "@/components/reputation/reputation-signal"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { getReputation } from "@/features/reputation/api"

export function ReputationPage({ address }: { address?: string }) {
  const { address: connectedAddress } = useAccount()
  const targetAddress = address ?? connectedAddress
  const query = useQuery({
    queryKey: ["reputation", targetAddress],
    enabled: Boolean(targetAddress && isAddress(targetAddress)),
    queryFn: ({ signal }) => getReputation(targetAddress!, signal),
  })

  if (!targetAddress) {
    return (
      <ReputationEmpty
        title="Select a wallet"
        description="Connect a wallet or open a wallet-specific reputation link."
      />
    )
  }

  if (!isAddress(targetAddress)) {
    return (
      <ReputationEmpty
        title="Wallet unavailable"
        description="The wallet address in this link is not valid."
      />
    )
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-5 py-8 sm:px-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-muted-foreground">
          Protocol history
        </p>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Reputation
        </h1>
      </header>
      {query.isPending ? <ReputationSkeleton /> : null}
      {query.isError ? (
        <Alert variant="destructive">
          <RiErrorWarningLine aria-hidden="true" />
          <AlertTitle>Reputation unavailable</AlertTitle>
          <AlertDescription>
            Protocol history could not be loaded. Check the API connection and
            try again.
          </AlertDescription>
        </Alert>
      ) : null}
      {query.data ? (
        <ReputationSignal address={targetAddress} reputation={query.data} />
      ) : null}
    </main>
  )
}

function ReputationEmpty({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-5xl px-5 py-8 sm:px-8">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <RiShieldCheckLine aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{title}</EmptyTitle>
          <EmptyDescription>{description}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </main>
  )
}

function ReputationSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-label="Loading reputation">
      <Skeleton className="h-64" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Skeleton className="h-44" />
        <Skeleton className="h-44" />
      </div>
    </div>
  )
}

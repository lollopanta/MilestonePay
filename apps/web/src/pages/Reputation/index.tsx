import { useQuery } from "@tanstack/react-query"
import {
  RiErrorWarningLine,
  RiSearchLine,
  RiShieldCheckLine,
} from "@remixicon/react"
import { type FormEvent, useState } from "react"
import { useNavigate } from "react-router"
import { isAddress } from "viem"
import { normalize } from "viem/ens"
import { useAccount } from "wagmi"
import { getPublicClient } from "wagmi/actions"
import { mainnet } from "wagmi/chains"

import { ReputationSignal } from "@/components/reputation/reputation-signal"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { getReputation } from "@/features/reputation/api"
import { wagmiConfig } from "@/web3/config"

export function ReputationPage({ address }: { address?: string }) {
  const { address: connectedAddress } = useAccount()
  const navigate = useNavigate()
  const [search, setSearch] = useState("")
  const [searchError, setSearchError] = useState<string>()
  const [isSearching, setIsSearching] = useState(false)
  const targetAddress = address ?? connectedAddress
  const query = useQuery({
    queryKey: ["reputation", targetAddress],
    enabled: Boolean(targetAddress && isAddress(targetAddress)),
    queryFn: ({ signal }) => getReputation(targetAddress!, signal),
  })

  async function findReputation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const target = search.trim()
    if (!target) return setSearchError("Enter a wallet address or ENS name.")
    if (isAddress(target)) return navigate(`/reputation/${target}`)

    setIsSearching(true)
    setSearchError(undefined)
    try {
      const client = getPublicClient(wagmiConfig, { chainId: mainnet.id })
      const resolved = await client?.getEnsAddress({ name: normalize(target) })
      if (!resolved)
        return setSearchError("No wallet was found for that ENS name.")
      navigate(`/reputation/${resolved}`)
    } catch {
      setSearchError("Enter a valid wallet address or ENS name.")
    } finally {
      setIsSearching(false)
    }
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
      <form
        className="flex flex-col gap-3 sm:flex-row"
        onSubmit={findReputation}
      >
        <label className="sr-only" htmlFor="reputation-search">
          Wallet address or ENS name
        </label>
        <Input
          id="reputation-search"
          autoComplete="off"
          value={search}
          placeholder="Wallet address or ENS name (vitalik.eth)"
          onChange={(event) => setSearch(event.target.value)}
          aria-invalid={Boolean(searchError)}
        />
        <Button className="shrink-0" disabled={isSearching} type="submit">
          <RiSearchLine data-icon="inline-start" />
          {isSearching ? "Resolving" : "Search reputation"}
        </Button>
      </form>
      {searchError ? (
        <Alert variant="destructive">
          <RiErrorWarningLine aria-hidden="true" />
          <AlertTitle>Search unavailable</AlertTitle>
          <AlertDescription>{searchError}</AlertDescription>
        </Alert>
      ) : null}
      {!targetAddress ? (
        <ReputationEmpty
          title="Select a wallet"
          description="Search for a wallet or ENS name, or connect a wallet."
        />
      ) : !isAddress(targetAddress) ? (
        <ReputationEmpty
          title="Wallet unavailable"
          description="The wallet address in this link is not valid."
        />
      ) : (
        <>
          {query.isPending ? <ReputationSkeleton /> : null}
          {query.isError ? (
            <Alert variant="destructive">
              <RiErrorWarningLine aria-hidden="true" />
              <AlertTitle>Reputation unavailable</AlertTitle>
              <AlertDescription>
                Protocol history could not be loaded. Check the API connection
                and try again.
              </AlertDescription>
            </Alert>
          ) : null}
          {query.data ? (
            <ReputationSignal address={targetAddress} reputation={query.data} />
          ) : null}
        </>
      )}
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

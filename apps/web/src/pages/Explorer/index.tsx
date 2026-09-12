import { EscrowFactoryAbi } from "@milestonepay/contracts"
import { useQuery } from "@tanstack/react-query"
import {
  RiArrowRightUpLine,
  RiErrorWarningLine,
  RiRefreshLine,
  RiSearchLine,
  RiStackLine,
} from "@remixicon/react"
import { useState, type FormEvent } from "react"
import { Link, useNavigate } from "react-router"
import { getAbiItem, isAddress, type Address, type Hex } from "viem"
import { getPublicClient, readContract } from "wagmi/actions"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  EmptyState,
  LoadingState,
  PageHeader,
  SectionHeader,
} from "@/components/ui/page"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { WalletAddress } from "@/components/ui/financial"
import {
  blockDate,
  recentBlockRange,
  shortHash,
} from "@/features/explorer/blocks"
import { wagmiConfig } from "@/web3/config"
import { contracts } from "@/web3/contracts"

type Creation = {
  escrow: Address
  client: Address
  provider: Address
  blockNumber: bigint
  timestamp: bigint
  transactionHash: Hex
}

async function loadRecentCreations() {
  const client = getPublicClient(wagmiConfig)
  if (!client) throw new Error("Avalanche Fuji RPC is unavailable")

  const latestBlock = await client.getBlockNumber()
  const { fromBlock, toBlock } = recentBlockRange(latestBlock)
  const event = getAbiItem({ abi: EscrowFactoryAbi, name: "EscrowCreated" })
  const logs = await client.getLogs({
    address: contracts.escrowFactory,
    event,
    fromBlock,
    toBlock,
  })

  const timestamps = new Map(
    await Promise.all(
      [...new Set(logs.map((log) => log.blockNumber))].map(
        async (blockNumber) => {
          const block = await client.getBlock({ blockNumber })
          return [blockNumber, block.timestamp] as const
        }
      )
    )
  )
  const creations = logs
    .map((log) => ({
      escrow: log.args.escrow,
      client: log.args.client,
      provider: log.args.provider,
      blockNumber: log.blockNumber,
      timestamp: timestamps.get(log.blockNumber),
      transactionHash: log.transactionHash,
    }))
    .filter((log): log is Creation =>
      Boolean(
        log.escrow &&
        log.client &&
        log.provider &&
        log.blockNumber !== null &&
        log.timestamp !== undefined &&
        log.transactionHash
      )
    )
    .sort((first, second) => Number(second.blockNumber - first.blockNumber))

  return { latestBlock, fromBlock, creations }
}

export function ExplorerPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState("")
  const [searchError, setSearchError] = useState<string>()
  const [isSearching, setIsSearching] = useState(false)
  const creations = useQuery({
    queryKey: ["explorer", "recent-creations"],
    queryFn: loadRecentCreations,
    refetchInterval: 30_000,
  })

  async function findAgreement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const target = query.trim()
    if (!isAddress(target)) {
      setSearchError("Enter a valid escrow address.")
      return
    }

    setIsSearching(true)
    setSearchError(undefined)
    try {
      const found = await readContract(wagmiConfig, {
        address: contracts.escrowFactory,
        abi: EscrowFactoryAbi,
        functionName: "isEscrow",
        args: [target],
      })
      if (!found) {
        setSearchError(
          "This address is not a MilestonePay escrow on Avalanche Fuji."
        )
        return
      }
      navigate(`/deals/${target}`)
    } catch {
      setSearchError(
        "Unable to check this address. Check the Fuji connection and try again."
      )
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-8 sm:px-8">
      <PageHeader
        eyebrow="Avalanche Fuji"
        title="Protocol explorer"
        description="Inspect MilestonePay escrow contracts directly from the configured Fuji RPC."
      />

      <Card>
        <CardHeader>
          <CardTitle>Find an agreement</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3 sm:flex-row"
            onSubmit={findAgreement}
          >
            <label className="sr-only" htmlFor="escrow-search">
              Escrow address
            </label>
            <Input
              id="escrow-search"
              autoComplete="off"
              value={query}
              placeholder="Paste an escrow address (0x… )"
              onChange={(event) => setQuery(event.target.value)}
              aria-invalid={Boolean(searchError)}
            />
            <Button className="shrink-0" disabled={isSearching} type="submit">
              <RiSearchLine data-icon="inline-start" />
              {isSearching ? "Checking address" : "Open agreement"}
            </Button>
          </form>
          {searchError && (
            <Alert variant="destructive">
              <RiErrorWarningLine aria-hidden="true" />
              <AlertTitle>Agreement not found</AlertTitle>
              <AlertDescription>{searchError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <section
        className="flex flex-col gap-4"
        aria-labelledby="recent-agreements"
      >
        <SectionHeader
          title="Recent agreement creations"
          description={
            creations.data
              ? `Blocks ${creations.data.fromBlock.toLocaleString()}–${creations.data.latestBlock.toLocaleString()}`
              : "Latest 25,000 protocol blocks"
          }
          action={
            <Button
              aria-label="Refresh recent agreement creations"
              size="icon-sm"
              variant="ghost"
              onClick={() => creations.refetch()}
              disabled={creations.isFetching}
            >
              <RiRefreshLine />
            </Button>
          }
        />

        {creations.isPending ? <LoadingState rows={5} /> : null}
        {creations.isError ? (
          <Alert variant="destructive">
            <RiErrorWarningLine aria-hidden="true" />
            <AlertTitle>Explorer unavailable</AlertTitle>
            <AlertDescription>
              Recent on-chain agreements could not be loaded. Check the Fuji RPC
              and refresh.
            </AlertDescription>
          </Alert>
        ) : null}
        {creations.data?.creations.length ? (
          <Card className="overflow-hidden">
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agreement</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      Client
                    </TableHead>
                    <TableHead className="hidden md:table-cell">
                      Provider
                    </TableHead>
                    <TableHead>Block</TableHead>
                    <TableHead>Date (UTC)</TableHead>
                    <TableHead className="text-right">Transaction</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {creations.data.creations.map((creation) => (
                    <TableRow
                      key={`${creation.transactionHash}-${creation.escrow}`}
                    >
                      <TableCell>
                        <Link
                          className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
                          to={`/deals/${creation.escrow}`}
                        >
                          {shortHash(creation.escrow)}
                          <RiArrowRightUpLine aria-hidden="true" />
                        </Link>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <WalletAddress address={creation.client} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <WalletAddress address={creation.provider} />
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {creation.blockNumber.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Intl.DateTimeFormat("en-GB", {
                          dateStyle: "medium",
                          timeStyle: "short",
                          timeZone: "UTC",
                        }).format(blockDate(creation.timestamp))}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-muted-foreground">
                        {shortHash(creation.transactionHash)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}
        {creations.data && !creations.data.creations.length ? (
          <EmptyState
            icon={<RiStackLine aria-hidden="true" />}
            title="No recent agreements"
            description="No MilestonePay escrows were created in this recent block range. Search a known agreement above."
          />
        ) : null}
      </section>
    </main>
  )
}

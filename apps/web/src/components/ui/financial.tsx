import type { ComponentProps } from "react"
import { formatUnits, isAddress } from "viem"
import { useEnsName } from "wagmi"
import { mainnet } from "wagmi/chains"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type Status =
  "active" | "pending" | "completed" | "disputed" | "cancelled" | "neutral"

const statusClasses: Record<Status, string> = {
  active: "border-success/30 bg-success/10 text-success",
  pending: "border-warning/30 bg-warning/10 text-warning",
  completed: "border-success/30 bg-success/10 text-success",
  disputed: "border-destructive/30 bg-destructive/10 text-destructive",
  cancelled: "border-border bg-muted text-muted-foreground",
  neutral: "border-border bg-muted text-muted-foreground",
}

export function StatusBadge({
  status,
  children,
  className,
}: {
  status: Status
  children?: string
  className?: string
}) {
  return (
    <Badge
      className={cn(
        "gap-1.5 border font-medium capitalize",
        statusClasses[status],
        className
      )}
      variant="outline"
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children ?? status}
    </Badge>
  )
}

export function Amount({
  value,
  token = "USDT",
  decimals = 6,
  className,
  ...props
}: {
  value: bigint | string | number
  token?: string
  decimals?: number
} & ComponentProps<"span">) {
  const units =
    typeof value === "bigint" ? formatUnits(value, decimals) : String(value)
  const amount = Number(units)
  const display = Number.isFinite(amount)
    ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
        amount
      )
    : units

  return (
    <span className={cn("font-medium tabular-nums", className)} {...props}>
      {display} <span className="text-muted-foreground">{token}</span>
    </span>
  )
}

export function WalletAddress({
  address,
  compact = true,
  className,
  ...props
}: { address?: string; compact?: boolean; className?: string } & ComponentProps<"span">) {
  const ensAddress = address && isAddress(address) ? address : undefined
  const { data: ensName } = useEnsName({
    address: ensAddress,
    chainId: mainnet.id,
    query: { enabled: Boolean(ensAddress) },
  })

  if (!address)
    return (
      <span className={cn("text-muted-foreground", className)} {...props}>
        Not connected
      </span>
    )

  return (
    <span
      className={cn("font-mono text-xs text-muted-foreground", className)}
      title={ensName ? `${ensName} · ${address}` : address}
      {...props}
    >
      {compact ? ensName ?? `${address.slice(0, 6)}…${address.slice(-4)}` : address}
    </span>
  )
}

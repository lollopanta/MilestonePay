import { formatUnits, parseUnits } from "viem"

import { tokenDecimals } from "@/web3/contracts"

export type Allocation =
  | { amounts: bigint[]; total: bigint }
  | { amounts: []; total: 0n; error: string }

export function allocationFor(amounts: string[]): Allocation {
  if (amounts.length === 0) {
    return { amounts: [], total: 0n, error: "Add at least one milestone." }
  }

  try {
    const parsed = amounts.map((amount) => {
      const value = parseUnits(amount.trim(), tokenDecimals)
      if (value <= 0n) throw new Error("invalid amount")
      return value
    })

    return {
      amounts: parsed,
      total: parsed.reduce((sum, amount) => sum + amount, 0n),
    }
  } catch {
    return {
      amounts: [],
      total: 0n,
      error:
        "Enter a positive amount for every milestone (up to 6 decimal places).",
    }
  }
}

export function formatMockUsdt(value: bigint) {
  const [whole, fraction] = formatUnits(value, tokenDecimals).split(".")
  return `${BigInt(whole).toLocaleString("en-US")}${fraction ? `.${fraction}` : ""} USDT`
}

import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router"

import { Button } from "@/components/ui/button"
import { WalletButton } from "@/components/wallet-button"

export function Home() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: async ({ signal }) => {
      const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:3001"
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}/health`, {
        signal,
      })
      const body: unknown = await response.json()
      if (
        !response.ok ||
        typeof body !== "object" ||
        body === null ||
        !("status" in body) ||
        body.status !== "ok"
      ) {
        throw new Error("API unavailable")
      }
      return body
    },
    retry: 1,
    refetchInterval: 5000,
  })

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="absolute top-6 right-6"><WalletButton /></div>
      <h1 className="text-4xl font-semibold tracking-tight">MilestonePay</h1>
      <p className="max-w-md text-muted-foreground">Trustless milestone-based escrow with private evidence and verifiable reputation.</p>
      <Button nativeButton={false} render={<Link to="/create" />}>Create Agreement</Button>
      <p role="status">
        API Status:{" "}
        {health.isError
          ? "Disconnected"
          : health.isPending
            ? "Checking…"
            : "Connected"}
      </p>
    </main>
  )
}

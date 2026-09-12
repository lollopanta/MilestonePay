import { useQuery } from "@tanstack/react-query"

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
      <h1 className="text-4xl font-semibold tracking-tight">MilestonePay</h1>
      <p className="text-muted-foreground">Trustless milestone-based escrow</p>
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

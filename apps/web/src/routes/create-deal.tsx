import { EscrowFactoryAbi } from "@milestonepay/contracts"
import { useState } from "react"
import { Link, useNavigate } from "react-router"
import { decodeEventLog, isAddress, parseUnits } from "viem"
import { useAccount } from "wagmi"
import { waitForTransactionReceipt } from "wagmi/actions"
import { avalancheFuji } from "wagmi/chains"

import { Button } from "@/components/ui/button"
import { WalletButton } from "@/components/wallet-button"
import { wagmiConfig } from "@/web3/config"
import { contracts, tokenDecimals } from "@/web3/contracts"

const blankMilestone = ""

function transactionMessage(error: unknown) {
  return error instanceof Error && /rejected|denied|cancelled/i.test(error.message)
    ? "Transaction cancelled"
    : "Transaction failed"
}

export function CreateDeal() {
  const navigate = useNavigate()
  const { address: client, chainId, isConnected } = useAccount()
  const [provider, setProvider] = useState("")
  const [arbiter, setArbiter] = useState("")
  const [milestones, setMilestones] = useState([blankMilestone])
  const [message, setMessage] = useState<string>()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const updateMilestone = (index: number, value: string) =>
    setMilestones((items) => items.map((item, itemIndex) => itemIndex === index ? value : item))

  async function createEscrow() {
    if (!client || !contracts.escrowFactory || !contracts.paymentToken) {
      setMessage("Connect a Fuji wallet and configure the Fuji deployment addresses.")
      return
    }
    if (chainId !== avalancheFuji.id) {
      setMessage("Switch to Avalanche Fuji first.")
      return
    }
    if (!isAddress(provider) || !isAddress(arbiter)) {
      setMessage("Provider and arbiter must be valid wallet addresses.")
      return
    }
    if (provider.toLowerCase() === client.toLowerCase() || arbiter.toLowerCase() === client.toLowerCase() || arbiter.toLowerCase() === provider.toLowerCase()) {
      setMessage("Client, provider, and arbiter must be different wallets.")
      return
    }

    let amounts: bigint[]
    try {
      amounts = milestones.map((amount) => {
        const parsed = parseUnits(amount, tokenDecimals)
        if (parsed <= 0n) throw new Error("invalid amount")
        return parsed
      })
    } catch {
      setMessage("Every milestone must have an amount greater than zero.")
      return
    }

    setIsSubmitting(true)
    setMessage("Confirm in wallet")
    try {
      const { writeContract } = await import("wagmi/actions")
      const hash = await writeContract(wagmiConfig, {
        address: contracts.escrowFactory,
        abi: EscrowFactoryAbi,
        functionName: "createEscrow",
        args: [provider, arbiter, contracts.paymentToken, amounts],
      })
      setMessage("Transaction pending")
      const receipt = await waitForTransactionReceipt(wagmiConfig, { hash })
      const log = receipt.logs.map((item) => {
        try { return decodeEventLog({ abi: EscrowFactoryAbi, data: item.data, topics: item.topics }) } catch { return undefined }
      }).find((item) => item?.eventName === "EscrowCreated")
      const escrow = log?.args.escrow
      if (!escrow) throw new Error("EscrowCreated event missing")
      setMessage("Transaction confirmed")
      navigate(`/deal/${escrow}`)
    } catch (error) {
      console.error(error)
      setMessage(transactionMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return <main className="mx-auto min-h-svh max-w-2xl p-6">
    <header className="mb-10 flex items-center justify-between"><Link to="/" className="text-xl font-semibold">MilestonePay</Link><WalletButton /></header>
    <h1 className="text-3xl font-semibold">Create agreement</h1>
    <p className="mt-2 text-muted-foreground">All values use testnet Mock USDT (6 decimals).</p>
    <div className="mt-8 space-y-5">
      <label className="block text-sm font-medium">Provider wallet<input className="mt-1 w-full rounded-md border bg-background p-2" value={provider} onChange={(event) => setProvider(event.target.value)} placeholder="0x..." /></label>
      <label className="block text-sm font-medium">Arbiter wallet<input className="mt-1 w-full rounded-md border bg-background p-2" value={arbiter} onChange={(event) => setArbiter(event.target.value)} placeholder="0x..." /></label>
      <div><p className="text-sm font-medium">Milestones</p>{milestones.map((amount, index) => <div key={index} className="mt-2 flex gap-2"><input className="w-full rounded-md border bg-background p-2" inputMode="decimal" value={amount} onChange={(event) => updateMilestone(index, event.target.value)} placeholder={`Milestone ${index + 1} amount in USDT`} />{milestones.length > 1 && <Button variant="outline" onClick={() => setMilestones((items) => items.filter((_, itemIndex) => itemIndex !== index))}>Remove</Button>}</div>)}<Button className="mt-3" variant="outline" onClick={() => setMilestones((items) => [...items, blankMilestone])}>Add milestone</Button></div>
      <Button onClick={createEscrow} disabled={!isConnected || isSubmitting}>{isSubmitting ? "Creating…" : "Create agreement"}</Button>
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    </div>
  </main>
}

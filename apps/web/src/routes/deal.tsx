import { MilestoneEscrowAbi, MockUSDTAbi } from "@milestonepay/contracts"
import { Link, useParams } from "react-router"
import { isAddress, type Address } from "viem"
import { useAccount } from "wagmi"
import {
  readContract,
  waitForTransactionReceipt,
  writeContract,
} from "wagmi/actions"
import { avalancheFuji } from "wagmi/chains"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { WalletButton } from "@/components/wallet-button"
import { useApproveMilestone } from "@/hooks/use-approve-milestone"
import { useEscrow } from "@/hooks/use-escrow"
import { useSubmitMilestone } from "@/hooks/use-submit-milestone"
import {
  canApproveMilestone,
  canSubmitMilestone,
  formatUsdt,
  progressPercentage,
  sameAddress,
} from "@/lib/deal"
import { wagmiConfig } from "@/web3/config"
import { contracts } from "@/web3/contracts"

const statusLabels = [
  "Awaiting funding",
  "Active",
  "Disputed",
  "Completed",
  "Cancelled",
]
const milestoneLabels = [
  "Pending",
  "Submitted",
  "Disputed",
  "Approved",
  "Resolved",
]
const demoMintAmount = 10_000n * 10n ** 6n
const emptyEvidenceHash = `0x${"0".repeat(64)}`
const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`

function errorMessage(error: unknown) {
  return error instanceof Error &&
    /rejected|denied|cancelled/i.test(error.message)
    ? "Transaction cancelled"
    : "Transaction failed"
}

export function Deal() {
  const { address: routeAddress } = useParams()
  const escrowAddress =
    routeAddress && isAddress(routeAddress)
      ? (routeAddress as Address)
      : undefined
  const escrow = useEscrow(escrowAddress)
  const { address: wallet, chainId } = useAccount()
  const [message, setMessage] = useState<string>()
  const [evidenceNote, setEvidenceNote] = useState("")
  const [isWorking, setIsWorking] = useState(false)
  const submitMilestone = useSubmitMilestone(escrow.refetch)
  const approveMilestone = useApproveMilestone(escrow.refetch)

  async function mintTestUsdt() {
    if (!wallet || !contracts.paymentToken || chainId !== avalancheFuji.id)
      return
    setIsWorking(true)
    setMessage("Waiting for wallet")
    try {
      const hash = await writeContract(wagmiConfig, {
        address: contracts.paymentToken,
        abi: MockUSDTAbi,
        functionName: "mint",
        args: [wallet, demoMintAmount],
      })
      setMessage("Minting test USDT")
      await waitForTransactionReceipt(wagmiConfig, { hash })
      await escrow.refetch()
      setMessage("Test USDT received")
    } catch (error) {
      console.error(error)
      setMessage(errorMessage(error))
    } finally {
      setIsWorking(false)
    }
  }

  async function fund() {
    const data = escrow.data
    if (!wallet || !escrowAddress || !data || !sameAddress(wallet, data.client))
      return
    setIsWorking(true)
    try {
      const allowance = await readContract(wagmiConfig, {
        address: data.paymentToken,
        abi: MockUSDTAbi,
        functionName: "allowance",
        args: [wallet, escrowAddress],
      })
      if (allowance < data.totalAmount) {
        setMessage("Approving USDT")
        const approvalHash = await writeContract(wagmiConfig, {
          address: data.paymentToken,
          abi: MockUSDTAbi,
          functionName: "approve",
          args: [escrowAddress, data.totalAmount],
        })
        await waitForTransactionReceipt(wagmiConfig, { hash: approvalHash })
        setMessage("Approval confirmed")
      }
      setMessage("Funding agreement")
      const fundHash = await writeContract(wagmiConfig, {
        address: escrowAddress,
        abi: MilestoneEscrowAbi,
        functionName: "fund",
      })
      await waitForTransactionReceipt(wagmiConfig, { hash: fundHash })
      await escrow.refetch()
      setMessage("Funding confirmed")
    } catch (error) {
      console.error(error)
      setMessage(errorMessage(error))
    } finally {
      setIsWorking(false)
    }
  }

  if (!escrowAddress)
    return <main className="p-6">Invalid escrow address.</main>
  if (escrow.isPending) return <main className="p-6">Loading agreement…</main>
  if (escrow.isError || !escrow.data)
    return <main className="p-6">Agreement unavailable on Avalanche Fuji.</main>

  const data = escrow.data
  const current = data.milestones[Number(data.currentMilestone)]
  const completedMilestones = data.milestones.filter(
    (milestone) => milestone.status === 3 || milestone.status === 4
  ).length
  const percentage = progressPercentage(data.totalReleased, data.totalAmount)
  const canMint =
    chainId === avalancheFuji.id &&
    contracts.paymentToken?.toLowerCase() === data.paymentToken.toLowerCase() &&
    data.status === 0
  const canFund =
    sameAddress(wallet, data.client) &&
    data.status === 0 &&
    chainId === avalancheFuji.id
  const canSubmit = Boolean(
    current &&
    canSubmitMilestone(wallet, data.provider, data.status, current.status)
  )
  const canApprove = Boolean(
    current &&
    canApproveMilestone(wallet, data.client, data.status, current.status)
  )
  const actionMessage =
    submitMilestone.message ?? approveMilestone.message ?? message
  const actionsPending =
    isWorking || submitMilestone.isPending || approveMilestone.isPending

  return (
    <main className="mx-auto min-h-svh max-w-2xl p-6">
      <header className="mb-10 flex items-center justify-between">
        <Link to="/" className="text-xl font-semibold">
          MilestonePay
        </Link>
        <WalletButton />
      </header>
      <h1 className="text-3xl font-semibold">Agreement</h1>
      {data.status === 3 ? (
        <p className="mt-2 font-medium">Agreement completed</p>
      ) : (
        <p className="mt-2 text-muted-foreground">
          Deal status: {statusLabels[data.status] ?? "Unknown"}
        </p>
      )}

      <section className="mt-8 grid gap-3 rounded-lg border p-5 sm:grid-cols-3">
        <div>
          <p className="text-sm text-muted-foreground">Total agreement</p>
          <p>{formatUsdt(data.totalAmount)}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Released</p>
          <p>{formatUsdt(data.totalReleased)}</p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Locked</p>
          <p>{formatUsdt(data.locked)}</p>
        </div>
      </section>
      <section className="mt-5 rounded-lg border p-5">
        <h2 className="font-semibold">Agreement progress</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {completedMilestones} / {data.milestones.length} milestones completed
        </p>
        <div className="mt-3 flex items-center gap-3">
          <progress
            className="w-full"
            value={data.totalReleased.toString()}
            max={data.totalAmount.toString()}
          >
            {percentage}%
          </progress>
          <span className="text-sm font-medium">{percentage}%</span>
        </div>
      </section>
      {data.status === 1 && (
        <p className="mt-4 font-medium">
          FUNDS SECURED · {formatUsdt(data.locked)} /{" "}
          {formatUsdt(data.totalAmount)}
        </p>
      )}

      <section className="mt-8 flex flex-col gap-2 text-sm">
        <p>Client: {short(data.client)}</p>
        <p>Provider: {short(data.provider)}</p>
        <p>Provider MockUSDT balance: {formatUsdt(data.providerBalance)}</p>
        <p>Arbiter: {short(data.arbiter)}</p>
        <p>Payment token: {short(data.paymentToken)}</p>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Milestones</h2>
        <div className="mt-3 flex flex-col gap-2">
          {data.milestones.map((milestone, index) => (
            <div key={index} className="rounded-md border p-3">
              <div className="flex justify-between gap-3">
                <span>Milestone #{index + 1}</span>
                <span>{formatUsdt(milestone.amount)}</span>
                <span>{milestoneLabels[milestone.status]}</span>
              </div>
              {milestone.evidenceHash !== emptyEvidenceHash && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Evidence: {short(milestone.evidenceHash)}
                </p>
              )}
              {(milestone.status === 3 || milestone.status === 4) && (
                <p className="mt-2 text-sm text-muted-foreground">
                  Released: {formatUsdt(milestone.amount)}
                </p>
              )}
              {data.status === 1 && BigInt(index) === data.currentMilestone && (
                <p className="mt-2 text-sm font-medium">Current milestone</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {canSubmit && current && (
        <section className="mt-8 rounded-lg border p-5">
          <h2 className="text-xl font-semibold">Current milestone</h2>
          <p className="mt-3">#{Number(data.currentMilestone) + 1}</p>
          <p className="mt-3 text-sm text-muted-foreground">Amount</p>
          <p>{formatUsdt(current.amount)}</p>
          <p className="mt-3 text-sm text-muted-foreground">Status</p>
          <p>Pending</p>
          <label
            className="mt-5 block text-sm font-medium"
            htmlFor="evidence-note"
          >
            Evidence note / deliverable reference
            <textarea
              id="evidence-note"
              className="mt-1 min-h-24 w-full rounded-md border bg-background p-2"
              value={evidenceNote}
              onChange={(event) => setEvidenceNote(event.target.value)}
              placeholder="Website homepage completed"
            />
          </label>
          <Button
            className="mt-4"
            onClick={() => {
              approveMilestone.clearMessage()
              return submitMilestone.submit({
                escrowAddress,
                provider: data.provider,
                milestoneId: data.currentMilestone,
                evidenceNote,
              })
            }}
            disabled={actionsPending || !evidenceNote.trim()}
          >
            {submitMilestone.isPending
              ? "Submitting milestone"
              : "Submit milestone"}
          </Button>
        </section>
      )}

      {canApprove && current && (
        <section className="mt-8 rounded-lg border p-5">
          <h2 className="text-xl font-semibold">Milestone submitted</h2>
          <p className="mt-3 text-sm text-muted-foreground">Amount</p>
          <p>{formatUsdt(current.amount)}</p>
          <p className="mt-3 text-sm text-muted-foreground">Evidence hash</p>
          <p>{short(current.evidenceHash)}</p>
          <Button
            className="mt-4"
            onClick={() => {
              submitMilestone.clearMessage()
              return approveMilestone.approve({
                escrowAddress,
                client: data.client,
                milestoneId: data.currentMilestone,
              })
            }}
            disabled={actionsPending}
          >
            Approve Milestone
          </Button>
        </section>
      )}

      {(canMint || canFund) && (
        <section className="mt-8 flex flex-wrap gap-3">
          {canMint && (
            <Button
              variant="outline"
              onClick={mintTestUsdt}
              disabled={actionsPending}
            >
              Get 10,000 Test USDT
            </Button>
          )}
          {canFund && (
            <Button onClick={fund} disabled={actionsPending}>
              Fund Agreement
            </Button>
          )}
        </section>
      )}
      {actionMessage && (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          {actionMessage}
        </p>
      )}
    </main>
  )
}

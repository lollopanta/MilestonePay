import { MilestoneEscrowAbi, MockUSDTAbi } from "@milestonepay/contracts"
import { useQuery } from "@tanstack/react-query"
import { Link, useParams } from "react-router"
import { useState } from "react"
import { type Address, type Hex, isAddress, zeroAddress } from "viem"
import { useAccount } from "wagmi"
import {
  readContract,
  signMessage,
  waitForTransactionReceipt,
  writeContract,
} from "wagmi/actions"
import { avalancheFuji } from "wagmi/chains"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Input } from "@/components/ui/input"
import { Progress, ProgressLabel } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
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
import { agreementIdentities, bindAgreementIdentity, currentSwarmPublicKey, disputeEvidenceStatus, evidenceDescriptor, getEvidenceClient, getSwarmIdClient, registerDisputeEvidence, registerEvidence } from "@/lib/evidence"
import { decodeMilestoneEvidenceBundle, disputeEvidenceSealMessage, evidenceIdentityMessage, MAX_EVIDENCE_ATTACHMENT_BYTES } from "@milestonepay/evidence"
import { wagmiConfig } from "@/web3/config"
import { contracts } from "@/web3/contracts"
import { ChatPanel } from "@/features/chat/chat-panel"

const dealLabels = [
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
  "Released",
  "Resolved",
]
const demoMintAmount = 10_000n * 10n ** 6n
const emptyEvidenceHash = `0x${"0".repeat(64)}` as Hex

type Dispute = {
  milestoneId: bigint
  openedBy: Address
  clientEvidenceHash: Hex
  providerEvidenceHash: Hex
  resolved: boolean
  providerBps: number
  providerAmount: bigint
  clientRefundAmount: bigint
}
type Transaction = {
  label: string
  state: "confirm" | "pending" | "success" | "error"
}

const short = (value: string) => `${value.slice(0, 6)}…${value.slice(-4)}`
const hasEvidence = (hash: Hex) => hash !== emptyEvidenceHash

function transactionError(error: unknown, action: string) {
  const message = error instanceof Error ? error.message : ""
  if (/rejected|denied|cancelled/i.test(message))
    return "Transaction cancelled."
  if (/chain|network/i.test(message)) return "Switch to Avalanche Fuji first."
  if (/Unauthorized/i.test(message))
    return "This wallet is not allowed to perform this action."
  if (/EvidenceAlreadySubmitted/i.test(message))
    return "Evidence has already been recorded for this party."
  if (/ReviewPeriod/i.test(message))
    return "This action is no longer available in the review period."
  if (/Agreement Swarm identity is already bound/i.test(message))
    return "This role already has a different Swarm identity bound. Reconnect that Swarm ID to continue."
  return `Could not ${action.toLowerCase()}. Check the agreement state and try again.`
}

function DealBadge({ status }: { status: number }) {
  const variant =
    status === 2 || status === 4
      ? "destructive"
      : status === 1 || status === 3
        ? "default"
        : "secondary"
  return <Badge variant={variant}>{dealLabels[status] ?? "Unknown"}</Badge>
}

function MilestoneBadge({ status }: { status: number }) {
  const variant =
    status === 2
      ? "destructive"
      : status === 1 || status === 3 || status === 4
        ? "default"
        : "secondary"
  return <Badge variant={variant}>{milestoneLabels[status] ?? "Unknown"}</Badge>
}

function DealLoading() {
  return (
    <main className="mx-auto flex min-h-svh max-w-6xl flex-col gap-6 p-6 lg:p-8">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-36 w-full" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    </main>
  )
}

export function Deal() {
  const { address: routeAddress } = useParams()
  const escrowAddress =
    routeAddress && isAddress(routeAddress)
      ? (routeAddress as Address)
      : undefined
  const escrow = useEscrow(escrowAddress)
  const { address: wallet, chainId } = useAccount()
  const [deliverableNote, setDeliverableNote] = useState("")
  const [deliveryFiles, setDeliveryFiles] = useState<File[]>([])
  const [disputeNote, setDisputeNote] = useState("")
  const [responseNote, setResponseNote] = useState("")
  const [providerShare, setProviderShare] = useState("70")
  const [terminateAgreement, setTerminateAgreement] = useState(false)
  const [transaction, setTransaction] = useState<Transaction>()
  const disputedMilestoneIds =
    escrow.data?.milestones
      .map((milestone, index) => ({ milestone, index }))
      .filter(
        ({ milestone }) => milestone.status === 2 || milestone.status === 4
      )
      .map(({ index }) => BigInt(index)) ?? []
  const disputes = useQuery({
    queryKey: [
      "escrow-disputes",
      escrowAddress,
      disputedMilestoneIds.map(String).join(","),
    ],
    enabled: Boolean(escrowAddress && disputedMilestoneIds.length),
    queryFn: async (): Promise<Dispute[]> =>
      Promise.all(
        disputedMilestoneIds.map(async (milestoneId) => {
          const result = await readContract(wagmiConfig, {
            address: escrowAddress as Address,
            abi: MilestoneEscrowAbi,
            functionName: "getDispute",
            args: [milestoneId],
          })
          return {
            milestoneId,
            openedBy: result.openedBy,
            clientEvidenceHash: result.clientEvidenceHash,
            providerEvidenceHash: result.providerEvidenceHash,
            resolved: result.resolved,
            providerBps: Number(result.providerBps),
            providerAmount: result.providerAmount,
            clientRefundAmount: result.clientRefundAmount,
          }
        })
      ),
  })
  const cancellation = useQuery({
    queryKey: [
      "escrow-cancellation",
      escrowAddress,
      escrow.data?.status,
      escrow.data?.currentMilestone?.toString(),
    ],
    enabled: Boolean(escrowAddress && escrow.data?.status === 1),
    queryFn: () =>
      readContract(wagmiConfig, {
        address: escrowAddress as Address,
        abi: MilestoneEscrowAbi,
        functionName: "cancellationRequester",
      }),
  })
  const evidenceReadiness = useQuery({
    queryKey: ["dispute-evidence", escrowAddress, escrow.data?.status, escrow.data?.currentMilestone?.toString()],
    enabled: Boolean(escrowAddress && escrow.data?.status === 2),
    queryFn: () => disputeEvidenceStatus(escrowAddress as Address, escrow.data!.currentMilestone),
  })

  async function refresh() {
    await Promise.all([
      escrow.refetch(),
      disputes.refetch(),
      cancellation.refetch(),
      evidenceReadiness.refetch(),
    ])
  }
  const submitMilestone = useSubmitMilestone(refresh)
  const approveMilestone = useApproveMilestone(refresh)
  async function runTransaction(label: string, request: () => Promise<Hex>) {
    setTransaction({ label, state: "confirm" })
    try {
      const hash = await request()
      setTransaction({ label, state: "pending" })
      await waitForTransactionReceipt(wagmiConfig, { hash })
      await refresh()
      setTransaction({ label, state: "success" })
      return true
    } catch (error) {
      console.error(error)
      setTransaction({ label: transactionError(error, label), state: "error" })
      return false
    }
  }
  async function openDispute() {
    const data = escrow.data
    const current = data?.milestones[Number(data.currentMilestone)]
    if (!wallet || !data || !current || !escrowAddress) return
    if (!disputeNote.trim()) return
    setTransaction({ label: "Protecting dispute evidence with Swarm", state: "confirm" })
    try {
      const identities = await agreementIdentities(escrowAddress)
      const { descriptor, evidenceHash } = await (await getEvidenceClient()).uploadEvidence(new TextEncoder().encode(disputeNote), { kind: sameAddress(wallet, data.client) ? "dispute-client" : "dispute-provider", chainId: avalancheFuji.id, escrow: escrowAddress, milestoneId: Number(data.currentMilestone), createdAt: Math.floor(Date.now() / 1_000), grantees: [identities.client.binding.identity] })
      if (await runTransaction("Dispute opened; evidence sealing is pending", () => writeContract(wagmiConfig, { address: escrowAddress, abi: MilestoneEscrowAbi, functionName: "openDispute", args: [data.currentMilestone, evidenceHash] }))) await registerEvidence(descriptor)
    } catch (error) { setTransaction({ label: transactionError(error, "protect dispute evidence"), state: "error" }) }
  }
  async function downloadDelivery() {
    const current = escrow.data?.milestones[Number(escrow.data.currentMilestone)]
    if (!current || !hasEvidence(current.evidenceHash)) return
    setTransaction({ label: "Downloading private delivery", state: "pending" })
    try {
      const source = await evidenceDescriptor(current.evidenceHash)
      const bundle = await decodeMilestoneEvidenceBundle(await (await getEvidenceClient()).downloadEvidence(source.descriptor))
      for (const attachment of bundle.attachments) {
        const url = URL.createObjectURL(new Blob([attachment.bytes.slice().buffer], { type: attachment.type || "application/octet-stream" }))
        const link = document.createElement("a"); link.href = url; link.download = attachment.name; link.click(); URL.revokeObjectURL(url)
      }
      setTransaction({ label: bundle.note ? `Private delivery: ${bundle.note}` : "Private delivery downloaded", state: "success" })
    } catch (error) { setTransaction({ label: transactionError(error, "download private delivery"), state: "error" }) }
  }
  async function bindProviderIdentity() {
    const provider = escrow.data?.provider
    if (!wallet || !escrowAddress || !provider || !sameAddress(wallet, provider)) return
    const providerWallet = wallet as Address
    try {
      const swarm = await getSwarmIdClient()
      if (!(await swarm.checkAuthStatus()).authenticated) {
        await swarm.connect({ popupMode: "popup" })
        setTransaction({ label: "Finish signing in with Swarm ID in the popup, then connect your private identity again.", state: "confirm" })
        return
      }
      const swarmPublicKey = currentSwarmPublicKey(swarm)
      const signature = await signMessage(wagmiConfig, { message: evidenceIdentityMessage(providerWallet, swarmPublicKey, avalancheFuji.id) })
      await bindAgreementIdentity({ version: 1, chainId: avalancheFuji.id, escrow: escrowAddress, role: "provider", identity: { wallet: providerWallet, swarmPublicKey, signature } })
      setTransaction({ label: "Provider private identity connected", state: "success" })
    } catch (error) { setTransaction({ label: transactionError(error, "connect private identity"), state: "error" }) }
  }
  async function repairCurrentIdentity() {
    const data = escrow.data
    if (!wallet || !data || !escrowAddress) return
    const role = sameAddress(wallet, data.client) ? "client" : sameAddress(wallet, data.provider) ? "provider" : sameAddress(wallet, data.arbiter) ? "arbiter" : undefined
    if (!role) return setTransaction({ label: "Only an agreement participant can register a private identity", state: "error" })
    try {
      const swarm = await getSwarmIdClient()
      if (!(await swarm.checkAuthStatus()).authenticated) {
        await swarm.connect({ popupMode: "popup" })
        setTransaction({ label: "Finish signing in with Swarm ID in the popup, then register your identity again.", state: "confirm" })
        return
      }
      const swarmPublicKey = currentSwarmPublicKey(swarm)
      const signature = await signMessage(wagmiConfig, { message: evidenceIdentityMessage(wallet, swarmPublicKey, avalancheFuji.id) })
      await bindAgreementIdentity({ version: 1, chainId: avalancheFuji.id, escrow: escrowAddress, role, identity: { wallet, swarmPublicKey, signature } })
      setTransaction({ label: `${role[0].toUpperCase()}${role.slice(1)} private identity registered`, state: "success" })
    } catch (error) { setTransaction({ label: transactionError(error, "register private identity"), state: "error" }) }
  }
  async function submitAdditionalDisputeEvidence() {
    const data = escrow.data
    if (!wallet || !data || !escrowAddress || !responseNote.trim()) return
    try {
      const identities = await agreementIdentities(escrowAddress)
      const kind = sameAddress(wallet, data.client) ? "dispute-client" as const : "dispute-provider" as const
      const { descriptor, evidenceHash } = await (await getEvidenceClient()).uploadEvidence(new TextEncoder().encode(responseNote), { kind, chainId: avalancheFuji.id, escrow: escrowAddress, milestoneId: Number(data.currentMilestone), createdAt: Math.floor(Date.now() / 1_000), grantees: [identities.client.binding.identity] })
      if (await runTransaction("Dispute evidence submitted", () => writeContract(wagmiConfig, { address: escrowAddress, abi: MilestoneEscrowAbi, functionName: "submitDisputeEvidence", args: [data.currentMilestone, evidenceHash] }))) await registerEvidence(descriptor)
    } catch (error) { setTransaction({ label: transactionError(error, "protect dispute evidence"), state: "error" }) }
  }
  async function sealMilestoneEvidence() {
    const data = escrow.data
    const current = data?.milestones[Number(data.currentMilestone)]
    if (!wallet || !data || !current || !escrowAddress || !sameAddress(wallet, data.provider)) return
    setTransaction({ label: "Granting the bound arbiter Swarm ACT access", state: "confirm" })
    try {
      const [identities, source] = await Promise.all([agreementIdentities(escrowAddress), evidenceDescriptor(current.evidenceHash)])
      const arbiter = identities.arbiter.binding.identity.swarmPublicKey
      const updated = await (await getEvidenceClient()).addGrantees(source.descriptor, [arbiter])
      const snapshot = {
        version: 1 as const,
        kind: "dispute-provider" as const,
        chainId: avalancheFuji.id,
        escrow: escrowAddress,
        milestoneId: Number(data.currentMilestone),
        sourceEvidenceHash: source.evidenceHash,
        act: { ...source.descriptor.act, historyReference: updated.historyReference, actReference: updated.actReference },
        arbiterIdentityCommitment: identities.arbiter.commitment,
      }
      const signature = await signMessage(wagmiConfig, { message: disputeEvidenceSealMessage(snapshot) })
      await registerDisputeEvidence({ version: 1, snapshot, publisher: wallet, signature })
      await refresh()
      setTransaction({ label: "Dispute evidence sealed for the bound arbiter", state: "success" })
    } catch (error) {
      console.error(error)
      setTransaction({ label: transactionError(error, "seal dispute evidence"), state: "error" })
    }
  }
  async function mintTestUsdt() {
    if (!wallet || !contracts.paymentToken || chainId !== avalancheFuji.id)
      return
    await runTransaction("Test USDT received", () =>
      writeContract(wagmiConfig, {
        address: contracts.paymentToken,
        abi: MockUSDTAbi,
        functionName: "mint",
        args: [wallet, demoMintAmount],
      })
    )
  }
  async function fund() {
    const data = escrow.data
    if (!wallet || !escrowAddress || !data || !sameAddress(wallet, data.client))
      return
    setTransaction({ label: "Fund agreement", state: "confirm" })
    try {
      const allowance = await readContract(wagmiConfig, {
        address: data.paymentToken,
        abi: MockUSDTAbi,
        functionName: "allowance",
        args: [wallet, escrowAddress],
      })
      if (allowance < data.totalAmount) {
        const approvalHash = await writeContract(wagmiConfig, {
          address: data.paymentToken,
          abi: MockUSDTAbi,
          functionName: "approve",
          args: [escrowAddress, data.totalAmount],
        })
        setTransaction({ label: "USDT approval", state: "pending" })
        await waitForTransactionReceipt(wagmiConfig, { hash: approvalHash })
      }
      const hash = await writeContract(wagmiConfig, {
        address: escrowAddress,
        abi: MilestoneEscrowAbi,
        functionName: "fund",
      })
      setTransaction({ label: "Fund agreement", state: "pending" })
      await waitForTransactionReceipt(wagmiConfig, { hash })
      await refresh()
      setTransaction({ label: "Funds secured in escrow", state: "success" })
    } catch (error) {
      console.error(error)
      setTransaction({
        label: transactionError(error, "Fund agreement"),
        state: "error",
      })
    }
  }

  if (!escrowAddress)
    return (
      <main className="mx-auto flex min-h-svh max-w-xl items-center p-6">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Invalid agreement address</EmptyTitle>
            <EmptyDescription>
              Open an agreement using its full escrow address.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </main>
    )
  if (escrow.isPending) return <DealLoading />
  if (escrow.isError || !escrow.data)
    return (
      <main className="mx-auto flex min-h-svh max-w-xl items-center p-6">
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Agreement unavailable</EmptyTitle>
            <EmptyDescription>
              Check the address and confirm that your wallet is on Avalanche
              Fuji.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </main>
    )

  const data = escrow.data
  const current = data.milestones[Number(data.currentMilestone)]
  const currentDispute = disputes.data?.find(
    (dispute) => dispute.milestoneId === data.currentMilestone
  )
  const completedMilestones = data.milestones.filter(
    (milestone) => milestone.status === 3 || milestone.status === 4
  ).length
  const percentage = Number(
    progressPercentage(data.totalReleased, data.totalAmount)
  )
  const isParticipant =
    sameAddress(wallet, data.client) || sameAddress(wallet, data.provider)
  const isArbiter = sameAddress(wallet, data.arbiter)
  const activeRole = sameAddress(wallet, data.client)
    ? "Client"
    : sameAddress(wallet, data.provider)
      ? "Provider"
      : isArbiter
        ? "Arbiter"
        : "Observer"
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
  const canOpenDispute = Boolean(
    current &&
    isParticipant &&
    data.status === 1 &&
    (current.status === 0 || current.status === 1)
  )
  const canRequestCancellation = Boolean(
    current &&
    isParticipant &&
    data.status === 1 &&
    current.status === 0 &&
    cancellation.data === zeroAddress
  )
  const canAcceptCancellation = Boolean(
    current &&
    isParticipant &&
    data.status === 1 &&
    current.status === 0 &&
    cancellation.data &&
    cancellation.data !== zeroAddress &&
    !sameAddress(wallet, cancellation.data)
  )
  const canSubmitDisputeEvidence = Boolean(
    currentDispute &&
    data.status === 2 &&
    isParticipant &&
    ((sameAddress(wallet, data.client) &&
      !hasEvidence(currentDispute.clientEvidenceHash)) ||
      (sameAddress(wallet, data.provider) &&
        !hasEvidence(currentDispute.providerEvidenceHash)))
  )
  const canSealMilestoneEvidence = Boolean(
    current &&
    current.status === 2 &&
    data.status === 2 &&
    sameAddress(wallet, data.provider) &&
    hasEvidence(current.evidenceHash) &&
    !evidenceReadiness.data?.arbitrationReady
  )
  const arbitrationReady = Boolean(evidenceReadiness.data?.arbitrationReady)
  const share = Math.max(0, Math.min(100, Number(providerShare) || 0))
  const providerPayout = current
    ? (current.amount * BigInt(Math.round(share * 100))) / 10_000n
    : 0n
  const clientPayout = current ? current.amount - providerPayout : 0n
  const actionMessage = submitMilestone.message ?? approveMilestone.message
  const actionPending =
    submitMilestone.isPending ||
    approveMilestone.isPending ||
    transaction?.state === "confirm" ||
    transaction?.state === "pending"

  return (
    <main className="mx-auto min-h-svh max-w-6xl p-6 lg:p-8">
      <header className="mb-8 flex items-center justify-between gap-4">
        <Link
          to="/"
          className="font-heading text-lg font-semibold tracking-tight"
        >
          MilestonePay
        </Link>
        <WalletButton />
      </header>
      <section className="flex flex-col gap-5 border-b pb-8 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-muted-foreground">Agreement</p>
            <DealBadge status={data.status} />
            <Badge variant="outline">Viewing as {activeRole}</Badge>
          </div>
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Escrow agreement
          </h1>
          <p className="font-mono text-sm text-muted-foreground">
            {escrowAddress}
          </p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3 md:min-w-64">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Funds secured in escrow
          </p>
          <p className="mt-1 font-heading text-2xl font-semibold tabular-nums">
            {formatUsdt(data.locked)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            of {formatUsdt(data.totalAmount)} agreement value
          </p>
        </div>
      </section>
      {(transaction || actionMessage) && (
        <Alert
          className="mt-6"
          variant={transaction?.state === "error" ? "destructive" : "default"}
        >
          <AlertTitle>
            {transaction?.state === "confirm"
              ? "Confirm in wallet"
              : transaction?.state === "pending"
                ? "Transaction pending"
                : transaction?.state === "success"
                  ? "Transaction confirmed"
                  : transaction?.state === "error"
                    ? "Action needed"
                    : "Agreement update"}
          </AlertTitle>
          <AlertDescription>
            {transaction?.label ?? actionMessage}
          </AlertDescription>
        </Alert>
      )}
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Milestone progress</CardTitle>
              <CardDescription>
                {completedMilestones} of {data.milestones.length} milestones
                settled
              </CardDescription>
              <CardAction>
                <span className="text-sm font-medium tabular-nums">
                  {percentage}%
                </span>
              </CardAction>
            </CardHeader>
            <CardContent>
              <Progress value={percentage}>
                <ProgressLabel>Released</ProgressLabel>
                <span className="ml-auto text-sm text-muted-foreground tabular-nums">
                  {formatUsdt(data.totalReleased)}
                </span>
              </Progress>
              <p className="text-sm text-muted-foreground">
                {formatUsdt(
                  data.totalAmount - data.totalReleased - data.locked
                )}{" "}
                released or refunded outside escrow
              </p>
            </CardContent>
          </Card>
          <section
            aria-labelledby="milestones-title"
            className="flex flex-col gap-3"
          >
            <div>
              <h2
                id="milestones-title"
                className="font-heading text-xl font-semibold"
              >
                Milestones
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                The current milestone is the only one that can move.
              </p>
            </div>
            {data.milestones.map((milestone, index) => {
              const isCurrent = BigInt(index) === data.currentMilestone
              const dispute = disputes.data?.find(
                (item) => item.milestoneId === BigInt(index)
              )
              return (
                <Card key={index} size="sm">
                  <CardHeader>
                    <CardTitle>
                      Milestone {index + 1}
                      {isCurrent ? (
                        <span className="ml-2 text-sm font-normal text-muted-foreground">
                          Current
                        </span>
                      ) : null}
                    </CardTitle>
                    <CardDescription>
                      {milestone.status === 0
                        ? "Waiting to begin"
                        : milestone.status === 1
                          ? "Submitted for review"
                          : milestone.status === 2
                            ? "Resolution in progress"
                            : "Settlement recorded"}
                    </CardDescription>
                    <CardAction>
                      <MilestoneBadge status={milestone.status} />
                    </CardAction>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-sm text-muted-foreground">
                        Escrowed amount
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatUsdt(milestone.amount)}
                      </span>
                    </div>
                    {hasEvidence(milestone.evidenceHash) && (
                      <p className="font-mono text-xs text-muted-foreground">
                        Deliverable commitment: {short(milestone.evidenceHash)}
                      </p>
                    )}
                    {dispute?.resolved && (
                      <Resolution dispute={dispute} dealStatus={data.status} />
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </section>
          {data.status === 2 && current && (
            <Card>
              <CardHeader>
                <CardTitle>
                  Dispute: Milestone {Number(data.currentMilestone) + 1}
                </CardTitle>
                <CardDescription>
                  Evidence is committed on-chain as hashes. The arbiter can
                  settle only this current milestone.
                </CardDescription>
                <CardAction>
                  <Badge variant="destructive">Under review</Badge>
                </CardAction>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-sm text-muted-foreground">
                    Amount in dispute
                  </span>
                  <span className="font-medium tabular-nums">
                    {formatUsdt(current.amount)}
                  </span>
                </div>
                {disputes.isPending ? (
                  <Skeleton className="h-24 w-full" />
                ) : currentDispute ? (
                  <DisputeEvidence
                    dispute={currentDispute}
                    client={data.client}
                    provider={data.provider}
                  />
                ) : (
                  <Alert variant="destructive">
                    <AlertTitle>Dispute details unavailable</AlertTitle>
                    <AlertDescription>
                      Refresh the agreement before resolving it.
                    </AlertDescription>
                  </Alert>
                )}
                <div className="mt-4 rounded-lg border p-3 text-sm">
                  <p className="font-medium">Evidence for arbitration</p>
                  <p className="mt-1 text-muted-foreground">
                    {arbitrationReady
                      ? "SEALED — the bound arbiter has Swarm ACT access."
                      : "PENDING — the evidence publisher must grant the bound arbiter access."}
                  </p>
                  {canSealMilestoneEvidence && (
                    <Button className="mt-3" disabled={actionPending} onClick={sealMilestoneEvidence}>
                      Seal provider evidence for arbitration
                    </Button>
                  )}
                </div>
                {canSubmitDisputeEvidence && (
                  <div className="flex flex-col gap-3">
                    <label
                      htmlFor="dispute-response"
                      className="text-sm font-medium"
                    >
                      Additional evidence
                    </label>
                    <Textarea
                      id="dispute-response"
                      value={responseNote}
                      onChange={(event) => setResponseNote(event.target.value)}
                      placeholder="Add a concise evidence reference"
                    />
                    <Button
                      disabled={actionPending || !responseNote.trim()}
                      onClick={submitAdditionalDisputeEvidence}
                    >
                      Submit evidence
                    </Button>
                  </div>
                )}
                {isArbiter && currentDispute && (
                  <div className="flex flex-col gap-4 rounded-lg border bg-muted/30 p-4">
                    <div>
                      <p className="font-medium">Propose a settlement</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Set the provider share. The remainder is refunded to the
                        client.
                      </p>
                    </div>
                    <label
                      htmlFor="provider-share"
                      className="flex flex-col gap-2 text-sm font-medium"
                    >
                      Provider share (%)
                      <Input
                        id="provider-share"
                        type="number"
                        min="0"
                        max="100"
                        inputMode="decimal"
                        value={providerShare}
                        onChange={(event) =>
                          setProviderShare(event.target.value)
                        }
                      />
                    </label>
                    <PayoutPreview
                      providerAmount={providerPayout}
                      clientAmount={clientPayout}
                      providerShare={share}
                    />
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={terminateAgreement}
                        onChange={(event) =>
                          setTerminateAgreement(event.target.checked)
                        }
                      />
                      Terminate agreement and refund all remaining milestones
                    </label>
                    <Button
                      disabled={
                        actionPending || !arbitrationReady ||
                        Number.isNaN(Number(providerShare)) ||
                        Number(providerShare) < 0 ||
                        Number(providerShare) > 100
                      }
                      onClick={() =>
                        runTransaction("Dispute resolved", () =>
                          writeContract(wagmiConfig, {
                            address: escrowAddress,
                            abi: MilestoneEscrowAbi,
                            functionName: "resolveDispute",
                            args: [
                              data.currentMilestone,
                              Math.round(share * 100),
                              terminateAgreement,
                            ],
                          })
                        )
                      }
                    >
                      Resolve dispute
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          {current && data.status === 1 && (
            <Card>
              <CardHeader>
                <CardTitle>Current milestone actions</CardTitle>
                <CardDescription>
                  Actions are available only to the role authorized by the
                  agreement.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {canSubmit && (
                  <div className="flex flex-col gap-3">
                    <label
                      htmlFor="deliverable-note"
                      className="text-sm font-medium"
                    >
                      Deliverable reference
                    </label>
                    <Textarea
                      id="deliverable-note"
                      value={deliverableNote}
                      onChange={(event) =>
                        setDeliverableNote(event.target.value)
                      }
                      placeholder="Describe the delivered work or attach its reference"
                    />
                    <Input
                      type="file"
                      multiple
                      onChange={(event) => setDeliveryFiles(Array.from(event.target.files ?? []))}
                      aria-label="Private delivery files"
                    />
                    <p className="text-xs text-muted-foreground">
                      Private via Swarm ACT. Up to {MAX_EVIDENCE_ATTACHMENT_BYTES / 1024 / 1024} MB per file.
                      {deliveryFiles.length ? ` ${deliveryFiles.map((file) => `${file.name} (${Math.ceil(file.size / 1024)} KB)`).join(", ")}` : ""}
                    </p>
                    <Button
                      disabled={actionPending || (!deliverableNote.trim() && !deliveryFiles.length)}
                      onClick={() => {
                        approveMilestone.clearMessage()
                        return submitMilestone.submit({
                          escrowAddress,
                          provider: data.provider,
                          milestoneId: data.currentMilestone,
                          evidenceNote: deliverableNote,
                          attachments: deliveryFiles,
                        })
                      }}
                    >
                      {submitMilestone.isPending
                        ? "Submitting milestone"
                        : "Submit milestone"}
                    </Button>
                  </div>
                )}
                {canApprove && (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm text-muted-foreground">
                      The provider submitted a deliverable commitment:{" "}
                      <span className="font-mono">
                        {short(current.evidenceHash)}
                      </span>
                    </p>
                    <Button variant="outline" disabled={actionPending} onClick={downloadDelivery}>
                      Download private delivery
                    </Button>
                    <Button
                      disabled={actionPending}
                      onClick={() => {
                        submitMilestone.clearMessage()
                        return approveMilestone.approve({
                          escrowAddress,
                          client: data.client,
                          milestoneId: data.currentMilestone,
                        })
                      }}
                    >
                      {approveMilestone.isPending
                        ? "Approving milestone"
                        : "Approve and release funds"}
                    </Button>
                  </div>
                )}
                {canOpenDispute && (
                  <div className="flex flex-col gap-3">
                    <Separator />
                    <p className="text-sm font-medium">Open a dispute</p>
                    <Textarea id="dispute-note" value={disputeNote} onChange={(event) => setDisputeNote(event.target.value)} placeholder="Add a private dispute reason or reference; only its commitment is sent on-chain" />
                    <Button
                      variant="destructive"
                      disabled={actionPending || !disputeNote.trim()}
                      onClick={openDispute}
                    >
                      Open dispute
                    </Button>
                  </div>
                )}
                {!canSubmit && !canApprove && !canOpenDispute && (
                  <p className="text-sm text-muted-foreground">
                    Connect as the client or provider to take the next eligible
                    action.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
        <aside className="flex flex-col gap-6">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Escrow summary</CardTitle>
            </CardHeader>
            <CardContent>
              <SummaryRow
                label="Agreement value"
                value={formatUsdt(data.totalAmount)}
              />
              <SummaryRow
                label="Released"
                value={formatUsdt(data.totalReleased)}
              />
              <SummaryRow
                label="Held in escrow"
                value={formatUsdt(data.locked)}
              />
              <SummaryRow label="Asset" value="Mock USDT" />
            </CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Parties</CardTitle>
              <CardDescription>
                Addresses are fixed when the agreement is created.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AddressRow label="Client" address={data.client} />
              <AddressRow label="Provider" address={data.provider} />
              <AddressRow label="Arbiter" address={data.arbiter} />
            </CardContent>
          </Card>
          {import.meta.env.DEV && (isParticipant || isArbiter) ? (
            <Card size="sm">
              <CardHeader><CardTitle>Debug: repair private identity</CardTitle><CardDescription>Registers the connected participant’s signed Swarm identity in Arkiv. Each role must do this from its own wallet.</CardDescription></CardHeader>
              <CardFooter><Button variant="outline" disabled={actionPending} onClick={repairCurrentIdentity}>Register my identity</Button></CardFooter>
            </Card>
          ) : null}
          {sameAddress(wallet, data.provider) && (
            <Card size="sm">
              <CardHeader><CardTitle>Private communication</CardTitle><CardDescription>Connect your Swarm identity before sending private deliveries or chat.</CardDescription></CardHeader>
              <CardFooter><Button variant="outline" disabled={actionPending} onClick={bindProviderIdentity}>Connect private identity</Button></CardFooter>
            </Card>
          )}
          <Card size="sm">
            <CardHeader><CardTitle>Private chat</CardTitle></CardHeader>
            <CardContent><ChatPanel escrow={escrowAddress} chainId={avalancheFuji.id} wallet={wallet} role={activeRole.toLowerCase() as "client" | "provider" | "arbiter" | "observer"} /></CardContent>
          </Card>
          {data.status === 1 && (
            <Card size="sm">
              <CardHeader>
                <CardTitle>Agreement controls</CardTitle>
                <CardDescription>
                  Cancellation requires both parties while the current milestone
                  is pending.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {canRequestCancellation && (
                  <Button
                    variant="outline"
                    disabled={actionPending}
                    onClick={() =>
                      runTransaction("Cancellation requested", () =>
                        writeContract(wagmiConfig, {
                          address: escrowAddress,
                          abi: MilestoneEscrowAbi,
                          functionName: "requestCancellation",
                        })
                      )
                    }
                  >
                    Request cancellation
                  </Button>
                )}
                {canAcceptCancellation && (
                  <Button
                    variant="outline"
                    disabled={actionPending}
                    onClick={() =>
                      runTransaction("Agreement cancelled", () =>
                        writeContract(wagmiConfig, {
                          address: escrowAddress,
                          abi: MilestoneEscrowAbi,
                          functionName: "acceptCancellation",
                        })
                      )
                    }
                  >
                    Accept cancellation
                  </Button>
                )}
                {!canRequestCancellation && !canAcceptCancellation && (
                  <p className="text-sm text-muted-foreground">
                    No cancellation action is available to this wallet.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
          {(canMint || canFund) && (
            <Card size="sm">
              <CardHeader>
                <CardTitle>Testnet funding</CardTitle>
                <CardDescription>
                  Available only to the client on Avalanche Fuji.
                </CardDescription>
              </CardHeader>
              <CardFooter className="flex flex-wrap gap-2">
                {canMint && (
                  <Button
                    variant="outline"
                    disabled={actionPending}
                    onClick={mintTestUsdt}
                  >
                    Get test USDT
                  </Button>
                )}
                {canFund && (
                  <Button disabled={actionPending} onClick={fund}>
                    Fund agreement
                  </Button>
                )}
              </CardFooter>
            </Card>
          )}
        </aside>
      </div>
    </main>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  )
}
function AddressRow({ label, address }: { label: string; address: Address }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <Link className="font-mono text-sm underline-offset-4 hover:underline" to={`/reputation/${address}`}>{short(address)}</Link>
    </div>
  )
}
function DisputeEvidence({
  dispute,
  client,
  provider,
}: {
  dispute: Dispute
  client: Address
  provider: Address
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Opened by <span className="font-mono">{short(dispute.openedBy)}</span>
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <EvidenceSide
          label="Client"
          address={client}
          evidence={dispute.clientEvidenceHash}
        />
        <EvidenceSide
          label="Provider"
          address={provider}
          evidence={dispute.providerEvidenceHash}
        />
      </div>
    </div>
  )
}
function EvidenceSide({
  label,
  address,
  evidence,
}: {
  label: string
  address: Address
  evidence: Hex
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-1 font-mono text-xs text-muted-foreground">
        {short(address)}
      </p>
      <p className="mt-3 text-sm">
        {hasEvidence(evidence)
          ? "Evidence committed"
          : "Evidence not yet submitted"}
      </p>
      {hasEvidence(evidence) && (
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {short(evidence)}
        </p>
      )}
    </div>
  )
}
function PayoutPreview({
  providerAmount,
  clientAmount,
  providerShare,
}: {
  providerAmount: bigint
  clientAmount: bigint
  providerShare: number
}) {
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-lg border">
      <div className="bg-muted/50 p-4">
        <p className="text-sm text-muted-foreground">Client</p>
        <p className="mt-1 font-heading text-2xl font-semibold tabular-nums">
          {100 - providerShare}%
        </p>
        <p className="mt-2 text-sm font-medium tabular-nums">
          {formatUsdt(clientAmount)}
        </p>
      </div>
      <div className="border-l p-4">
        <p className="text-sm text-muted-foreground">Provider</p>
        <p className="mt-1 font-heading text-2xl font-semibold tabular-nums">
          {providerShare}%
        </p>
        <p className="mt-2 text-sm font-medium tabular-nums">
          {formatUsdt(providerAmount)}
        </p>
      </div>
    </div>
  )
}
function Resolution({
  dispute,
  dealStatus,
}: {
  dispute: Dispute
  dealStatus: number
}) {
  const outcome =
    dealStatus === 4
      ? "Agreement terminated"
      : dealStatus === 3
        ? "Agreement completed"
        : "Agreement continues"
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium">Dispute resolved</p>
        <Badge variant={dealStatus === 4 ? "destructive" : "default"}>
          {outcome}
        </Badge>
      </div>
      <PayoutPreview
        providerAmount={dispute.providerAmount}
        clientAmount={dispute.clientRefundAmount}
        providerShare={dispute.providerBps / 100}
      />
    </div>
  )
}

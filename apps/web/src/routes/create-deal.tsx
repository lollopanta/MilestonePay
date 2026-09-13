import {
  EscrowFactoryAbi,
  MilestoneEscrowAbi,
  MockUSDTAbi,
} from "@milestonepay/contracts"
import {
  RiAddLine,
  RiArrowLeftLine,
  RiCheckLine,
  RiDeleteBinLine,
  RiShieldCheckLine,
  RiWallet3Line,
} from "@remixicon/react"
import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router"
import { decodeEventLog, isAddress, type Address, type Hex } from "viem"
import { useAccount } from "wagmi"
import { signMessage, waitForTransactionReceipt, writeContract } from "wagmi/actions"
import { avalancheFuji } from "wagmi/chains"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { WalletButton } from "@/components/wallet-button"
import {
  allocationFor,
  formatMockUsdt,
} from "@/features/create-deal/allocation"
import { wagmiConfig } from "@/web3/config"
import { contracts } from "@/web3/contracts"
import { arbiterSwarmIdentity, bindAgreementIdentity, currentSwarmPublicKey, getSwarmIdClient } from "@/lib/evidence"
import { evidenceIdentityMessage, verifyEvidenceIdentity } from "@milestonepay/evidence"

const defaultReviewPeriod = 7n * 24n * 60n * 60n
const steps = ["Agreement", "Milestones", "Review"]

type TransactionState =
  | "idle"
  | "wallet-confirmation"
  | "submitting"
  | "pending"
  | "success"
  | "error"

type TransactionStatus = {
  state: TransactionState
  title?: string
  description?: string
}

function transactionError(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (/rejected|denied|cancelled/i.test(message)) {
    return "Transaction cancelled in wallet."
  }
  if (/insufficient funds|insufficient balance/i.test(message)) {
    return "Insufficient Mock USDT to fund this agreement."
  }
  if (/chain|network/i.test(message)) {
    return "Switch to Avalanche Fuji and try again."
  }
  return "Unable to create and fund this agreement. Check the wallet connection and try again."
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`
}

export function CreateDeal() {
  const { address: client, chainId, isConnected } = useAccount()
  const [provider, setProvider] = useState("")
  const [arbiter, setArbiter] = useState("")
  const [verifiedArbiterIdentity, setVerifiedArbiterIdentity] = useState<{ wallet: Address; swarmPublicKey: string; signature: Hex }>()
  const [arbiterIdentityStatus, setArbiterIdentityStatus] = useState<"idle" | "checking" | "verified" | "missing" | "invalid" | "error">("idle")
  const [milestones, setMilestones] = useState([""])
  const [step, setStep] = useState(0)
  const [status, setStatus] = useState<TransactionStatus>({ state: "idle" })
  const [escrowAddress, setEscrowAddress] = useState<Address>()
  const allocation = useMemo(() => allocationFor(milestones), [milestones])
  const allocationError = "error" in allocation ? allocation.error : undefined
  const isWorking = !["idle", "success", "error"].includes(status.state)

  const participantError = useMemo(() => {
    if (!provider || !arbiter) return undefined
    if (!isAddress(provider) || !isAddress(arbiter)) {
      return "Enter valid wallet addresses for both participants."
    }
    if (!client) return "Connect the client wallet before continuing."
    const addresses = [client, provider, arbiter].map((address) =>
      address.toLowerCase()
    )
    if (new Set(addresses).size !== addresses.length) {
      return "Client, provider, and arbiter must be different wallets."
    }
    return undefined
  }, [arbiter, client, provider])

  useEffect(() => {
    let cancelled = false
    void Promise.resolve().then(async () => {
      setVerifiedArbiterIdentity(undefined)
      if (!isAddress(arbiter) || chainId !== avalancheFuji.id) return setArbiterIdentityStatus("idle")
      setArbiterIdentityStatus("checking")
      try {
        const record = await arbiterSwarmIdentity(arbiter as Address, avalancheFuji.id)
        if (cancelled) return
        if (record.chainId !== avalancheFuji.id || record.identity.wallet.toLowerCase() !== arbiter.toLowerCase() || !await verifyEvidenceIdentity(record.identity, avalancheFuji.id)) throw new Error("Invalid registered arbiter identity")
        setVerifiedArbiterIdentity(record.identity)
        setArbiterIdentityStatus("verified")
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : ""
        setArbiterIdentityStatus(/not registered|different chain/i.test(message) ? "missing" : /invalid registered/i.test(message) ? "invalid" : "error")
      }
    })
    return () => { cancelled = true }
  }, [arbiter, chainId])

  const updateMilestone = (index: number, value: string) =>
    setMilestones((items) =>
      items.map((item, itemIndex) => (itemIndex === index ? value : item))
    )

  async function createAndFund() {
    if (!client || !contracts.escrowFactory || !contracts.paymentToken) {
      setStatus({
        state: "error",
        title: "Wallet required",
        description:
          "Connect a Fuji wallet and configure the Fuji deployment addresses.",
      })
      return
    }
    if (chainId !== avalancheFuji.id) {
      setStatus({
        state: "error",
        title: "Wrong network",
        description: "Switch to Avalanche Fuji before creating an agreement.",
      })
      return
    }
    if (participantError || allocationError || !verifiedArbiterIdentity) {
      setStatus({
        state: "error",
        title: "Review the agreement",
        description: participantError ?? allocationError ?? "The arbiter must register a verified Swarm identity first.",
      })
      return
    }

    let createdEscrow: Address | undefined
    setStatus({
      state: "submitting",
      title: "Preparing agreement",
      description: "Checking the agreement before requesting wallet approval.",
    })
    try {
      const clientSwarmPublicKey = currentSwarmPublicKey(await getSwarmIdClient())
      const clientSignature = await signMessage(wagmiConfig, {
        message: evidenceIdentityMessage(client, clientSwarmPublicKey, avalancheFuji.id),
      })
      const arbiterIdentity = verifiedArbiterIdentity
      if (!await verifyEvidenceIdentity(arbiterIdentity, avalancheFuji.id)) throw new Error("Registered arbiter Swarm identity is invalid")
      setStatus({
        state: "wallet-confirmation",
        title: "Create agreement",
        description: "Confirm creation in your wallet.",
      })
      const createHash = await writeContract(wagmiConfig, {
        address: contracts.escrowFactory,
        abi: EscrowFactoryAbi,
        functionName: "createEscrow",
        args: [
          provider as Address,
          arbiter as Address,
          contracts.paymentToken,
          allocation.amounts,
          defaultReviewPeriod,
        ],
      })
      setStatus({
        state: "pending",
        title: "Creating agreement",
        description:
          "Waiting for the agreement to be confirmed on Avalanche Fuji.",
      })
      const receipt = await waitForTransactionReceipt(wagmiConfig, {
        hash: createHash,
      })
      const log = receipt.logs
        .map((item) => {
          try {
            return decodeEventLog({
              abi: EscrowFactoryAbi,
              data: item.data,
              topics: item.topics,
            })
          } catch {
            return undefined
          }
        })
        .find((item) => item?.eventName === "EscrowCreated")
      const escrow = log?.args.escrow as Address | undefined
      if (!escrow) throw new Error("EscrowCreated event missing")
      createdEscrow = escrow

      setStatus({ state: "submitting", title: "Locking arbitration identity", description: "Recording the client and arbiter Swarm identities for this agreement." })
      await bindAgreementIdentity({ version: 1, chainId: avalancheFuji.id, escrow, role: "client", identity: { wallet: client, swarmPublicKey: clientSwarmPublicKey, signature: clientSignature } })
      await bindAgreementIdentity({ version: 1, chainId: avalancheFuji.id, escrow, role: "arbiter", identity: arbiterIdentity })

      setStatus({
        state: "wallet-confirmation",
        title: "Approve deposit",
        description: `Approve ${formatMockUsdt(allocation.total)} for this escrow in your wallet.`,
      })
      const approvalHash = await writeContract(wagmiConfig, {
        address: contracts.paymentToken,
        abi: MockUSDTAbi,
        functionName: "approve",
        args: [escrow, allocation.total],
      })
      setStatus({
        state: "pending",
        title: "Approving deposit",
        description: "Waiting for the token approval to be confirmed.",
      })
      await waitForTransactionReceipt(wagmiConfig, { hash: approvalHash })

      setStatus({
        state: "wallet-confirmation",
        title: "Secure funds in escrow",
        description: `Confirm the ${formatMockUsdt(allocation.total)} deposit in your wallet.`,
      })
      const fundHash = await writeContract(wagmiConfig, {
        address: escrow,
        abi: MilestoneEscrowAbi,
        functionName: "fund",
      })
      setStatus({
        state: "pending",
        title: "Securing funds",
        description: "Waiting for the escrow deposit to be confirmed.",
      })
      await waitForTransactionReceipt(wagmiConfig, { hash: fundHash })
      setEscrowAddress(escrow)
      setStatus({
        state: "success",
        title: "Agreement funded",
        description: `${formatMockUsdt(allocation.total)} is now secured in escrow.`,
      })
    } catch (error) {
      console.error(error)
      setEscrowAddress(createdEscrow)
      setStatus({
        state: "error",
        title: createdEscrow
          ? "Agreement created, identity binding or funding incomplete"
          : "Agreement not created",
        description: createdEscrow
          ? `${transactionError(error)} Do not fund until the bound Swarm identities are recorded.`
          : transactionError(error),
      })
    }
  }

  const canContinueAgreement = isConnected && !participantError && arbiterIdentityStatus === "verified"
  const canContinueMilestones = !("error" in allocation)
  const statusIsError = status.state === "error"

  return (
    <main className="mx-auto min-h-svh max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="flex items-center justify-between gap-4 border-b border-border pb-5">
        <Link to="/" className="text-base font-semibold tracking-tight">
          MilestonePay
        </Link>
        <div className="flex items-center gap-3"><Link to="/swarm-identity" className="text-sm text-muted-foreground hover:text-foreground">Swarm identity</Link><WalletButton /></div>
      </header>

      <div className="mx-auto flex max-w-5xl flex-col gap-8 py-10 lg:py-14">
        <div className="flex flex-col gap-3">
          <Link
            to="/"
            className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <RiArrowLeftLine aria-hidden="true" />
            Back to agreements
          </Link>
          <div>
            <h1 className="font-heading text-3xl font-semibold tracking-tight sm:text-4xl">
              New agreement
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
              Define the parties and funding schedule, then secure the full
              amount in escrow.
            </p>
          </div>
        </div>

        <ol
          className="grid gap-3 sm:grid-cols-3"
          aria-label="Agreement creation progress"
        >
          {steps.map((label, index) => {
            const active = index === step
            const complete = index < step
            return (
              <li
                key={label}
                aria-current={active ? "step" : undefined}
                className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-3 text-sm"
              >
                <span
                  className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border text-xs font-medium"
                  aria-hidden="true"
                >
                  {complete ? <RiCheckLine /> : index + 1}
                </span>
                <span
                  className={active ? "font-medium" : "text-muted-foreground"}
                >
                  {label}
                </span>
              </li>
            )
          })}
        </ol>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <Card>
            {step === 0 && (
              <>
                <CardHeader>
                  <CardTitle>Agreement participants</CardTitle>
                  <CardDescription>
                    The connected wallet is the client. A separate provider and
                    arbiter are required.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-2">
                      <label htmlFor="provider" className="text-sm font-medium">
                        Provider wallet
                      </label>
                      <Input
                        id="provider"
                        autoComplete="off"
                        placeholder="0x…"
                        value={provider}
                        aria-invalid={Boolean(provider && !isAddress(provider))}
                        onChange={(event) =>
                          setProvider(event.target.value.trim())
                        }
                      />
                      <p className="text-sm text-muted-foreground">
                        Receives funds after each approved milestone.
                      </p>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label htmlFor="arbiter" className="text-sm font-medium">
                        Arbiter wallet
                      </label>
                      <Input
                        id="arbiter"
                        autoComplete="off"
                        placeholder="0x…"
                        value={arbiter}
                        aria-invalid={Boolean(arbiter && !isAddress(arbiter))}
                        onChange={(event) =>
                          setArbiter(event.target.value.trim())
                        }
                      />
                      <p className="text-sm text-muted-foreground">
                        Resolves disputes between the client and provider.
                      </p>
                    </div>
                    {isAddress(arbiter) && (
                      <p className={arbiterIdentityStatus === "verified" ? "text-sm text-emerald-600" : arbiterIdentityStatus === "invalid" || arbiterIdentityStatus === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
                        {arbiterIdentityStatus === "checking" ? "Checking arbiter identity…" : arbiterIdentityStatus === "verified" ? "Arbiter identity verified" : arbiterIdentityStatus === "missing" ? "Arbiter has not registered a Swarm identity" : arbiterIdentityStatus === "invalid" ? "Arbiter identity proof is invalid" : arbiterIdentityStatus === "error" ? "Arkiv identity registry is unavailable" : ""}
                      </p>
                    )}
                    {participantError && provider && arbiter && (
                      <Alert variant="destructive">
                        <AlertTitle>Check the participants</AlertTitle>
                        <AlertDescription>{participantError}</AlertDescription>
                      </Alert>
                    )}
                  </div>
                </CardContent>
                <CardFooter className="justify-end border-t">
                  <Button
                    onClick={() => setStep(1)}
                    disabled={!canContinueAgreement}
                  >
                    Continue to milestones
                  </Button>
                </CardFooter>
              </>
            )}

            {step === 1 && (
              <>
                <CardHeader>
                  <CardTitle>Funding schedule</CardTitle>
                  <CardDescription>
                    Each amount becomes a sequential milestone. Milestone labels
                    and deadlines are not stored by the current escrow contract.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-3">
                    {milestones.map((amount, index) => (
                      <Card key={index} size="sm">
                        <CardHeader className="border-b">
                          <CardTitle>Milestone {index + 1}</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex items-end gap-3">
                            <div className="flex flex-1 flex-col gap-2">
                              <label
                                htmlFor={`milestone-${index}`}
                                className="text-sm font-medium"
                              >
                                Amount (Mock USDT)
                              </label>
                              <Input
                                id={`milestone-${index}`}
                                inputMode="decimal"
                                placeholder="0.00"
                                value={amount}
                                aria-invalid={"error" in allocation}
                                onChange={(event) =>
                                  updateMilestone(index, event.target.value)
                                }
                              />
                            </div>
                            {milestones.length > 1 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Remove milestone ${index + 1}`}
                                onClick={() =>
                                  setMilestones((items) =>
                                    items.filter(
                                      (_, itemIndex) => itemIndex !== index
                                    )
                                  )
                                }
                              >
                                <RiDeleteBinLine />
                              </Button>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                    <Button
                      className="w-fit"
                      variant="outline"
                      onClick={() => setMilestones((items) => [...items, ""])}
                    >
                      <RiAddLine data-icon="inline-start" />
                      Add milestone
                    </Button>
                    {"error" in allocation && (
                      <Alert variant="destructive">
                        <AlertTitle>Allocation needs attention</AlertTitle>
                        <AlertDescription>{allocation.error}</AlertDescription>
                      </Alert>
                    )}
                  </div>
                </CardContent>
                <CardFooter className="justify-between gap-3 border-t">
                  <Button variant="ghost" onClick={() => setStep(0)}>
                    Back
                  </Button>
                  <Button
                    onClick={() => setStep(2)}
                    disabled={!canContinueMilestones}
                  >
                    Review agreement
                  </Button>
                </CardFooter>
              </>
            )}

            {step === 2 && (
              <>
                <CardHeader>
                  <CardTitle>Review and fund</CardTitle>
                  <CardDescription>
                    You will confirm up to three wallet transactions: creation,
                    token approval, and deposit.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col gap-5">
                    <section
                      className="flex flex-col gap-3"
                      aria-labelledby="parties-heading"
                    >
                      <h2 id="parties-heading" className="text-sm font-medium">
                        Parties
                      </h2>
                      <dl className="grid gap-3 text-sm sm:grid-cols-2">
                        <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/30 p-3">
                          <dt className="text-muted-foreground">Client</dt>
                          <dd className="font-mono text-xs">
                            {client ? shortAddress(client) : "Not connected"}
                          </dd>
                        </div>
                        <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/30 p-3">
                          <dt className="text-muted-foreground">Provider</dt>
                          <dd className="font-mono text-xs">
                            {provider ? shortAddress(provider) : "—"}
                          </dd>
                        </div>
                        <div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/30 p-3 sm:col-span-2">
                          <dt className="text-muted-foreground">Arbiter</dt>
                          <dd className="font-mono text-xs">
                            {arbiter ? shortAddress(arbiter) : "—"}
                          </dd>
                        </div>
                      </dl>
                    </section>

                    <section
                      className="flex flex-col gap-3"
                      aria-labelledby="funding-heading"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <h2
                          id="funding-heading"
                          className="text-sm font-medium"
                        >
                          Funding schedule
                        </h2>
                        <span className="text-sm text-muted-foreground">
                          Mock USDT · 7-day review
                        </span>
                      </div>
                      <div className="overflow-hidden rounded-lg border border-border">
                        {!("error" in allocation) &&
                          milestones.map((_, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 text-sm last:border-b-0"
                            >
                              <span>Milestone {index + 1}</span>
                              <span className="font-medium tabular-nums">
                                {formatMockUsdt(allocation.amounts[index])}
                              </span>
                            </div>
                          ))}
                      </div>
                    </section>

                    <div className="flex items-center justify-between rounded-lg border border-border bg-muted/40 px-4 py-4">
                      <span className="text-sm font-medium">Total to lock</span>
                      <span className="text-lg font-semibold tabular-nums">
                        {formatMockUsdt(allocation.total)}
                      </span>
                    </div>

                    {status.state !== "idle" && (
                      <Alert
                        variant={statusIsError ? "destructive" : "default"}
                      >
                        {isWorking ? (
                          <Spinner aria-hidden="true" />
                        ) : status.state === "success" ? (
                          <RiCheckLine aria-hidden="true" />
                        ) : (
                          <RiShieldCheckLine aria-hidden="true" />
                        )}
                        <AlertTitle>{status.title}</AlertTitle>
                        <AlertDescription>
                          {status.description}
                        </AlertDescription>
                      </Alert>
                    )}
                  </div>
                </CardContent>
                <CardFooter className="flex-wrap justify-between gap-3 border-t">
                  <Button
                    variant="ghost"
                    onClick={() => setStep(1)}
                    disabled={isWorking}
                  >
                    Back
                  </Button>
                  <div className="flex flex-wrap items-center gap-3">
                    {escrowAddress && (
                      <Button
                        nativeButton={false}
                        variant="outline"
                        render={<Link to={`/deal/${escrowAddress}`} />}
                      >
                        View agreement
                      </Button>
                    )}
                    <Button
                      onClick={createAndFund}
                      disabled={
                        !isConnected || isWorking || status.state === "success"
                      }
                    >
                      {isWorking ? (
                        <Spinner data-icon="inline-start" />
                      ) : (
                        <RiWallet3Line data-icon="inline-start" />
                      )}
                      Create &amp; Fund Agreement
                    </Button>
                  </div>
                </CardFooter>
              </>
            )}
          </Card>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
            <Card size="sm">
              <CardHeader>
                <CardTitle>Allocation</CardTitle>
                <CardDescription>
                  All funds are deposited before work begins.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Progress value={step + 1} max={steps.length}>
                  <ProgressLabel>
                    Step {step + 1} of {steps.length}
                  </ProgressLabel>
                  <ProgressValue />
                </Progress>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-muted-foreground">Total</span>
                  <span className="font-medium tabular-nums">
                    {formatMockUsdt(allocation.total)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-muted-foreground">
                    Milestones
                  </span>
                  <span className="font-medium tabular-nums">
                    {milestones.length}
                  </span>
                </div>
              </CardContent>
            </Card>
            <Alert>
              <RiShieldCheckLine aria-hidden="true" />
              <AlertTitle>Escrow protection</AlertTitle>
              <AlertDescription>
                The client deposits the full total into the agreement contract.
                Each milestone is released after review.
              </AlertDescription>
            </Alert>
          </aside>
        </div>
      </div>
    </main>
  )
}

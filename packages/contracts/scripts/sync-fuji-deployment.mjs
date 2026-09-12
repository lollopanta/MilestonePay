import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const broadcast = JSON.parse(readFileSync(resolve(packageDir, "../../contracts/broadcast/DeployFuji.s.sol/43113/run-latest.json"), "utf8"))
const addressFor = (name) => broadcast.transactions.find((transaction) => transaction.contractName === name)?.contractAddress
const paymentToken = addressFor("MockUSDT")
const escrowFactory = addressFor("EscrowFactory")

if (!paymentToken || !escrowFactory) throw new Error("Fuji deployment transactions were not found")

writeFileSync(resolve(packageDir, "src/addresses.ts"), `export const avalancheFujiChainId = 43113 as const\n\nexport const deployments = {\n  [avalancheFujiChainId]: {\n    escrowFactory: "${escrowFactory}",\n    paymentToken: "${paymentToken}",\n  },\n} as const\n`)

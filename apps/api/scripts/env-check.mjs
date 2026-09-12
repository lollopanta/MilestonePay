/* global URL, console, process */

import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")
const envPath = resolve(root, ".env")
const repair = process.argv.includes("--repair")
const obsolete = new Set([
  "VITE_SWARM_GATEWAY",
  "VITE_USDT_ADDRESS",
  "VITE_PAYMENT_TOKEN_ADDRESS",
  "VITE_ESCROW_FACTORY",
  "ESCROW_FACTORY_ADDRESS",
])
const privateKeys = [
  "DEPLOYER_PRIVATE_KEY",
  "FUJI_CLIENT_PRIVATE_KEY",
  "FUJI_PROVIDER_PRIVATE_KEY",
  "FUJI_ARBITER_PRIVATE_KEY",
]
const keyPattern = /^0x[0-9a-fA-F]{64}$/
const publicDefaults = {
  VITE_API_URL: "http://localhost:3001",
  VITE_AVALANCHE_RPC: "",
  VITE_CHAIN_ID: "43113",
  VITE_SWARM_ID_ORIGIN: "https://swarm-id.snaha.net",
  PORT: "3001",
  CORS_ORIGIN: "http://localhost:5173",
  SYNC_INTERVAL_SECONDS: "60",
  FUJI_RPC_URL: "https://api.avax-test.network/ext/bc/C/rpc",
  ARKIV_RPC: "https://rpc.tiramisu.db-chain.testnet.arkiv.network",
}

const isUrl = (value) => {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

const isPort = (value) => /^\d+$/.test(value) && Number(value) > 0 && Number(value) < 65536
const isPositiveInteger = (value) => /^\d+$/.test(value) && Number(value) > 0
const validKey = (value) => keyPattern.test(value ?? "")

function load() {
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/)
  const entries = new Map()
  lines.forEach((line, index) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/)
    if (match) entries.set(match[1], { index, value: match[2].trim() })
  })
  return { lines, entries }
}

function setValue(state, key, value) {
  const current = state.entries.get(key)
  if (current) {
    state.lines[current.index] = `${key}=${value}`
    current.value = value
    return
  }
  state.lines.push(`${key}=${value}`)
  state.entries.set(key, { index: state.lines.length - 1, value })
}

function removeObsolete(state) {
  state.lines = state.lines.filter((line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)
    return !match || !obsolete.has(match[1])
  })
  state.entries = new Map(
    state.lines.flatMap((line, index) => {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/)
      return match ? [[match[1], { index, value: match[2].trim() }]] : []
    })
  )
}

function value(state, key) {
  return state.entries.get(key)?.value ?? ""
}

function status(key, state, validator) {
  const current = value(state, key)
  const presence = current ? "present" : "missing"
  const validity = current && validator ? (validator(current) ? "valid" : "invalid") : ""
  console.log(`${key}: ${[presence, validity].filter(Boolean).join(", ")}`)
}

const state = load()
let writerCreated = false

if (repair) {
  removeObsolete(state)
  for (const [key, fallback] of Object.entries(publicDefaults)) {
    const current = value(state, key)
    const valid =
      key === "VITE_CHAIN_ID"
        ? current === "43113"
        : key === "PORT"
          ? isPort(current)
          : key === "SYNC_INTERVAL_SECONDS"
            ? isPositiveInteger(current)
            : key === "VITE_AVALANCHE_RPC"
              ? !current || isUrl(current)
              : isUrl(current)
    if (!valid) setValue(state, key, fallback)
  }
  for (const key of ["ARKIV_ACCESS_KEY", "AI_API_KEY", ...privateKeys]) {
    if (!state.entries.has(key)) setValue(state, key, "")
  }
  if (!validKey(value(state, "ARKIV_PRIVATE_KEY"))) {
    setValue(state, "ARKIV_PRIVATE_KEY", generatePrivateKey())
    writerCreated = true
  }
  writeFileSync(envPath, `${state.lines.join("\n").replace(/\n+$/, "")}\n`)
}

const repaired = repair ? load() : state
console.log("ENVIRONMENT CHECK")
for (const key of [
  "VITE_API_URL",
  "VITE_AVALANCHE_RPC",
  "VITE_CHAIN_ID",
  "VITE_SWARM_ID_ORIGIN",
  "PORT",
  "CORS_ORIGIN",
  "FUJI_RPC_URL",
  "ARKIV_RPC",
]) {
  status(key, repaired, key === "PORT" ? isPort : key === "VITE_CHAIN_ID" ? (item) => item === "43113" : isUrl)
}
for (const key of privateKeys) status(key, repaired, validKey)
status("ARKIV_ACCESS_KEY", repaired)
status("ARKIV_PRIVATE_KEY", repaired, validKey)
status("AI_API_KEY", repaired)

const validRoles = privateKeys.slice(1).flatMap((key) => {
  const current = value(repaired, key)
  return validKey(current) ? [[key, privateKeyToAccount(current).address]] : []
})
for (const [key, address] of validRoles) {
  console.log(`${key.replace("_PRIVATE_KEY", "")} address: ${address}`)
}
const roleAddresses = validRoles.map(([, address]) => address.toLowerCase())
console.log(`Fuji roles distinct: ${roleAddresses.length === 3 && new Set(roleAddresses).size === 3 ? "yes" : "no or incomplete"}`)

const writerKey = value(repaired, "ARKIV_PRIVATE_KEY")
if (validKey(writerKey)) {
  console.log(`Arkiv writer address: ${privateKeyToAccount(writerKey).address}`)
}
console.log(`Arkiv writer created: ${writerCreated ? "yes" : "no"}`)

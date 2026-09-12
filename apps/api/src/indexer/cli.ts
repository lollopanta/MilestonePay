import { createArkivRepository } from "../arkiv/writer.js"
import { createAvalancheReader } from "./avalanche.js"
import { syncAvalanche } from "./sync.js"

if (!process.env.FUJI_RPC_URL) throw new Error("FUJI_RPC_URL is required for api sync")
const result = await syncAvalanche(createArkivRepository(), createAvalancheReader({ rpcUrl: process.env.FUJI_RPC_URL }))
console.log(JSON.stringify({ written: result.written, events: result.events, startBlock: result.startBlock.toString(), checkpoint: result.checkpoint }))

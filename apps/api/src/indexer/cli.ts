import { createArkivRepository } from "../arkiv/writer.js"
import { syncEvents } from "./sync.js"

// The transport-specific Avalanche reader is deliberately separate from routes; deployment config is required to sync.
const factory = process.env.ESCROW_FACTORY_ADDRESS
if (!factory) throw new Error("ESCROW_FACTORY_ADDRESS is required for api sync")
await syncEvents(createArkivRepository(), [])

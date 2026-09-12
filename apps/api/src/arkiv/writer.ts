import { ExpirationTime, jsonToPayload } from "@arkiv-network/sdk"
import { i32 } from "@arkiv-network/sdk/attr"
import type { Address } from "viem"
import { createArkivPublicClient, createArkivWalletClient, trustedWriter } from "./client.js"
import { ENTITY_LIFETIME_DAYS, PROJECT, SCHEMA_VERSION, type EntityType, type OfficialEntity, jsonSafe } from "./schema.js"

export interface ArkivRepository { writer: Address; find(type: EntityType, field: string, value: string): Promise<OfficialEntity[]>; all(type: EntityType): Promise<OfficialEntity[]>; put(entity: Omit<OfficialEntity, "id" | "creator">): Promise<OfficialEntity> }
export class MemoryArkivRepository implements ArkivRepository {
  readonly entities: OfficialEntity[] = []
  constructor(readonly writer: Address) {}
  async find(type: EntityType, field: string, value: string) { return this.entities.filter((e) => e.creator === this.writer && e.type === type && String(e.attributes[field]) === value) }
  async all(type: EntityType) { return this.entities.filter((e) => e.creator === this.writer && e.type === type) }
  async put(entity: Omit<OfficialEntity, "id" | "creator">) { const stored = { ...entity, id: `${entity.type}:${this.entities.length}`, creator: this.writer }; this.entities.push(stored); return stored }
}
export function createArkivRepository(): ArkivRepository {
  const writer = trustedWriter()
  const wallet = createArkivWalletClient(); const publicClient = createArkivPublicClient()
  return {
    writer,
    async find(type, field, value) { return collect(publicClient, writer, type, field, value) },
    async all(type) { return collect(publicClient, writer, type) },
    async put(entity) {
      const attributes = { project: PROJECT, schema_version: i32(SCHEMA_VERSION), entity_type: entity.type, ...entity.attributes }
      await wallet.createEntity({ payload: jsonToPayload(jsonSafe(entity.payload ?? {}) as object), contentType: "application/json", attributes, expires: ExpirationTime.fromDays(ENTITY_LIFETIME_DAYS) })
      return { ...entity, id: `${entity.type}:${Date.now()}`, creator: writer }
    },
  }
}
async function collect(client: ReturnType<typeof createArkivPublicClient>, writer: Address, type: EntityType, field?: string, value?: string): Promise<OfficialEntity[]> {
  const { eq } = await import("@arkiv-network/sdk/query")
  const builder = client.select({ key: true, attributes: true, payload: true }).createdBy(writer).where(eq("project", PROJECT), eq("schema_version", i32(SCHEMA_VERSION)), eq("entity_type", type), ...(field ? [eq(field, value!)] : []))
  const result: OfficialEntity[] = []
  for await (const entity of builder) {
    const attributes = Object.fromEntries(Object.entries(entity.attributes ?? {}).map(([key, attribute]) => [key, typeof attribute === "object" && attribute && "value" in attribute ? attribute.value : attribute])) as Record<string, string | number | boolean>
    result.push({ id: String(entity.key), type, attributes, payload: entity.toJson(), creator: writer })
  }
  return result
}

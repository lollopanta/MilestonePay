import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildApp } from './app.js'
import { MemoryArkivRepository } from './arkiv/writer.js'
import type { AvalancheReader } from './indexer/avalanche.js'
import { disputeEvidenceSealMessage, hashEvidenceDescriptor, type EvidenceDescriptorV1 } from '@milestonepay/evidence'
import { evidenceIdentityMessage } from '@milestonepay/evidence'
import { privateKeyToAccount } from 'viem/accounts'

test('health endpoints respond without exposing Arkiv internals', async () => {
  const app = buildApp(async () => 123n)
  try {
    const response = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://localhost:5173' },
    })
    assert.equal(response.statusCode, 200)
    assert.deepEqual(response.json(), { status: 'ok' })
    assert.equal(response.headers['access-control-allow-origin'], 'http://localhost:5173')
    assert.deepEqual((await app.inject('/arkiv/health')).json(), {
      status: 'ok',
      network: 'tiramisu',
      blockNumber: '123',
    })
    assert.equal((await app.inject('/deals')).statusCode, 404)
  } finally {
    await app.close()
  }
})

test('Arkiv health returns 503 when its RPC is unavailable', async () => {
  const app = buildApp(async () => Promise.reject(new Error('secret upstream detail')))
  try {
    const response = await app.inject('/arkiv/health')
    assert.equal(response.statusCode, 503)
    assert.deepEqual(response.json(), { status: 'unavailable', network: 'tiramisu' })
  } finally {
    await app.close()
  }
})

test('protocol routes validate public identifiers before external reads', async () => {
  const reader: AvalancheReader = { chainId: 43113, factory: '0x0000000000000000000000000000000000000001', readEvents: async () => [], isEscrow: async () => false, evidenceHash: async () => `0x${'0'.repeat(64)}`, readEscrow: async () => { throw new Error('not reached') } }
  const repo = new MemoryArkivRepository('0x0000000000000000000000000000000000000002')
  const app = buildApp(async () => 123n, { repo, reader })
  try {
    assert.equal((await app.inject('/deals/not-an-address')).statusCode, 400)
    assert.equal((await app.inject('/evidence/not-a-hash')).statusCode, 400)
    assert.equal((await app.inject('/wallets/not-an-address/history')).statusCode, 400)
    assert.equal((await app.inject('/deals/0x0000000000000000000000000000000000000003')).statusCode, 404)
    const wallet = '0x0000000000000000000000000000000000000004'
    const deal = { escrow: '0x0000000000000000000000000000000000000005', client: wallet, provider: '0x0000000000000000000000000000000000000006', status: 'active' }
    await repo.put({ type: 'deal', attributes: { ...deal, last_event_block: 1, last_event_id: 'one' } })
    await repo.put({ type: 'deal', attributes: { ...deal, last_event_block: 2, last_event_id: 'two' } })
    assert.equal((await app.inject(`/wallets/${wallet}/history`)).json().deals.length, 1)
  } finally { await app.close() }
})

test('evidence conflicts and unavailable protocol dependencies have safe errors', async () => {
  const escrow = '0x0000000000000000000000000000000000000003' as const
  const descriptor: EvidenceDescriptorV1 = { version: 1, kind: 'milestone', chainId: 43113, escrow, milestoneId: 0, createdAt: 1, act: { encryptedReference: '1'.repeat(64), historyReference: '2'.repeat(64), publisherPublicKey: `0x${'3'.repeat(66)}`, actReference: '4'.repeat(64) } }
  const hash = hashEvidenceDescriptor(descriptor)
  const repo = new MemoryArkivRepository('0x0000000000000000000000000000000000000002')
  await repo.put({ type: 'evidence', attributes: { evidence_hash: hash }, payload: { ...descriptor, createdAt: 2 } })
  const reader: AvalancheReader = { chainId: 43113, factory: '0x0000000000000000000000000000000000000001', readEvents: async () => [], isEscrow: async () => true, evidenceHash: async () => hash, readEscrow: async () => { throw new Error('unavailable') } }
  const app = buildApp(async () => 123n, { repo, reader })
  try {
    assert.equal((await app.inject({ method: 'POST', url: '/evidence', payload: descriptor })).statusCode, 409)
    assert.equal((await app.inject({ method: 'POST', url: '/evidence', payload: { ...descriptor, plaintext: 'must not reach Fastify storage' } })).statusCode, 400)
    const unavailable = buildApp(async () => 123n, { repo, reader: { ...reader, isEscrow: async () => { throw new Error('upstream') } } })
    try { assert.equal((await unavailable.inject(`/deals/${escrow}`)).statusCode, 503) } finally { await unavailable.close() }
  } finally { await app.close() }
})

test('agreement Swarm identities are bound once to their on-chain roles', async () => {
  const escrow = '0x0000000000000000000000000000000000000003' as const
  const arbiter = privateKeyToAccount(`0x${'1'.repeat(64)}`)
  const client = '0x0000000000000000000000000000000000000004' as const
  const reader: AvalancheReader = {
    chainId: 43113, factory: '0x0000000000000000000000000000000000000001', readEvents: async () => [], isEscrow: async () => true,
    evidenceHash: async () => `0x${'0'.repeat(64)}`, readEscrow: async () => ({ client, provider: '0x0000000000000000000000000000000000000005', arbiter: arbiter.address, paymentToken: '0x0000000000000000000000000000000000000006', totalAmount: 1n, reviewPeriod: 1n, status: 'active', currentMilestone: 0n, totalReleased: 0n, totalRefunded: 0n }),
  }
  const repo = new MemoryArkivRepository('0x0000000000000000000000000000000000000002')
  const app = buildApp(async () => 123n, { repo, reader })
  const swarmPublicKey = `02${'d'.repeat(64)}`
  const binding = { version: 1, chainId: 43113, escrow, role: 'arbiter', identity: { wallet: arbiter.address, swarmPublicKey, signature: await arbiter.signMessage({ message: evidenceIdentityMessage(arbiter.address, swarmPublicKey, 43113) }) } }
  try {
    assert.equal((await app.inject({ method: 'POST', url: `/agreements/${escrow}/identities`, payload: binding })).statusCode, 200)
    assert.equal((await app.inject({ method: 'POST', url: `/agreements/${escrow}/identities`, payload: binding })).statusCode, 200)
    const other = privateKeyToAccount(`0x${'2'.repeat(64)}`)
    const otherKey = `03${'e'.repeat(64)}`
    assert.equal((await app.inject({ method: 'POST', url: `/agreements/${escrow}/identities`, payload: { ...binding, identity: { wallet: other.address, swarmPublicKey: otherKey, signature: await other.signMessage({ message: evidenceIdentityMessage(other.address, otherKey, 43113) }) } } })).statusCode, 400)
  } finally { await app.close() }
})

test('canonical dispute evidence snapshots commit the patched ACT state and bound arbiter', async () => {
  const escrow = '0x0000000000000000000000000000000000000003' as const
  const client = '0x0000000000000000000000000000000000000004' as const
  const provider = privateKeyToAccount(`0x${'4'.repeat(64)}`)
  const arbiter = privateKeyToAccount(`0x${'3'.repeat(64)}`)
  const source: EvidenceDescriptorV1 = { version: 1, kind: 'milestone', chainId: 43113, escrow, milestoneId: 0, createdAt: 1, act: { encryptedReference: '1'.repeat(64), historyReference: '2'.repeat(64), publisherPublicKey: `02${'3'.repeat(64)}`, actReference: '4'.repeat(64) } }
  const sourceHash = hashEvidenceDescriptor(source)
  const reader: AvalancheReader = { chainId: 43113, factory: '0x0000000000000000000000000000000000000001', readEvents: async () => [], isEscrow: async () => true, evidenceHash: async () => sourceHash, readEscrow: async () => ({ client, provider: provider.address, arbiter: arbiter.address, paymentToken: '0x0000000000000000000000000000000000000006', totalAmount: 1n, reviewPeriod: 1n, status: 'disputed', currentMilestone: 0n, totalReleased: 0n, totalRefunded: 0n }) }
  const repo = new MemoryArkivRepository('0x0000000000000000000000000000000000000002')
  await repo.put({ type: 'evidence', attributes: { evidence_hash: sourceHash, escrow, milestone_id: 0, kind: 'milestone' }, payload: source })
  const app = buildApp(async () => 123n, { repo, reader })
  const swarmPublicKey = `02${'d'.repeat(64)}`
  const binding = { version: 1, chainId: 43113, escrow, role: 'arbiter', identity: { wallet: arbiter.address, swarmPublicKey, signature: await arbiter.signMessage({ message: evidenceIdentityMessage(arbiter.address, swarmPublicKey, 43113) }) } }
  try {
    const identity = (await app.inject({ method: 'POST', url: `/agreements/${escrow}/identities`, payload: binding })).json()
    assert.deepEqual((await app.inject(`/disputes/${escrow}/0/evidence`)).json().evidenceStatus, 'PENDING')
    const snapshot = { version: 1 as const, kind: 'dispute-client' as const, chainId: 43113, escrow, milestoneId: 0, sourceEvidenceHash: sourceHash, act: { ...source.act, historyReference: '5'.repeat(64), actReference: '6'.repeat(64) }, arbiterIdentityCommitment: identity.commitment as `0x${string}` }
    const seal = { version: 1, snapshot, publisher: provider.address, signature: await provider.signMessage({ message: disputeEvidenceSealMessage(snapshot) }) }
    assert.equal((await app.inject({ method: 'POST', url: '/dispute-evidence', payload: seal })).statusCode, 200)
    assert.equal((await app.inject({ method: 'POST', url: '/dispute-evidence', payload: seal })).statusCode, 200)
    assert.deepEqual((await app.inject(`/disputes/${escrow}/0/evidence`)).json().evidenceStatus, 'READY')
  } finally { await app.close() }
})

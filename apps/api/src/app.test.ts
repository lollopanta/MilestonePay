import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildApp } from './app.js'
import { MemoryArkivRepository } from './arkiv/writer.js'
import type { AvalancheReader } from './indexer/avalanche.js'

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
  const app = buildApp(async () => 123n, { repo: new MemoryArkivRepository('0x0000000000000000000000000000000000000002'), reader })
  try {
    assert.equal((await app.inject('/deals/not-an-address')).statusCode, 400)
    assert.equal((await app.inject('/evidence/not-a-hash')).statusCode, 400)
    assert.equal((await app.inject('/wallets/not-an-address/history')).statusCode, 400)
    assert.equal((await app.inject('/deals/0x0000000000000000000000000000000000000003')).statusCode, 404)
  } finally { await app.close() }
})

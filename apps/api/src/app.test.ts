import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildApp } from './app.js'

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

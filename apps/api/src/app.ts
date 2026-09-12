import Fastify from 'fastify'
import cors from '@fastify/cors'
import { getArkivBlockNumber } from './arkiv.js'

export function buildApp(arkivBlockNumber = getArkivBlockNumber) {
  const app = Fastify({ logger: true })
  app.register(cors, {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  })
  app.get('/health', async () => ({ status: 'ok' }))
  app.get('/arkiv/health', async (_request, reply) => {
    try {
      const blockNumber = await arkivBlockNumber()
      return { status: 'ok', network: 'tiramisu', blockNumber: blockNumber.toString() }
    } catch {
      return reply.code(503).send({ status: 'unavailable', network: 'tiramisu' })
    }
  })
  return app
}

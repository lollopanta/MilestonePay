import Fastify from 'fastify'
import cors from '@fastify/cors'
import { getArkivBlockNumber } from './arkiv.js'
import { createArkivRepository, type ArkivRepository } from './arkiv/writer.js'
import { createAvalancheReader, type AvalancheReader } from './indexer/avalanche.js'
import { ProtocolError, ProtocolService, validAddress, validHash } from './services/protocol.js'
import { validateEvidenceDescriptor } from '@milestonepay/evidence'

export function buildApp(arkivBlockNumber = getArkivBlockNumber, dependencies?: { repo: ArkivRepository; reader: AvalancheReader }) {
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
  const service = () => { try { return new ProtocolService(dependencies?.repo ?? createArkivRepository(), dependencies?.reader ?? createAvalancheReader()) } catch { throw new ProtocolError(503, 'Protocol data is unavailable') } }
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ProtocolError) return reply.code(error.statusCode).send({ error: error.message })
    app.log.error(error)
    return reply.code(503).send({ error: 'Protocol data is unavailable' })
  })
  app.get('/deals/:escrow', async (request) => service().deal(validAddress((request.params as { escrow: string }).escrow)))
  app.get('/wallets/:address/history', async (request) => service().history(validAddress((request.params as { address: string }).address)))
  app.get('/wallets/:address/reputation', async (request) => service().reputation(validAddress((request.params as { address: string }).address)))
  app.get('/evidence/:hash', async (request) => service().evidence(validHash((request.params as { hash: string }).hash)))
  app.post('/evidence', async (request) => { try { validateEvidenceDescriptor(request.body) } catch { throw new ProtocolError(400, 'Invalid evidence descriptor') }; return service().registerEvidence(request.body) })
  return app
}

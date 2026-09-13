import Fastify from 'fastify'
import cors from '@fastify/cors'
import { getArkivBlockNumber } from './arkiv.js'
import { createArkivRepository, type ArkivRepository } from './arkiv/writer.js'
import { createAvalancheReader, type AvalancheReader } from './indexer/avalanche.js'
import { ProtocolError, ProtocolService, validAddress, validHash, validMilestone } from './services/protocol.js'
import { validateAgreementEvidenceIdentity, validateArbiterSwarmIdentity, validateChatFeedBinding, validateDisputeEvidenceSeal, validateEvidenceDescriptor } from '@milestonepay/evidence'

export function buildApp(arkivBlockNumber = getArkivBlockNumber, dependencies?: { repo: ArkivRepository; reader: AvalancheReader }) {
  const app = Fastify({ logger: true })
  app.register(cors, {
    origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(','),
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
  app.get('/arkiv/dashboard', async () => service().arkivDashboard())
  app.get('/evidence/:hash', async (request) => service().evidence(validHash((request.params as { hash: string }).hash)))
  app.post('/evidence', async (request) => { try { validateEvidenceDescriptor(request.body) } catch { throw new ProtocolError(400, 'Invalid evidence descriptor') }; return service().registerEvidence(request.body) })
  app.post('/arbiter-identities', async (request) => { try { validateArbiterSwarmIdentity(request.body) } catch { throw new ProtocolError(400, 'Invalid arbiter Swarm identity') }; return service().registerArbiterSwarmIdentity(request.body) })
  app.get('/arbiter-identities/:wallet', async (request) => { const chainId = Number((request.query as { chainId?: string }).chainId); if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new ProtocolError(400, 'Invalid chain ID'); return service().arbiterSwarmIdentity(validAddress((request.params as { wallet: string }).wallet), chainId) })
  app.get('/agreements/:escrow/identities', async (request) => service().agreementIdentities(validAddress((request.params as { escrow: string }).escrow)))
  app.post('/agreements/:escrow/identities', async (request) => { const escrow = validAddress((request.params as { escrow: string }).escrow); try { validateAgreementEvidenceIdentity(request.body) } catch { throw new ProtocolError(400, 'Invalid agreement Swarm identity') }; if (request.body.escrow.toLowerCase() !== escrow.toLowerCase()) throw new ProtocolError(400, 'Agreement identity escrow mismatch'); return service().bindAgreementIdentity(request.body) })
  app.get('/agreements/:escrow/chat-feeds', async (request) => service().chatFeeds(validAddress((request.params as { escrow: string }).escrow)))
  app.post('/agreements/:escrow/chat-feeds', async (request) => { const escrow = validAddress((request.params as { escrow: string }).escrow); try { validateChatFeedBinding(request.body) } catch { throw new ProtocolError(400, 'Invalid chat feed binding') }; if (request.body.escrow.toLowerCase() !== escrow.toLowerCase()) throw new ProtocolError(400, 'Chat feed escrow mismatch'); return service().bindChatFeed(request.body) })
  app.post('/dispute-evidence', async (request) => { try { validateDisputeEvidenceSeal(request.body) } catch { throw new ProtocolError(400, 'Invalid dispute evidence seal') }; return service().registerDisputeEvidence(request.body) })
  app.get('/disputes/:escrow/:milestone/evidence', async (request) => { const params = request.params as { escrow: string; milestone: string }; return service().disputeEvidenceStatus(validAddress(params.escrow), validMilestone(params.milestone)) })
  return app
}

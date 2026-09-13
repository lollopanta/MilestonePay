# Arkiv builder-friction report

**Run:** 2026-09-13  
**Project:** MilestonePay  
**Scope:** Arkiv SDK integration, documentation, Hub, access-key and faucet entry points, explorers, Tiramisu network, and agent/MCP tooling.

## Environment and method

| Item | Observed version or state |
| --- | --- |
| Application integration | `@arkiv-network/sdk` 0.8.0, `viem` 2.56.3; Node.js 22.17.0 |
| Network | Tiramisu testnet, chain ID `7738577` (`0x7614d1`), GLM gas token |
| Public RPC | `https://rpc.tiramisu.db-chain.testnet.arkiv.network` |
| Hub | Public pages viewed 2026-09-13; MCP page reported deployment `5da15d2` |
| Wallet-gated flows | No wallet connected, no access key created, no faucet claim submitted |

I reviewed the existing TypeScript integration, visited the public surfaces below, and made a read-only RPC attempt. The runner could not resolve the RPC hostname, so that result is an environment DNS limitation—not an Arkiv network defect. No secrets, wallet signatures, access keys, or faucet claims were used.

## Surface notes

- **SDK:** The installed `0.8.0` SDK and `viem` `2.56.3` match the versions currently listed in the Hub's tools catalog. The app uses the documented `tiramisu` chain and public/wallet clients.
- **Docs:** The [documentation home](https://docs.arkiv.network/) provides the chain ID, RPC and WebSocket endpoints, and links to the [Tiramisu reference](https://docs.arkiv.network/networks/tiramisu/), [access-key guide](https://docs.arkiv.network/start-here/access-keys/), and [agent skills](https://docs.arkiv.network/start-here/agent-skill/).
- **Hub:** [Arkiv Hub](https://hub.arkiv.network/) is a useful single starting point for the faucet, Try It Out, tools, docs, Data Explorer, Block Explorer, and status.
- **Access keys and faucet:** The access-key guide clearly documents the wallet-sign-in flow, Tiramisu selection, path/header/bearer formats, quota, and IP/origin allowlists. The [faucet](https://hub.arkiv.network/faucet) identifies itself as testnet GLM with a per-wallet cooldown. Both complete flow outcomes are intentionally untested because they require a wallet connection (and, for the key flow, CAPTCHA).
- **Explorers:** The Hub links to [Data Explorer](https://data.arkiv.network/) and the [Tiramisu Block Explorer](https://tiramisu.explorer.arkiv.network/). They are JavaScript applications; their public landing pages supplied no inspectable text in this read-only session, so no explorer-specific claim is made.
- **Network:** The documented Tiramisu RPC endpoint and chain configuration are consistent across docs and the installed SDK. A public `eth_blockNumber` attempt was blocked by runner-side DNS resolution, not evaluated as service availability.
- **MCP/tools:** The [agent-skills documentation](https://docs.arkiv.network/start-here/agent-skill/) usefully publishes `arkiv-best-practices` and `arkiv-feedback`; the latter points to the official issue forms. The Hub's MCP integration itself is currently unavailable (issue below). The [tools catalog](https://hub.arkiv.network/tools) is otherwise accessible and explicitly lists SDK compatibility.

## Confirmed issue: MCP entry point is advertised but unavailable

**Severity:** Builder-blocking for a developer choosing Arkiv specifically for the hosted MCP connection.

**Expected behavior:** The public MCP entry point should provide setup/connection instructions or clearly communicate that MCP is unavailable before it is promoted as a build surface.

**Actual behavior:** The public site says “Arkiv MCP — Connect your agents straight to Arkiv,” and the docs home calls Hub the home base for “faucet, MCP access, and network tools.” Opening [Hub MCP](https://hub.arkiv.network/mcp) instead displays: “MCP setup is temporarily unavailable” and directs the user to Try It Out.

**Versions / observed state:**

- Observed 2026-09-13
- Hub MCP page deployment metadata: `5da15d2`
- Current supported public testnet: Tiramisu, chain ID `7738577`
- Existing project SDK: `@arkiv-network/sdk` `0.8.0`; `viem` `2.56.3`

**Reproduction:**

1. Open [arkiv.network](https://arkiv.network/) and locate the “Arkiv MCP” build link.
2. Open the [Arkiv docs home](https://docs.arkiv.network/) and note the Hub “MCP access” description.
3. Open [https://hub.arkiv.network/mcp](https://hub.arkiv.network/mcp).
4. Observe the unavailable-state message instead of connection/setup instructions.

**Suggested minimal fix:** Change the public MCP links/copy to “temporarily unavailable” while the integration is updated, or ship a setup/status page with a supported fallback and an ETA/status link.

## Non-issues and constraints

- The access-key and faucet flows were not exercised past their public entry points, so this report does not infer a fault in their wallet- or CAPTCHA-gated steps.
- The DNS failure in the evaluation runner does not establish an Arkiv RPC outage; [Arkiv Status](https://status.arkiv.network/) should remain the availability source of truth.

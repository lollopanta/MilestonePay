export const FUJI_DEPLOYMENT_BLOCK = 58_333_416n
export const RECENT_BLOCK_WINDOW = 25_000n

export function recentBlockRange(latestBlock: bigint) {
  if (latestBlock <= FUJI_DEPLOYMENT_BLOCK) {
    return { fromBlock: latestBlock, toBlock: latestBlock }
  }

  return {
    fromBlock:
      latestBlock - FUJI_DEPLOYMENT_BLOCK > RECENT_BLOCK_WINDOW
        ? latestBlock - RECENT_BLOCK_WINDOW
        : FUJI_DEPLOYMENT_BLOCK,
    toBlock: latestBlock,
  }
}

export function shortHash(value: string) {
  return `${value.slice(0, 8)}…${value.slice(-6)}`
}

export function blockDate(timestamp: bigint) {
  return new Date(Number(timestamp) * 1_000)
}

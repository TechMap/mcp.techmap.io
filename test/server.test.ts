import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { TechmapClient, type FetchLike } from '../src/client.js'
import { createServer } from '../src/server.js'

const fixture = readFileSync(new URL('../../test/fixture-search.json', import.meta.url), 'utf8')

function mockFetch(status = 200, body = fixture) {
  const calls: { url: string, headers?: Record<string, string> }[] = []
  const fn: FetchLike = async (url, init) => {
    calls.push({ url, headers: init?.headers })
    return { ok: status < 400, status, text: async () => body }
  }
  return { fn, calls }
}

async function connect(client?: TechmapClient) {
  const server = createServer(client)
  const [a, b] = InMemoryTransport.createLinkedPair()
  const mcp = new Client({ name: 'test', version: '0.0.0' })
  await Promise.all([server.connect(a), mcp.connect(b)])
  return mcp
}

test('lists the three tools', async () => {
  const mcp = await connect()
  const { tools } = await mcp.listTools()
  assert.deepEqual(tools.map((t) => t.name).sort(), ['count_jobs', 'get_rss_feed_url', 'search_jobs'])
})

test('search_jobs sends filters and RapidAPI headers, returns summarized jobs', async () => {
  const { fn, calls } = mockFetch()
  const mcp = await connect(new TechmapClient('test-key', fn))
  const res: any = await mcp.callTool({ name: 'search_jobs', arguments: { countryCode: 'lu', title: 'controller', isDirect: true, page: 2 } })
  const url = new URL(calls[0].url)
  assert.equal(url.pathname, '/api/v2/jobs/search')
  assert.equal(url.searchParams.get('countryCode'), 'lu')
  assert.equal(url.searchParams.get('isDirect'), 'true')
  assert.equal(url.searchParams.get('page'), '2')
  assert.equal(calls[0].headers?.['X-RapidAPI-Key'], 'test-key')
  const data = JSON.parse(res.content[0].text)
  assert.equal(data.totalCount, 374)
  assert.equal(data.jobs[0].company, 'Example SARL')
  assert.ok(data.jobs[0].description.length <= 601)
})

test('API errors are returned as tool errors with a hint', async () => {
  const { fn } = mockFetch(403, '{"message":"You are not subscribed to this API."}')
  const mcp = await connect(new TechmapClient('bad', fn))
  const res: any = await mcp.callTool({ name: 'search_jobs', arguments: { countryCode: 'de' } })
  assert.equal(res.isError, true)
  assert.match(res.content[0].text, /HTTP 403.*subscribed/s)
})

test('retries once on the per-second rate limit', async () => {
  let n = 0
  const fn: FetchLike = async () => (++n === 1
    ? { ok: false, status: 429, text: async () => '{"message":"You have exceeded the rate limit per second for your plan"}' }
    : { ok: true, status: 200, text: async () => fixture })
  const mcp = await connect(new TechmapClient('k', fn, undefined, 30_000, 1))
  const res: any = await mcp.callTool({ name: 'search_jobs', arguments: { countryCode: 'lu' } })
  assert.equal(n, 2)
  assert.ok(!res.isError)
})

test('missing key gives a helpful error', async () => {
  const mcp = await connect()
  const res: any = await mcp.callTool({ name: 'count_jobs', arguments: { countryCode: 'de' } })
  assert.equal(res.isError, true)
  assert.match(res.content[0].text, /TECHMAP_RAPIDAPI_KEY/)
})

test('get_rss_feed_url builds a URL without leaking a key', async () => {
  const mcp = await connect(new TechmapClient('secret-key', mockFetch().fn))
  const res: any = await mcp.callTool({ name: 'get_rss_feed_url', arguments: { countryCode: 'de', workPlace: 'remote' } })
  const { url } = JSON.parse(res.content[0].text)
  assert.match(url, /^https:\/\/job-postings-rss-feed\.p\.rapidapi\.com\/api\/rss\/v1\/jobs_full\?/)
  assert.match(url, /countryCode=de/)
  assert.ok(url.includes('{YOUR_RAPIDAPI_KEY}'))
  assert.ok(!url.includes('secret-key'))
})

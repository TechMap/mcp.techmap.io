import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { TechmapClient, rssFeedUrl, summarizeJob, type SearchParams } from './client.js'

export const VERSION = '0.1.1'

// Search filters shared by search_jobs, count_jobs and get_rss_feed_url.
// Names match the Jobs API query parameters (https://api.techmap.io).
const filters = {
  countryCode: z.string().length(2).optional().describe('ISO 3166-1 alpha-2 country code of the job location, e.g. "de", "us", "lu"'),
  title: z.string().optional().describe('Free-text search in the job title, e.g. "data engineer"'),
  occupation: z.string().optional().describe('Occupation stem extracted from the title, e.g. "developer", "nurse"'),
  skills: z.string().optional().describe('Skill or keyword, e.g. "python"'),
  company: z.string().optional().describe('Hiring company name'),
  city: z.string().optional().describe('City of the workplace'),
  state: z.string().optional().describe('State/region of the workplace'),
  workPlace: z.string().optional().describe('remote, hybrid, onsite, field or offshore'),
  workType: z.string().optional().describe('fulltime, parttime, flextime …'),
  contractType: z.string().optional().describe('permanent, temporary, internship …'),
  industry: z.string().optional().describe('Industry, e.g. "healthcare"'),
  language: z.string().length(2).optional().describe('ISO 639-1 language of the posting, e.g. "en"'),
  dateCreated: z.string().optional().describe('Day (YYYY-MM-DD) or month (YYYY-MM) the job was posted; defaults to the most recent data'),
  dateCreatedMin: z.string().optional().describe('Start of a posting date range (YYYY-MM-DD)'),
  dateCreatedMax: z.string().optional().describe('End of a posting date range (YYYY-MM-DD)'),
  hasSalary: z.boolean().optional().describe('Only postings with salary information'),
  isDirect: z.boolean().optional().describe('Only postings that link directly to the employer'),
  isRecruiter: z.boolean().optional().describe('true = only recruiting firms, false = exclude them'),
}

const sortParam = z.enum(['newest', 'oldest']).optional().describe('newest = most recently collected jobs first (recommended), oldest = default API order')

function clean(args: Record<string, unknown>): SearchParams {
  const out: SearchParams = {}
  for (const [k, v] of Object.entries(args)) if (v !== undefined) out[k] = v as string | number | boolean
  return out
}

function text(obj: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(obj, null, 2) }] }
}

export function createServer(client: TechmapClient | undefined) {
  const server = new McpServer({ name: 'techmap-job-postings', version: VERSION })

  const requireClient = () => {
    if (!client) throw new Error('TECHMAP_RAPIDAPI_KEY is not set. Get a free key (1,000 job postings/month) at https://rapidapi.com/techmap-io-techmap-io-default/api/daily-international-job-postings and set it in the MCP server environment.')
    return client
  }

  server.registerTool('search_jobs', {
    title: 'Search job postings',
    description: 'Search Techmap\'s job postings (185 sources, 250 countries, ~8M new postings/month). Returns 10 postings per page with title, company, location, work place, posting date, URL and a shortened description. Each page counts as 10 postings against the caller\'s RapidAPI quota.',
    inputSchema: { ...filters, sort: sortParam, page: z.number().int().min(1).max(100).optional().describe('Result page (10 postings per page), default 1') },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async (args) => {
    const data = await requireClient().search(clean(args))
    return text({
      totalCount: data.totalCount,
      page: data.page,
      pageSize: data.pageSize,
      jobs: (data.result ?? []).map(summarizeJob),
    })
  })

  server.registerTool('count_jobs', {
    title: 'Count job postings',
    description: 'Count job postings matching the filters, e.g. how many remote Python jobs were posted in Germany in a month. Useful for labour market questions without fetching postings.',
    inputSchema: filters,
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async (args) => {
    const data = await requireClient().count(clean(args))
    return text(data)
  })

  server.registerTool('get_rss_feed_url', {
    title: 'Build an RSS job feed URL',
    description: 'Build a URL for Techmap\'s RSS API with the given filters, e.g. to import jobs into job board software (backfill). The URL contains a {YOUR_RAPIDAPI_KEY} placeholder; the key must be subscribed to the Techmap RSS API (free plan: 300 postings/month). No API request is made.',
    inputSchema: filters,
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async (args) => text({ url: rssFeedUrl(clean(args)), docs: 'https://api.techmap.io' }))

  return server
}

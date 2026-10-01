import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { TechmapClient, rssFeedUrl, summarizeJob, type SearchParams } from './client.js'

export const VERSION = '1.0.0'

// Search filters shared by search_jobs, count_jobs and get_rss_feed_url.
// Names match the Jobs API query parameters (https://api.techmap.io).
const filters = {
  countryCode: z.string().length(2).optional().describe('ISO 3166-1 alpha-2 country code of the job location, e.g. "de", "us", "lu"; "##" for postings without a country (mostly remote). Several codes can be combined with commas, e.g. "de,at,ch"'),
  title: z.string().optional().describe('Search in the job title. Comma = OR, prefix + = must contain, prefix - = exclude, quotes = exact phrase, e.g. "data engineer",-senior (exact phrase "data engineer", excluding senior)'),
  occupation: z.string().optional().describe('Occupation stem extracted from the title, e.g. "developer", "nurse"'),
  skills: z.string().optional().describe('Skill or keyword, e.g. "python"; same comma/+/- syntax as title'),
  company: z.string().optional().describe('Hiring company name'),
  city: z.string().optional().describe('City of the workplace'),
  state: z.string().optional().describe('State/region of the workplace'),
  workPlace: z.string().optional().describe('remote, hybrid, onsite, field or offshore (use list_filter_values for all values)'),
  workType: z.string().optional().describe('fulltime, parttime, flextime …'),
  contractType: z.string().optional().describe('permanent, temporary, internship …'),
  industry: z.string().optional().describe('Industry, e.g. "healthcare"'),
  language: z.string().length(2).optional().describe('ISO 639-1 language of the posting, e.g. "en"'),
  dateCreated: z.string().optional().describe('Day (YYYY-MM-DD) or month (YYYY-MM) the job was posted. If neither dateCreated nor dateCreatedMin/Max is set, the API uses the day two days ago (the most recent complete day)'),
  dateCreatedMin: z.string().optional().describe('Start of a posting date range (YYYY-MM-DD); use together with dateCreatedMax'),
  dateCreatedMax: z.string().optional().describe('End of a posting date range (YYYY-MM-DD); use together with dateCreatedMin'),
  hasSalary: z.boolean().optional().describe('Only postings with salary information'),
  isDirect: z.boolean().optional().describe('Only postings that link directly to the employer'),
  isRecruiter: z.boolean().optional().describe('true = only recruiting firms, false = exclude them'),
}

const sortParam = z.enum(['newest', 'oldest']).optional().describe('newest = most recently collected jobs first (default), oldest = stable order for paging through all results')

function clean(args: Record<string, unknown>): SearchParams {
  const out: SearchParams = {}
  for (const [k, v] of Object.entries(args)) if (v !== undefined) out[k] = v as string | number | boolean
  return out
}

// Returns the result as text (for older clients) and as structuredContent
// matching the tool's outputSchema.
function result<T extends Record<string, unknown>>(obj: T) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(obj, null, 2) }], structuredContent: obj }
}

// Classification fields are a string or a list of strings depending on the source.
const textOrList = z.union([z.string(), z.array(z.string())]).optional()

const jobSummary = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  company: z.string().optional(),
  city: textOrList,
  state: textOrList,
  countryCode: textOrList,
  workPlace: textOrList,
  workType: textOrList,
  contractType: textOrList,
  occupation: textOrList,
  industry: textOrList,
  language: textOrList,
  datePosted: z.string().optional(),
  validThrough: z.string().optional(),
  salary: z.unknown().optional().describe('Salary details from the posting, if any'),
  isDirect: z.boolean().optional(),
  isRecruiter: z.boolean().optional(),
  url: z.string().optional(),
  description: z.string().optional().describe('Description shortened to 600 characters'),
}).passthrough()

export function createServer(client: TechmapClient | undefined) {
  const server = new McpServer({ name: 'techmap-job-postings', version: VERSION })

  const requireClient = () => {
    if (!client) throw new Error('TECHMAP_RAPIDAPI_KEY is not set. Get a free key (1,000 job postings/month) at https://rapidapi.com/techmap-io-techmap-io-default/api/daily-international-job-postings and set it in the MCP server environment.')
    return client
  }

  server.registerTool('search_jobs', {
    title: 'Search job postings',
    description: 'Search Techmap\'s job postings (185 sources, 250 countries and territories, ~8M new postings per month) and return up to 10 postings per page, newest first by default. Each posting has title, company, location, work place, contract/work type, posting date, the URL of the original ad and a description shortened to 600 characters; totalCount tells how many postings match in total. Use this to show concrete postings; use count_jobs when only the number is needed. Cost and limits: 1 API request per page, counted as 10 postings against the caller\'s RapidAPI quota (free plan: 1,000 postings per month, 1 request per second). Without a date filter the most recent complete day is searched.',
    inputSchema: { ...filters, sort: sortParam, page: z.number().int().min(1).max(100).optional().describe('Result page (10 postings per page), default 1') },
    outputSchema: {
      totalCount: z.number().optional().describe('Number of postings matching the filters'),
      page: z.number().optional(),
      pageSize: z.number().optional(),
      jobs: z.array(jobSummary),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async (args) => {
    const data = await requireClient().search(clean({ ...args, sort: args.sort ?? 'newest' }))
    return result({
      totalCount: data.totalCount,
      page: data.page,
      pageSize: data.pageSize,
      jobs: (data.result ?? []).map(summarizeJob),
    })
  })

  server.registerTool('count_jobs', {
    title: 'Count job postings',
    description: 'Count the job postings that match the filters and return only the number (totalCount), e.g. how many remote Python jobs were posted in Germany in September 2026. Use this instead of search_jobs for labour market questions, trends or comparisons (call it once per country, month or role to compare); use search_jobs to see the postings themselves. Cost and limits: 1 API request, no postings are delivered; free plan allows 1 request per second. Without a date filter the most recent complete day is counted, so set dateCreated (month) or dateCreatedMin/Max for longer periods.',
    inputSchema: filters,
    outputSchema: {
      totalCount: z.number().optional().describe('Number of postings matching the filters'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async (args) => {
    const data = await requireClient().count(clean(args))
    return result({ totalCount: data.totalCount })
  })

  server.registerTool('get_rss_feed_url', {
    title: 'Build an RSS job feed URL',
    description: 'Build a URL for Techmap\'s RSS API that returns the postings matching the filters as an RSS 2.0 feed, e.g. to import jobs into job board software (backfill) or an RSS reader. Makes no API request and uses no quota: it only returns the URL, with a {YOUR_RAPIDAPI_KEY} placeholder that the user replaces with a key subscribed to the Techmap RSS API (free plan: 300 postings per month). Use search_jobs instead to see postings in this conversation.',
    inputSchema: filters,
    outputSchema: {
      url: z.string().describe('RSS feed URL with a {YOUR_RAPIDAPI_KEY} placeholder'),
      docs: z.string(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async (args) => result({ url: rssFeedUrl(clean(args)), docs: 'https://api.techmap.io' }))

  server.registerTool('list_filter_values', {
    title: 'List values of a filter',
    description: 'List the most common values of a filter field in the job postings of the last 30 days, with the number of postings per value - e.g. which work places, industries or occupations exist, or the top companies, cities or skills. Use it to find exact filter values for search_jobs and count_jobs, or to answer "which companies post the most jobs" style questions. Returns up to "limit" values sorted by count, plus valueCount (number of distinct values). Cost and limits: 1 API request, no postings are delivered; requires a PRO, ULTRA or MEGA plan of the Techmap Jobs API (the free BASIC plan gets HTTP 403).',
    inputSchema: {
      field: z.enum(['workPlace', 'workType', 'contractType', 'careerLevel', 'occupation', 'department', 'industry', 'language', 'locale', 'timezone', 'timezoneOffset', 'countryCode', 'postCode', 'city', 'state', 'skills', 'company']).describe('Filter field whose values to list'),
      limit: z.number().int().min(1).max(500).optional().describe('Maximum number of values to return, sorted by number of postings (default 50)'),
    },
    outputSchema: {
      field: z.string(),
      valueCount: z.number().optional().describe('Number of distinct values in the last 30 days'),
      values: z.array(z.object({ value: z.string(), count: z.number() })).describe('Values with their number of postings, most frequent first'),
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
  }, async ({ field, limit }) => {
    const data = await requireClient().distinct(field)
    const buckets: { key: unknown, doc_count: unknown }[] = Array.isArray(data.values) ? data.values : []
    return result({
      field,
      valueCount: Number(data.valueCount) || buckets.length,
      values: buckets.slice(0, limit ?? 50).map((b) => ({ value: String(b.key), count: Number(b.doc_count) || 0 })),
    })
  })

  return server
}

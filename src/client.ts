// Thin client for Techmap's Jobs API on RapidAPI. The caller brings their own
// RapidAPI key (free plan: 1,000 job postings/month), so this server never
// handles billing.

export const JOBS_API_HOST = 'daily-international-job-postings.p.rapidapi.com'
export const RSS_API_HOST = 'job-postings-rss-feed.p.rapidapi.com'

export type FetchLike = (input: string, init?: { headers?: Record<string, string>, signal?: AbortSignal }) => Promise<{
  ok: boolean,
  status: number,
  text: () => Promise<string>,
}>

export type SearchParams = Record<string, string | number | boolean | undefined>

export class TechmapApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
  }
}

export class TechmapClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike,
    private readonly baseUrl = `https://${JOBS_API_HOST}`,
    private readonly timeoutMs = 30_000,
    private readonly retryDelayMs = 1_100,
  ) {}

  async get(path: string, params: SearchParams): Promise<any> {
    const url = new URL(path, this.baseUrl)
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
    }
    const request = () => this.fetchImpl(url.toString(), {
      headers: { 'X-RapidAPI-Key': this.apiKey, 'X-RapidAPI-Host': JOBS_API_HOST },
      signal: AbortSignal.timeout(this.timeoutMs),
    })
    let res = await request()
    let body = await res.text()
    // The free BASIC plan allows one request per second - retry once.
    if (res.status === 429 && /per second/i.test(body)) {
      await new Promise((r) => setTimeout(r, this.retryDelayMs))
      res = await request()
      body = await res.text()
    }
    if (!res.ok) {
      const hint = res.status === 401 || res.status === 403
        ? ' Check TECHMAP_RAPIDAPI_KEY and that the key is subscribed to the Techmap Jobs API (free plan available at https://rapidapi.com/techmap-io-techmap-io-default/api/daily-international-job-postings).'
        : res.status === 429 ? ' Rate limit or monthly quota reached.' : ''
      throw new TechmapApiError(`Techmap API returned HTTP ${res.status}: ${body.slice(0, 300)}${hint}`, res.status)
    }
    try {
      return JSON.parse(body)
    } catch {
      throw new TechmapApiError(`Techmap API returned non-JSON response: ${body.slice(0, 200)}`)
    }
  }

  search(params: SearchParams) {
    return this.get('/api/v2/jobs/search', params)
  }

  count(params: SearchParams) {
    return this.get('/api/v2/jobs/count', params)
  }
}

// RSS feed URLs carry the key as a query parameter, so we only build them
// with a placeholder and never echo the caller's key back into the chat.
export function rssFeedUrl(params: SearchParams): string {
  const url = new URL(`https://${RSS_API_HOST}/api/rss/v1/jobs_full`)
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') url.searchParams.set(k, String(v))
  }
  url.searchParams.set('rapidapi-key', 'YOUR_RAPIDAPI_KEY')
  return url.toString().replace('YOUR_RAPIDAPI_KEY', '{YOUR_RAPIDAPI_KEY}')
}

// Reduce a job posting to the fields an LLM needs; the full record is large
// (jsonLD, skills, geo data).
export function summarizeJob(job: any) {
  const ld = job?.jsonLD ?? {}
  const desc: string = ld.description ?? ''
  return {
    id: ld.identifier,
    title: job.title ?? ld.title,
    company: job.company ?? ld.hiringOrganization?.name,
    city: job.city,
    state: job.state,
    countryCode: job.countryCode,
    workPlace: job.workPlace,
    workType: job.workType,
    contractType: job.contractType,
    occupation: job.occupation,
    industry: job.industry,
    language: job.language,
    datePosted: ld.datePosted ?? job.dateCreated,
    validThrough: ld.validThrough,
    salary: job.hasSalary ? (ld.baseSalary ?? ld.estimatedSalary ?? true) : undefined,
    isDirect: job.isDirect,
    isRecruiter: job.isRecruiter,
    url: ld.url,
    description: desc.length > 600 ? desc.slice(0, 600) + '…' : desc,
  }
}

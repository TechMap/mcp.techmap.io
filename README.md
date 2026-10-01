# Techmap Job Postings MCP Server

<!-- mcp-name: io.github.TechMap/job-postings -->

[![smithery badge](https://smithery.ai/badge/techmap/job-postings)](https://smithery.ai/servers/techmap/job-postings)

An [MCP](https://modelcontextprotocol.io) server that gives AI assistants and agents access to [Techmap](https://jobdatafeeds.com)'s job postings data: about 8 million new postings per month from 185 sources (company career pages and ATS platforms, job boards, aggregators and public employment offices) in 250 countries and territories, with history since 2020.

Use it to ask things like:

- "Find remote Python developer jobs posted in Germany this week."
- "How many nursing jobs were posted in Austria in September?"
- "Which companies in Luxembourg are hiring controllers?"
- "Build an RSS feed URL for hybrid marketing jobs in the Netherlands for my job board."

## Tools

| Tool | What it does | API requests |
|---|---|---|
| `search_jobs` | Search postings by country, title, occupation, skills, company, city, work place (remote/hybrid/onsite), contract/work type, language, industry, posting date, salary and direct-employer flags. Returns 10 postings per page. | 1 per page |
| `count_jobs` | Count postings that match the same filters - for labour market questions. | 1 |
| `get_rss_feed_url` | Build a filtered RSS feed URL for job board backfill (with a key placeholder). | none |

## Setup

1. Get a RapidAPI key and subscribe to the [Techmap Jobs API](https://rapidapi.com/techmap-io-techmap-io-default/api/daily-international-job-postings). The free BASIC plan includes 1,000 job postings per month (1 request per second); paid usage is $1 per 1,000 postings.
2. Add the server to your MCP client.

**Claude Desktop / Claude Code / Cursor** (`mcpServers` config):

```json
{
  "mcpServers": {
    "techmap-jobs": {
      "command": "npx",
      "args": ["-y", "@techmap/mcp-server"],
      "env": { "TECHMAP_RAPIDAPI_KEY": "your-rapidapi-key" }
    }
  }
}
```

**Claude Code** (CLI):

```bash
claude mcp add techmap-jobs -e TECHMAP_RAPIDAPI_KEY=your-rapidapi-key -- npx -y @techmap/mcp-server
```

**Smithery**: install from [smithery.ai/servers/techmap/job-postings](https://smithery.ai/servers/techmap/job-postings) and enter your RapidAPI key when asked.

Your key stays on your machine; the server only sends it to RapidAPI. Usage is billed by RapidAPI on your own plan.

## More data

- **API documentation and OpenAPI specs:** https://api.techmap.io
- **Daily data feeds and historical datasets per country** (gzipped JSON Lines on AWS Data Exchange): https://jobdatafeeds.com/pricing
- **Free samples:** [Hugging Face](https://huggingface.co/datasets/techmap/job-postings-sample-2023-04), [Kaggle](https://www.kaggle.com/techmap)

## Development

```bash
npm install
npm test          # unit tests with a mocked API
TECHMAP_RAPIDAPI_KEY=... npx @modelcontextprotocol/inspector node build/src/index.js
```

## License

MIT - © Techmap GmbH, Karlsruhe, Germany

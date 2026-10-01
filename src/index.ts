#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { TechmapClient } from './client.js'
import { createServer } from './server.js'

const key = process.env.TECHMAP_RAPIDAPI_KEY?.trim()
const server = createServer(key ? new TechmapClient(key) : undefined)

await server.connect(new StdioServerTransport())

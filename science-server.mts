#!/usr/bin/env node
/** DM-free MCP entry point: independent TIFF/image analysis and optional structures. */
import process from 'node:process';
import {isDirectInvocation} from './lib/runtime/direct_entry.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {startStdioMcpServer} from './lib/runtime/stdio_mcp_server.mjs';
import {createScienceRuntime} from './lib/science/create_science_runtime.mjs';

import type {StdioServerOptions} from './lib/runtime/stdio_mcp_server.mjs';

export function startScienceServer({runtime=createScienceRuntime(),...options}:StdioServerOptions={}){
  return startStdioMcpServer({runtime,serverName:'microscopy-core',serverVersion:'0.1.0',...options});
}
if(isDirectInvocation(import.meta.url))startScienceServer();

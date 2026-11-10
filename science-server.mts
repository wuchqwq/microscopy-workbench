#!/usr/bin/env node
/** DM-free MCP entry point: independent TIFF/image analysis and optional structures. */
import process from 'node:process';
import {readFileSync} from 'node:fs';
import {isDirectInvocation} from './lib/runtime/direct_entry.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {startStdioMcpServer} from './lib/runtime/stdio_mcp_server.mjs';
import {createScienceRuntime} from './lib/science/create_science_runtime.mjs';

import type {StdioServerOptions} from './lib/runtime/stdio_mcp_server.mjs';

export function startScienceServer({runtime=createScienceRuntime(),...options}:StdioServerOptions={}){
  return startStdioMcpServer({runtime,serverName:'microscopy-core',serverVersion:String((JSON.parse(readFileSync(new URL('./package.json',import.meta.url),'utf8')) as {version:string}).version),...options});
}
if(isDirectInvocation(import.meta.url))startScienceServer();

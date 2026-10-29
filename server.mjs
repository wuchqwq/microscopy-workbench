#!/usr/bin/env node
// Compatibility entry for source checkouts; build once with npm ci && npm run build.
import process from 'node:process';
import {isDirectInvocation} from './dist/lib/runtime/direct_entry.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {startMcpServer} from './dist/server.mjs';
export {startMcpServer};
if(isDirectInvocation(import.meta.url))startMcpServer();

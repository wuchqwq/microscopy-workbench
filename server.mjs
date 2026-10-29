#!/usr/bin/env node
// Compatibility entry for source checkouts; build once with npm ci && npm run build.
import process from 'node:process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {startMcpServer} from './dist/server.mjs';
export {startMcpServer};
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))startMcpServer();

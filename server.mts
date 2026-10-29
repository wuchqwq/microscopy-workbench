#!/usr/bin/env node
// Portable default entry, including the no-model Image Panel's stdio client.
// This file never imports the legacy DM composition root.
import process from 'node:process';
import {isDirectInvocation} from './lib/runtime/direct_entry.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {startScienceServer} from './science-server.mjs';
export {startScienceServer as startMcpServer};
if(isDirectInvocation(import.meta.url))startScienceServer();

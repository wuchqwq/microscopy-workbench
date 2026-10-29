#!/usr/bin/env node
// Source-checkout compatibility entry; production implementation is compiled.
import process from 'node:process';
import {isDirectInvocation} from './dist/lib/runtime/direct_entry.mjs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {startScienceServer} from './dist/science-server.mjs';
export {startScienceServer};
if(isDirectInvocation(import.meta.url))startScienceServer();

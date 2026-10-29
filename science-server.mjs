#!/usr/bin/env node
// Source-checkout compatibility entry; production implementation is compiled.
import process from 'node:process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {startScienceServer} from './dist/science-server.mjs';
export {startScienceServer};
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))startScienceServer();

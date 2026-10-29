#!/usr/bin/env node
// Compatibility entry for existing client configurations; business code is compiled.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runPluginCLI} from '../dist/tools/plugin_server.mjs';
export * from '../dist/tools/plugin_server.mjs';
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))runPluginCLI();

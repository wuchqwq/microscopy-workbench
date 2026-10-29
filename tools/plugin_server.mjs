#!/usr/bin/env node
// Compatibility entry for existing client configurations; business code is compiled.
import path from 'node:path';
import {isDirectInvocation} from '../dist/lib/runtime/direct_entry.mjs';
import {fileURLToPath} from 'node:url';
import {runPluginCLI} from '../dist/tools/plugin_server.mjs';
export * from '../dist/tools/plugin_server.mjs';
if(isDirectInvocation(import.meta.url))runPluginCLI();

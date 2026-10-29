import test from 'node:test';
import {startStdioMcpServer} from '../lib/runtime/stdio_mcp_server.mjs';
import {RpcError} from '../lib/runtime/schema.mjs';
import {exerciseStdioContract} from './helpers/stdio-contract-scenarios.mjs';

test('compiled stdio preserves envelopes, IDs, legacy errors, cancellation and close',async()=>{
 await exerciseStdioContract(startStdioMcpServer,RpcError);
});

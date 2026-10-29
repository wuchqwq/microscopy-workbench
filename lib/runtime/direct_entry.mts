// Node resolves ESM module URLs through filesystem aliases on macOS
// (/var -> /private/var) and symbolic links. Compare canonical files, not strings.
import path from 'node:path';
import {realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

/** True only when the running module is the actual CLI entry, not an import. */
export function isDirectInvocation(moduleUrl:string, argvPath:string|undefined=process.argv[1]):boolean {
  if(!argvPath)return false;
  try {
    return realpathSync.native(path.resolve(argvPath))===realpathSync.native(fileURLToPath(moduleUrl));
  } catch {
    // An absent or invalid argv file must not execute an imported CLI.
    return false;
  }
}

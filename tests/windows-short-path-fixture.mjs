// Read-only Win32 path spelling fixture; never changes volume short-name policy.
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import path from 'node:path';
import {realpathSync} from 'node:fs';
export function windowsShortPath(file){
 if(process.platform!=='win32')return null;
 const script=`[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
Add-Type -TypeDefinition 'using System.Text;using System.Runtime.InteropServices;public static class WorkbenchShortPathFixture{[DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]public static extern uint GetShortPathName(string path,StringBuilder buffer,uint size);}'
$source=[Console]::In.ReadToEnd();$buffer=[Text.StringBuilder]::new(32768);$count=[WorkbenchShortPathFixture]::GetShortPathName($source,$buffer,32768);if($count -eq 0){exit 2};[Console]::Write($buffer.ToString())`;
 const result=spawnSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',script],{input:file,encoding:'utf8',windowsHide:true,timeout:15000});
 assert.equal(result.status,0,result.stderr||result.error?.message);const short=result.stdout.trim();assert.ok(path.isAbsolute(short));return path.resolve(short).toLowerCase()===realpathSync.native(file).toLowerCase()?null:short;
}

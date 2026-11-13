#!/usr/bin/env node
// No dependency installation, subprocesses, network, or client configuration writes.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.dirname(fileURLToPath(import.meta.url));
const support = '.microscopy-workbench-references';
const help = `Microscopy scientific Skills installer (Node.js 22 or 24; no Python needed to copy)

microscopy-skills --skills-dir "CLIENT_SKILLS_DIRECTORY" [--dry-run]
microscopy-skills --skills-dir "CLIENT_SKILLS_DIRECTORY" --existing-skills backup
microscopy-skills --list | --version | --help

Copies bundled Skills and portable references only. It does not install the workbench,
Python, Electron, or MCP settings. Existing entries are refused unless you explicitly
request backup. Backups stay beside, not inside, the Skills directory. Close other
installers/editors first. Restart or refresh your agent's skill discovery afterwards.
`;
function exists(p) { try { fs.lstatSync(p); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; } }
function plainDirectory(p) { return fs.lstatSync(p).isDirectory() && !fs.lstatSync(p).isSymbolicLink(); }
function safeParents(p) {
  for (let current = p;; current = path.dirname(current)) {
    if (exists(current) && !plainDirectory(current)) throw new Error(`Directory or parent is a symlink or not a directory: ${current}`);
    if (path.dirname(current) === current) break;
  }
}
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function loadBundle() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  if (manifest.format !== 1 || !Array.isArray(manifest.skills) || manifest.skills.length === 0 ||
      new Set(manifest.skills).size !== manifest.skills.length ||
      manifest.skills.some(n => typeof n !== 'string' || !/^[a-z][a-z0-9-]+$/.test(n))) {
    throw new Error('Invalid bundled Skill manifest');
  }
  const entries = [...manifest.skills, support];
  const known = new Set();
  for (const f of manifest.files) {
    const pieces = f.path.split('/');
    if (pieces.some(p => !p || p === '.' || p === '..' || /[\\:\x00]/.test(p)) ||
        !entries.includes(pieces[0]) || known.has(f.path)) throw new Error('Unsafe or repeated bundle path');
    known.add(f.path);
    const source = path.join(root, 'bundle', ...pieces);
    for (let p = path.dirname(source); p !== root; p = path.dirname(p)) {
      if (!plainDirectory(p)) throw new Error(`Symlink in bundle: ${p}`);
    }
    if (!fs.lstatSync(source).isFile() || fs.lstatSync(source).isSymbolicLink()) throw new Error(`Non-regular bundle file: ${f.path}`);
    if (sha256(fs.readFileSync(source)) !== f.sha256) throw new Error(`Bundle checksum mismatch: ${f.path}`);
  }
  for (const name of manifest.skills) if (!known.has(`${name}/SKILL.md`)) throw new Error(`Missing SKILL.md: ${name}`);
  return { manifest, entries };
}
function parse(args) {
  const opts = { policy: 'fail', dry: false };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run' || arg === '--check') opts.dry = true;
    else if (arg === '--skills-dir' || arg === '--existing-skills') {
      if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`${arg} needs a value`);
      const key = arg === '--skills-dir' ? 'destination' : 'policy';
      if (key === 'destination' && opts.destination) throw new Error('Pass --skills-dir only once');
      opts[key] = args[++i];
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!opts.destination) throw new Error('An explicit --skills-dir is required; use --help');
  if (!['fail', 'backup'].includes(opts.policy)) throw new Error('--existing-skills must be fail or backup');
  return opts;
}
function install(opts, manifest, entries) {
  const requested = path.resolve(opts.destination);
  if (exists(requested) && !plainDirectory(requested)) throw new Error(`Destination is a symlink or not a directory: ${requested}`);
  // Canonicalize existing parents (macOS /var is normally a symlink).
  const missing = [];
  let ancestor = requested;
  while (!exists(ancestor)) { missing.unshift(path.basename(ancestor)); ancestor = path.dirname(ancestor); }
  const dest = path.join(fs.realpathSync(ancestor), ...missing);
  safeParents(dest);
  const conflicts = entries.filter(n => exists(path.join(dest, n)));
  for (const n of conflicts) if (!plainDirectory(path.join(dest, n))) throw new Error(`Refusing non-directory or symlink: ${path.join(dest, n)}`);
  if (conflicts.length && opts.policy !== 'backup') throw new Error(`Existing Skills left untouched: ${conflicts.join(', ')}. Use --existing-skills backup to replace explicitly.`);
  console.log(`Skills ${manifest.skills_version}; installer ${manifest.installer_version}`);
  console.log(`Destination: ${dest}\nSkills: ${manifest.skills.join(', ')}\nFiles: ${manifest.files.length}`);
  if (opts.dry) { console.log('Plan checked. No destination files written.'); return; }
  fs.mkdirSync(dest, { recursive: true });
  // Sibling staging keeps temporary SKILL.md files out of the client's discovery root.
  const stage = fs.mkdtempSync(path.join(path.dirname(dest), `.${path.basename(dest)}.microscopy-stage-`));
  if (process.platform !== 'win32') fs.chmodSync(stage, 0o700);
  const backups = [], installed = [];
  let backupRoot;
  try {
    for (const f of manifest.files) {
      const target = path.join(stage, ...f.path.split('/'));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(root, 'bundle', ...f.path.split('/')), target, fs.constants.COPYFILE_EXCL);
    }
    if (conflicts.length) {
      backupRoot = fs.mkdtempSync(path.join(path.dirname(dest), `.${path.basename(dest)}.microscopy-backup-`));
      if (process.platform !== 'win32') fs.chmodSync(backupRoot, 0o700);
      console.log(`Backup directory: ${backupRoot}`);
    }
    try {
      for (const name of entries) {
        const final = path.join(dest, name);
        if (exists(final)) {
          if (opts.policy !== 'backup' || !backupRoot || !conflicts.includes(name) || !plainDirectory(final)) throw new Error(`Destination changed while installing: ${final}`);
          const backup = path.join(backupRoot, name);
          fs.renameSync(final, backup);
          backups.push([final, backup]);
        }
        fs.renameSync(path.join(stage, name), final);
        installed.push(final);
      }
    } catch (e) {
      // Best-effort rollback for reported errors; process/OS interruption may require manual recovery.
      const recovery = [];
      for (const final of installed.reverse()) { try { fs.rmSync(final, { recursive: true }); } catch (r) { recovery.push(r.message); } }
      for (const [final, backup] of backups.reverse()) { try { fs.renameSync(backup, final); } catch (r) { recovery.push(r.message); } }
      if (recovery.length) throw new Error(`${e.message}\nManual recovery required from ${backupRoot}: ${recovery.join('; ')}`);
      throw e;
    }
  } finally { fs.rmSync(stage, { recursive: true, force: true }); }
  console.log('Installed. Restart or refresh the agent to discover these Skills.');
  console.log('Scientific execution still needs the separately configured workbench/Python tools.');
}
try {
  const args = process.argv.slice(2);
  if (!args.length || (args.length === 1 && ['--help', '-h'].includes(args[0]))) console.log(help);
  else if (args.length === 1 && args[0] === '--version') console.log(JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version);
  else {
    const { manifest, entries } = loadBundle();
    if (args.length === 1 && args[0] === '--list') console.log(manifest.skills.join('\n'));
    else install(parse(args), manifest, entries);
  }
} catch (error) {
  console.error(`Installation stopped: ${error.message}`);
  process.exitCode = 1;
}

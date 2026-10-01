#!/usr/bin/env node
/**
 * Module boundary check (no dependencies).
 *
 * Rules (so every product module can be sold / enabled independently):
 *  1. A module may NOT import from another module:  src/modules/a  ->  src/modules/b   ✗
 *  2. core/ and shared/ may NOT import from modules/
 *     (exception: core/modules/registry.ts may import each module's manifest.ts)
 *  3. shared/ may NOT import from core/ (keep shared UI generic)
 *
 * Usage: npm run check:boundaries
 */
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd(), 'src');
const exts = ['.ts', '.tsx'];
const violations = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (exts.includes(path.extname(entry.name))) check(full);
  }
}

/** Returns path relative to src/ (posix) for an import specifier, or null for packages. */
function resolveImport(fromFile, spec) {
  if (spec.startsWith('@/')) return spec.slice(2);
  if (spec.startsWith('.')) {
    return path.relative(root, path.resolve(path.dirname(fromFile), spec)).split(path.sep).join('/');
  }
  return null;
}

const area = (rel) => {
  const [top, name] = rel.split('/');
  return top === 'modules' ? `modules/${name}` : top;
};

function check(file) {
  const rel = path.relative(root, file).split(path.sep).join('/');
  const from = area(rel);
  const src = fs.readFileSync(file, 'utf8');
  const re = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m;
  while ((m = re.exec(src))) {
    const spec = m[1] ?? m[2];
    const target = resolveImport(file, spec);
    if (!target) continue;
    const to = area(target);
    if (from === to) continue;

    const isManifest = /^modules\/[^/]+\/manifest(\.tsx?)?$/.test(target);
    let problem = null;
    if (from.startsWith('modules/') && to.startsWith('modules/')) problem = 'module imports another module';
    else if ((from === 'core' || from === 'shared') && to.startsWith('modules/')) {
      if (!(rel === 'core/modules/registry.ts' && isManifest)) problem = `${from}/ imports a module`;
    } else if (from === 'shared' && to === 'core') problem = 'shared/ imports core/';

    if (problem) violations.push(`${rel}: ${problem} -> '${spec}'`);
  }
}

walk(root);

if (violations.length) {
  console.error(`\n✗ Module boundary violations (${violations.length}):\n`);
  violations.forEach((v) => console.error('  - ' + v));
  console.error('\nMove shared code to src/shared or src/core, or call the other module through the API.\n');
  process.exit(1);
}
console.log('✓ Module boundaries OK');

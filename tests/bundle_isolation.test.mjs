import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

function walkSourceFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkSourceFiles(fullPath));
    } else if (/\.(ts|tsx|js|jsx|mjs)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

function isUseClientFile(content) {
  // Check leading directive (ignoring comments/whitespace)
  const stripped = content.replace(/^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*/, '');
  return /^['"]use client['"]\s*;?/.test(stripped);
}

function findRuntimeMockStoreImports(content) {
  const violations = [];

  // 1. Static single import statements referencing mockStore (cannot span across `;`)
  const importRegex =
    /(?:^|\n)\s*import\s+((?:type\s+)?(?:\*\s+as\s+[\w$]+|\{[^}]*\}|[\w$]+(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+[\w$]+))?))\s+from\s+(['"])([^'"]*mockStore[^'"]*)\2/g;
  for (const match of content.matchAll(importRegex)) {
    const clause = match[1].trim();
    const specifier = match[3];

    // `import type ...` is stripped at compile time and safe
    if (/^type\s+/.test(clause)) {
      continue;
    }

    // Named-only import where every specifier is `type X` is also compile-time only
    const namedOnly = clause.match(/^\{([\s\S]*)\}$/);
    if (namedOnly) {
      const items = namedOnly[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (items.length > 0 && items.every((s) => /^type\s+/.test(s))) {
        continue;
      }
    }

    violations.push(`runtime import from "${specifier}": import ${clause}`);
  }

  // 2. Side-effect, dynamic import(), or require() referencing mockStore
  const dynamicOrSideEffectRegex = /(?:import\s*\(\s*|require\s*\(\s*|^\s*import\s+)(['"])([^'"]*mockStore[^'"]*)\1/gm;
  for (const match of content.matchAll(dynamicOrSideEffectRegex)) {
    violations.push(`dynamic/side-effect reference to "${match[2]}"`);
  }

  return violations;
}

test('No "use client" module has a runtime import from @/lib/mockStore', () => {
  const srcDir = path.join(projectRoot, 'src');
  const allFiles = walkSourceFiles(srcDir);
  const clientFiles = allFiles.filter((f) => isUseClientFile(fs.readFileSync(f, 'utf8')));

  assert.ok(clientFiles.length > 0, 'Expected to inspect at least one "use client" module');

  const allViolations = [];
  for (const file of clientFiles) {
    const content = fs.readFileSync(file, 'utf8');
    const violations = findRuntimeMockStoreImports(content);
    if (violations.length > 0) {
      allViolations.push(`${path.relative(projectRoot, file)}: ${violations.join('; ')}`);
    }
  }

  assert.deepEqual(
    allViolations,
    [],
    `Found forbidden runtime mockStore imports in client modules:\n${allViolations.join('\n')}`
  );
});

test('AuthContext uses client-safe orgDefaults instead of mockStore', () => {
  const authCtxSrc = fs.readFileSync(
    path.join(projectRoot, 'src/context/AuthContext.tsx'),
    'utf8'
  );
  assert.match(authCtxSrc, /from ['"]@\/lib\/auth\/orgDefaults['"]/);
  assert.doesNotMatch(authCtxSrc, /from ['"]@\/lib\/mockStore['"]/);
});

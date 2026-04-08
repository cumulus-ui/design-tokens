#!/usr/bin/env tsx
/**
 * generate.ts
 *
 * Reads @cloudscape-design/design-tokens and generates clean, hash-free token
 * files: tokens.css, index.js, and index.d.ts.
 *
 * Cloudscape uses content-hashed CSS property names (e.g. --color-text-body-default-vvtq8u)
 * for versioning and collision avoidance in their React ecosystem. Cumulus strips these
 * hashes entirely — our CSS properties use the canonical token names directly
 * (e.g. --color-text-body-default). See README.md for the rationale.
 *
 * Source data:
 *   - index-visual-refresh.json: canonical token names with { light, dark } values
 *   - index.js: used only to discover which tokens exist (we extract names by stripping hashes)
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');
const DT_DIR = resolve(PKG_ROOT, 'node_modules/@cloudscape-design/design-tokens');

// ─── 1. Discover token names from upstream JS ─────────────────

function parseTokenNames(): string[] {
  const js = readFileSync(resolve(DT_DIR, 'index.js'), 'utf-8');
  const re = /var\(--([a-z0-9-]+),\s*[^)]+\)/g;
  const names: string[] = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;
  while ((m = re.exec(js)) !== null) {
    const hashedName = m[1];
    // Strip the 6-char hash suffix to get the canonical token name
    const lastDash = hashedName.lastIndexOf('-');
    const tokenName = hashedName.slice(0, lastDash);
    if (!seen.has(tokenName)) {
      seen.add(tokenName);
      names.push(tokenName);
    }
  }

  return names;
}

// ─── 2. Parse light/dark values from JSON ─────────────────────

interface TokenValues {
  light: string;
  dark: string;
}

function parseTokenValues(): Record<string, TokenValues> {
  const json = JSON.parse(readFileSync(resolve(DT_DIR, 'index-visual-refresh.json'), 'utf-8'));
  const result: Record<string, TokenValues> = {};

  for (const [name, def] of Object.entries(json.tokens) as [string, any][]) {
    if (!def.$value) continue;
    const v = def.$value;
    if (typeof v === 'string') {
      result[name] = { light: v, dark: v };
    } else if (typeof v.light === 'string') {
      result[name] = { light: v.light, dark: v.dark };
    } else if (typeof v.comfortable === 'string') {
      result[name] = { light: v.comfortable, dark: v.comfortable };
    } else if (typeof v.default === 'string') {
      result[name] = { light: v.default, dark: v.default };
    }
  }

  return result;
}

// ─── 3. Generate CSS + JS ─────────────────────────────────────

function kebabToCamel(s: string): string {
  return s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function generate(): void {
  const tokenNames = parseTokenNames();
  const values = parseTokenValues();

  const lightLines: string[] = [];
  const darkLines: string[] = [];
  const jsLines: string[] = [];
  const dtsLines: string[] = [];
  let matched = 0;
  let skipped = 0;

  for (const tokenName of tokenNames) {
    const val = values[tokenName];
    if (!val) {
      skipped++;
      continue;
    }
    matched++;

    // CSS: clean names, no hashes
    lightLines.push(`  --${tokenName}: ${val.light};`);
    if (val.dark !== val.light) {
      darkLines.push(`  --${tokenName}: ${val.dark};`);
    }

    // JS: var() references without fallbacks — tokens.css must be loaded
    const camelName = kebabToCamel(tokenName);
    jsLines.push(`export const ${camelName} = "var(--${tokenName})";`);
    dtsLines.push(`export declare const ${camelName}: string;`);
  }

  const css = [
    '/* AUTO-GENERATED from @cloudscape-design/design-tokens — DO NOT EDIT',
    ' * License: see /NOTICE',
    ' */',
    `/* ${matched} tokens, ${darkLines.length} dark overrides */`,
    '',
    ':root {',
    ...lightLines,
    '}',
    '',
    '.awsui-dark-mode {',
    ...darkLines,
    '}',
    '',
  ].join('\n');

  const js = [
    '// AUTO-GENERATED from @cloudscape-design/design-tokens — DO NOT EDIT',
    '// License: see /NOTICE',
    ...jsLines,
    '',
  ].join('\n');

  const dts = [
    '// AUTO-GENERATED from @cloudscape-design/design-tokens — DO NOT EDIT',
    '// License: see /NOTICE',
    ...dtsLines,
    '',
  ].join('\n');

  writeFileSync(resolve(PKG_ROOT, 'tokens.css'), css);
  writeFileSync(resolve(PKG_ROOT, 'index.js'), js);
  writeFileSync(resolve(PKG_ROOT, 'index.d.ts'), dts);

  console.log(`✓ Generated tokens.css, index.js, index.d.ts`);
  console.log(`  Tokens: ${matched} (${skipped} skipped)`);
  console.log(`  Dark overrides: ${darkLines.length}`);
}

generate();

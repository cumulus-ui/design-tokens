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

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');
const DT_DIR = resolve(PKG_ROOT, 'node_modules/@cloudscape-design/design-tokens');
const STYLES_CSS = resolve(PKG_ROOT, '../styles/index.css');
const COMPONENTS_SRC = resolve(PKG_ROOT, '../components/src');

// ─── 1. Discover token names from upstream JS ─────────────────

function parseTokenNames(): { names: string[]; hashMap: Map<string, string> } {
  const js = readFileSync(resolve(DT_DIR, 'index.js'), 'utf-8');
  const re = /var\(--([a-z0-9-]+),\s*[^)]+\)/g;
  const names: string[] = [];
  const hashMap = new Map<string, string>();
  const seen = new Set<string>();

  let m: RegExpExecArray | null;
  while ((m = re.exec(js)) !== null) {
    const hashedName = m[1];
    const lastDash = hashedName.lastIndexOf('-');
    const tokenName = hashedName.slice(0, lastDash);
    hashMap.set(hashedName, tokenName);
    if (!seen.has(tokenName)) {
      seen.add(tokenName);
      names.push(tokenName);
    }
  }

  // Also extract hashed names from styles/index.css for component-internal tokens
  const stylesCss = readFileSync(STYLES_CSS, 'utf-8');
  const cssRe = /--([a-z][a-z0-9-]+-[a-z0-9]{5,7})(?=:|,|\))/g;
  while ((m = cssRe.exec(stylesCss)) !== null) {
    const hashedName = m[1];
    if (!hashMap.has(hashedName)) {
      const lastDash = hashedName.lastIndexOf('-');
      const tokenName = hashedName.slice(0, lastDash);
      hashMap.set(hashedName, tokenName);
    }
  }

  return { names, hashMap };
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

// ─── 3. Find component-internal tokens missing from the public JSON ───

let _hashMap: Map<string, string>;

function dehashValue(value: string): string {
  return value.replace(/--([a-z][a-z0-9-]+)/g, (match, name) => {
    const clean = _hashMap.get(name);
    return clean ? `--${clean}` : match;
  });
}

function findMissingTokens(knownTokens: Set<string>): Record<string, TokenValues> {
  const referencedTokens = new Set<string>();

  function scanDir(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        scanDir(join(dir, entry.name));
      } else if (entry.name.endsWith('.ts')) {
        const content = readFileSync(join(dir, entry.name), 'utf-8');
        const re = /var\(--([a-z][a-z0-9-]*?)(?:,|\))/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(content)) !== null) {
          referencedTokens.add(m[1]);
        }
      }
    }
  }

  scanDir(COMPONENTS_SRC);

  const missing = new Set<string>();
  for (const token of referencedTokens) {
    if (!knownTokens.has(token)) {
      missing.add(token);
    }
  }

  if (missing.size === 0) return {};

  const stylesCss = readFileSync(STYLES_CSS, 'utf-8');
  const result: Record<string, TokenValues> = {};

  for (const tokenName of missing) {
    const re = new RegExp(`--${tokenName}-[a-z0-9]{6}:\\s*([^;]+)`, 'g');
    const matches: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(stylesCss)) !== null) {
      matches.push(m[1].trim());
    }

    if (matches.length >= 2) {
      result[tokenName] = { light: dehashValue(matches[0]), dark: dehashValue(matches[1]) };
    } else if (matches.length === 1) {
      result[tokenName] = { light: dehashValue(matches[0]), dark: dehashValue(matches[0]) };
    }
  }

  return result;
}

// ─── 4. Generate CSS + JS ─────────────────────────────────────

function kebabToCamel(s: string): string {
  return s.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
}

function generate(): void {
  const { names: tokenNames, hashMap } = parseTokenNames();
  _hashMap = hashMap;
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

  const knownTokens = new Set(tokenNames.filter(n => values[n]));
  const missingTokens = findMissingTokens(knownTokens);

  const allTokenValues = { ...values, ...Object.fromEntries(
    Object.entries(missingTokens).map(([k, v]) => [k, v])
  )};

  let resolvedMore = true;
  while (resolvedMore) {
    resolvedMore = false;
    const allDefined = new Set([...knownTokens, ...Object.keys(missingTokens)]);
    const allValues = [...Object.values(allTokenValues)];
    const refsInValues = new Set<string>();
    for (const v of allValues) {
      const re = /var\(--([a-z][a-z0-9-]*?)(?:,|\))/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(v.light + ' ' + v.dark)) !== null) {
        if (!allDefined.has(m[1])) refsInValues.add(m[1]);
      }
    }
    if (refsInValues.size > 0) {
      const stylesCss = readFileSync(STYLES_CSS, 'utf-8');
      for (const tokenName of refsInValues) {
        const re = new RegExp(`--${tokenName}-[a-z0-9]{6}:\\s*([^;]+)`, 'g');
        const matches: string[] = [];
        let m: RegExpExecArray | null;
        while ((m = re.exec(stylesCss)) !== null) {
          matches.push(m[1].trim());
        }
        if (matches.length >= 2) {
          missingTokens[tokenName] = { light: dehashValue(matches[0]), dark: dehashValue(matches[1]) };
          allTokenValues[tokenName] = missingTokens[tokenName];
          resolvedMore = true;
        } else if (matches.length === 1) {
          missingTokens[tokenName] = { light: dehashValue(matches[0]), dark: dehashValue(matches[0]) };
          allTokenValues[tokenName] = missingTokens[tokenName];
          resolvedMore = true;
        }
      }
    }
  }

  for (const [tokenName, val] of Object.entries(missingTokens)) {
    lightLines.push(`  --${tokenName}: ${val.light};`);
    if (val.dark !== val.light) {
      darkLines.push(`  --${tokenName}: ${val.dark};`);
    }
    const camelName = kebabToCamel(tokenName);
    jsLines.push(`export const ${camelName} = "var(--${tokenName})";`);
    dtsLines.push(`export declare const ${camelName}: string;`);
    matched++;
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

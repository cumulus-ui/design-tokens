#!/usr/bin/env tsx
/**
 * generate.ts
 *
 * Reads @cloudscape-design/design-tokens and generates a single tokens.css file
 * with CSS custom properties for light mode (:root) and dark mode (.awsui-dark-mode).
 *
 * The Cloudscape design-tokens package provides:
 *   - index-visual-refresh.json: token names with { light, dark } values
 *   - index.js: JS exports with hashed CSS property names (e.g. --color-text-body-default-vvtq8u)
 *
 * We need both: the JSON for light/dark values, the JS for the hash-suffixed property names.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..');
const DT_DIR = resolve(PKG_ROOT, 'node_modules/@cloudscape-design/design-tokens');

// ─── 1. Parse hashed CSS property names from index.js ─────────

interface PropertyMapping {
  /** e.g. "color-charts-red-300" */
  tokenName: string;
  /** e.g. "color-charts-red-300-2k7eul" */
  cssProperty: string;
}

function parsePropertyMappings(): PropertyMapping[] {
  const js = readFileSync(resolve(DT_DIR, 'index.js'), 'utf-8');
  const re = /var\(--([a-z0-9-]+),\s*[^)]+\)/g;
  const mappings: PropertyMapping[] = [];
  const seen = new Set<string>();

  let m: RegExpExecArray | null;
  while ((m = re.exec(js)) !== null) {
    const cssProperty = m[1];
    if (seen.has(cssProperty)) continue;
    seen.add(cssProperty);
    const lastDash = cssProperty.lastIndexOf('-');
    const tokenName = cssProperty.slice(0, lastDash);
    mappings.push({ tokenName, cssProperty });
  }

  return mappings;
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
  const mappings = parsePropertyMappings();
  const values = parseTokenValues();

  const lightLines: string[] = [];
  const darkLines: string[] = [];
  const jsLines: string[] = [];
  const dtsLines: string[] = [];
  let matched = 0;
  let skipped = 0;

  for (const { tokenName, cssProperty } of mappings) {
    const val = values[tokenName];
    if (!val) {
      skipped++;
      continue;
    }
    matched++;
    lightLines.push(`  --${cssProperty}: ${val.light};`);
    if (val.dark !== val.light) {
      darkLines.push(`  --${cssProperty}: ${val.dark};`);
    }

    const camelName = kebabToCamel(tokenName);
    const varExpr = `var(--${cssProperty}, ${val.light})`;
    jsLines.push(`export const ${camelName} = "${varExpr}";`);
    dtsLines.push(`export declare const ${camelName}: string;`);
  }

  const css = [
    '/* AUTO-GENERATED from @cloudscape-design/design-tokens — DO NOT EDIT */',
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
    ...jsLines,
    '',
  ].join('\n');

  const dts = [
    '// AUTO-GENERATED from @cloudscape-design/design-tokens — DO NOT EDIT',
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

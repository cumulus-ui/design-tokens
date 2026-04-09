import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = resolve(import.meta.dirname, '..', '..');
const DIST = resolve(ROOT, 'dist');

beforeAll(() => {
  execSync('npx tsx scripts/generate.ts', { cwd: ROOT });
});

const css = () => readFileSync(resolve(DIST, 'tokens.css'), 'utf-8');

describe('tokens.css', () => {
  it('has balanced parentheses', () => {
    const text = css();
    expect(text.split('(').length).toBe(text.split(')').length);
  });

  it('has balanced curly braces', () => {
    const text = css();
    expect(text.split('{').length).toBe(text.split('}').length);
  });

  it('has :root block', () => {
    expect(css()).toContain(':root {');
  });

  it('has :root.awsui-dark-mode block (not bare .awsui-dark-mode)', () => {
    const text = css();
    expect(text).toContain(':root.awsui-dark-mode {');
    expect(text).not.toMatch(/^\.awsui-dark-mode\s*\{/m);
  });

  it('dark block has color overrides', () => {
    const dark = css().split(':root.awsui-dark-mode')[1];
    expect(dark).toContain('--color-background-layout-main');
    expect(dark).toContain('--color-text-body-default');
  });

  it('has no unclosed var() references', () => {
    const unclosed = css().match(/var\(--[^)]*;/g) || [];
    expect(unclosed).toHaveLength(0);
  });

  it('has no { inside token values', () => {
    const lines = css().split('\n').filter(l => l.trim().startsWith('--'));
    const bad = lines.filter(l => {
      const value = l.split(':').slice(1).join(':');
      return value.includes('{');
    });
    expect(bad).toHaveLength(0);
  });

  it('has no component-internal --awsui-style-* tokens', () => {
    expect(css()).not.toContain('--awsui-style-');
    expect(css()).not.toContain('--awsui-alert-');
    expect(css()).not.toContain('--awsui-slider-');
    expect(css()).not.toContain('--awsui-spinner-');
  });

  it('has no spacing tokens in dark mode block', () => {
    const dark = css().split(':root.awsui-dark-mode')[1] || '';
    expect(dark).not.toMatch(/--space-scaled/);
    expect(dark).not.toMatch(/--space-grid-gutter/);
  });

  it('has public JSON tokens (color)', () => {
    expect(css()).toContain('--color-background-layout-main:');
    expect(css()).toContain('--color-text-body-default:');
  });

  it('has public JSON tokens (spacing, border, font)', () => {
    expect(css()).toContain('--font-size-body-m:');
    expect(css()).toContain('--border-radius-tiles:');
  });

  it('has tokens only found in base-component CSS', () => {
    expect(css()).toContain('--color-border-divider-default:');
    expect(css()).toContain('--color-background-container-content:');
  });

  it('has tokens only found in individual component CSS', () => {
    expect(css()).toContain('--space-layout-content-horizontal:');
  });

  it('has tokens from nested component subdirectories', () => {
    expect(css()).toContain('--shadow-panel:');
  });
});

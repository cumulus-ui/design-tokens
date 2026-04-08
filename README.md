# @cumulus-ui/design-tokens

CSS custom properties for Cumulus UI — light and dark mode tokens generated from Cloudscape Design System.

## Install

```bash
npm install @cumulus-ui/design-tokens
```

## Usage

### CSS

Load the token stylesheet once in your application entry point:

```js
import '@cumulus-ui/design-tokens/tokens.css';
```

Then use tokens as CSS custom properties anywhere:

```css
.my-component {
  color: var(--color-text-body-default);
  background: var(--color-background-layout-main);
  border-radius: var(--border-radius-container);
}
```

### JavaScript / TypeScript

For inline styles or JS-driven styling, import named token constants:

```js
import { colorTextBodyDefault, colorBackgroundLayoutMain } from '@cumulus-ui/design-tokens';

element.style.color = colorTextBodyDefault; // → "var(--color-text-body-default)"
```

### Dark mode

Tokens respond to the `.awsui-dark-mode` class on `<html>`:

```js
// Enable dark mode
document.documentElement.classList.add('awsui-dark-mode');

// Disable dark mode
document.documentElement.classList.remove('awsui-dark-mode');
```

All token values update automatically — no additional imports or class changes needed.

## Token naming

Tokens follow the Cloudscape [CTI naming convention](https://cloudscape.design/foundation/visual-foundation/design-tokens/) (Category → Type → Item → State):

```
--color-background-button-primary-default
  │       │         │       │       └─ state
  │       │         │       └───────── sub-item
  │       │         └───────────────── item
  │       └─────────────────────────── type
  └─────────────────────────────────── category
```

## Design decisions

### No hashed variable names

Cloudscape uses content-hashed suffixes on CSS custom property names (e.g. `--color-text-body-default-vvtq8u`). The hash is an MD5 digest of the token's value set, designed to signal version changes and discourage direct CSS usage in their React ecosystem.

Cumulus strips these hashes. Our CSS properties use canonical token names directly:

```css
/* Cloudscape */
var(--color-text-body-default-vvtq8u, #0f141a)

/* Cumulus */
var(--color-text-body-default, #0f141a)
```

**Why:** Hashed names provide collision avoidance and version signaling, but at the cost of developer experience. Every other web component design system (Shoelace, Spectrum, Carbon, Vaadin) uses clean, human-readable names. Since Cumulus owns both the token definitions and the component CSS, we can guarantee name-value consistency through our generation pipeline rather than encoding it in variable names. See the full rationale below.

**What Cloudscape's hashes solve and how we address each:**

| Cloudscape concern | Hash solution | Cumulus alternative |
|---|---|---|
| Value changes break silently | Hash changes → loud CSS failure | We regenerate tokens + components in the same release |
| Direct CSS usage discouraged | Names are unmemorable | Direct CSS usage is encouraged — clean names are the API |
| Multi-theme collision | Different hashes per theme | Not applicable; single-theme with light/dark mode |

### No namespace prefix

Unlike other design systems (`--sl-`, `--cds-`, `--spectrum-`), Cumulus tokens have no prefix. The CTI naming convention produces specific enough names (`--color-background-button-primary-default`) that collisions are impractical. If a prefix becomes necessary (e.g. for multi-system pages), it can be added to the generator with a one-line change.

### No fallbacks in JS exports

The JavaScript token exports contain `var()` references without fallback values:

```js
export const colorTextBodyDefault = "var(--color-text-body-default)";
// NOT: "var(--color-text-body-default, #0f141a)"
```

This is intentional. If `tokens.css` is not loaded, things should break visibly rather than silently rendering light-mode-only values. Component CSS retains inline fallbacks as a safety net for Shadow DOM isolation.

## Regenerating

Tokens are auto-generated from `@cloudscape-design/design-tokens`:

```bash
npm run generate
```

This reads the upstream JSON (token names + light/dark values) and JS (to discover the token set), then outputs `tokens.css`, `index.js`, and `index.d.ts` with clean names.

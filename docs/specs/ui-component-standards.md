# UI Component Standards

**Created:** 2026-04-08
**Applies to:** All tools and platform components in the 0xKudo Security Toolkit

> **See also:** [`ui-desktop-mobile.md`](ui-desktop-mobile.md) — mobile/desktop split rules
> [`ui-improvements.md`](ui-improvements.md) — pending polish items
>
> This spec defines the exact values, patterns, and rules for every recurring UI element.
> When building or editing any component, use this as the source of truth — not the existing
> code of a random tool. If something in code contradicts this spec, the spec wins and the
> code should be updated.

---

## Design Tokens (CSS Variables)

All values come from `platform/shell/src/styles/theme.css`. Never hardcode colors, fonts, or spacing.

### Colors

| Variable | Dark value | Light value | Use |
|---|---|---|---|
| `--bg-primary` | `#111110` | `#faf8f5` | Page background, inputs, code blocks |
| `--bg-surface` | `#1a1917` | `#ffffff` | Header bars, sidebars, tab rows, panels |
| `--bg-sidebar` | `#0e0d0c` | `#f0ece6` | Navigation sidebars only |
| `--bg-panel` | `#161514` | `#f5f2ee` | Secondary panels, nested sections |
| `--border` | `#1f1e1c` | `#e0d8cc` | All borders |
| `--border-subtle` | `#181715` | `#ece4d8` | Dividers inside panels, table rows |
| `--text-primary` | `#e8e6e3` | `#1a1714` | Body text, input values, active non-amber elements |
| `--text-muted` | `#6e6b68` | `#8a8078` | Labels, placeholders, inactive tabs, secondary info |
| `--text-subtle` | `#4a4845` | `#b0a89e` | De-emphasized hints |
| `--accent-amber` | `#d97706` | `#d97706` | Active tab underline, active tab text, highlights |
| `--btn-primary-bg` | `#e8e6e3` | `#1a1714` | Primary button background |
| `--btn-primary-text` | `#111110` | `#faf8f5` | Primary button text |

### Severity Colors (use only for security severity context)

| Variable | Value | Use |
|---|---|---|
| `--severity-critical` | `#ef4444` | Critical alerts, errors, destructive actions |
| `--severity-high` | `#d97706` | High severity, warnings |
| `--severity-medium` | `#ca8a04` | Medium severity |
| `--severity-low` | `#16a34a` | Low severity, success states |
| `--severity-info` | `#60a5fa` | Informational |

### Typography

| Variable | Value |
|---|---|
| `--font` | `'Fira Code', 'Consolas', 'Monaco', monospace` |

**Rules:**
- `--font` is the only font variable. Never use `--font-mono`, `--font-sans`, or any other.
- All text in the app uses `--font` — no system fonts, no sans-serif.
- Base weight is **500** (set globally on `body`, `button`, `input`, `select`, `textarea`, `label`).
- Never use `fontWeight: 'bold'` anywhere. Never use weight 700.
- For emphasis within text, use `color: var(--text-primary)` vs `color: var(--text-muted)` contrast instead of bold.
- Always set `fontFamily: 'var(--font)'` explicitly on `<button>` style objects — browsers don't inherit font from `body` for interactive elements, even with the global CSS reset.

---

## Spacing Scale

| Name | Value | Use |
|---|---|---|
| xs | `4px` | Icon gaps, tight badge padding |
| sm | `6px` | Input padding (vertical), small gaps |
| md | `8px–10px` | Input padding (horizontal), label gaps |
| lg | `12px` | Section gaps, button padding horizontal |
| xl | `16px–20px` | Section margins, content padding |
| page | `24px` | App.jsx wrapper padding — the baseline for the negative margin escape pattern |

---

## Tool Page Structure

Every tool follows this exact structure. The reference implementation is `tools/payload-generator/client/index.jsx`.

### Container

```js
container: { padding: 0 }
```

Never use `maxWidth` on the container. The tool fills its content area.

### Header Bar (non-tab tools)

```js
header: {
  margin: '-24px -24px 20px -24px',  // escapes App.jsx 24px wrapper, 20px bottom gap
  padding: '12px 20px',
  borderBottom: '1px solid var(--border)',
  background: 'var(--bg-surface)',
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
}
```

### Header Bar (tab tools — header sits directly above tabs with no gap)

```js
header: {
  margin: '-24px -24px 0 -24px',   // 0 bottom — tabs follow immediately
  padding: '12px 20px',
  borderBottom: '1px solid var(--border)',
  background: 'var(--bg-surface)',
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
}
```

### Title

```js
title: {
  fontSize: '13px',
  color: 'var(--text-primary)',
  letterSpacing: '0.02em',
  margin: 0,
  fontWeight: 'normal',
}
```

Always use `<span>` — never `<h1>`, `<h2>`, or any heading tag. Heading tags apply browser bold and size defaults that override inline styles.

### Subtitle

```js
subtitle: { color: 'var(--text-muted)', fontSize: '11px', margin: 0 }
```

Use `<p>` or `<span>`. Keep to one line if possible.

### Tab Row (when tool has tabs)

```js
tabs: {
  display: 'flex',
  borderBottom: '1px solid var(--border)',
  background: 'var(--bg-surface)',
  margin: '0 -24px',       // escapes App.jsx wrapper horizontally
  paddingLeft: '8px',      // 8px + 12px tab padding = 20px, aligns with header text
  marginBottom: '20px',    // gap between tabs and content
}
```

### Tab Button

```js
tab: (active) => ({
  padding: '4px 12px',
  fontSize: '11px',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  cursor: 'pointer',
  color: active ? 'var(--accent-amber)' : 'var(--text-muted)',
  borderBottom: active ? '2px solid var(--accent-amber)' : '2px solid transparent',
  background: 'none',
  border: 'none',
  borderBottomWidth: '2px',
  borderBottomStyle: 'solid',
  borderBottomColor: active ? 'var(--accent-amber)' : 'transparent',
  fontFamily: 'var(--font)',
  marginBottom: '-1px',
})
```

Active tab: amber text + amber underline. This applies everywhere — tools, SIEM Configuration, SIEM nav, all tabs across the entire app.

---

## Form Controls

### Label (above an input)

```js
label: {
  color: 'var(--text-muted)',
  fontSize: '10px',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: '4px',
  display: 'block',
}
```

Use `<span>` with `display: 'block'`, not `<label>` unless wrapping a checkbox/radio.

### Text Input

```js
input: {
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font)',
  fontSize: '12px',
  padding: '6px 10px',
  outline: 'none',
}
```

No `borderRadius`. No box shadows.

### Textarea

```js
textarea: {
  width: '100%',
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font)',
  fontSize: '12px',
  padding: '6px 10px',
  resize: 'vertical',
  outline: 'none',
  boxSizing: 'border-box',
}
```

Set `minHeight` per tool context (e.g. `'80px'`, `'160px'`).

### Select / Dropdown

```js
select: {
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font)',
  fontSize: '12px',
  padding: '6px 10px',
  outline: 'none',
}
```

### Primary Button

```js
button: (disabled) => ({
  background: disabled ? 'var(--bg-surface)' : 'var(--btn-primary-bg)',
  color: disabled ? 'var(--text-muted)' : 'var(--btn-primary-text)',
  border: '1px solid var(--border)',
  fontFamily: 'var(--font)',
  fontSize: '11px',
  padding: '8px 20px',
  cursor: disabled ? 'not-allowed' : 'pointer',
})
```

No `borderRadius`. No background gradients. No shadows. Weight is inherited from the global reset (500).

### Secondary / Ghost Button

```js
secondaryBtn: {
  background: 'none',
  border: '1px solid var(--border)',
  color: 'var(--text-muted)',
  fontFamily: 'var(--font)',
  fontSize: '11px',
  padding: '6px 14px',
  cursor: 'pointer',
}
```

### Checkbox Label Wrapper

```js
checkItem: {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  color: 'var(--text-primary)',
  fontSize: '13px',
  cursor: 'pointer',
  fontWeight: 'normal',
  fontFamily: 'var(--font)',
}
```

`fontWeight: 'normal'` and `fontFamily` are required — `<label>` elements do not inherit these from `body`.

### Error Message

```js
error: {
  color: 'var(--severity-critical)',
  fontSize: '13px',
  marginTop: '12px',
}
```

Use `<p>` tag.

### Section Label (within results/output)

```js
sectionLabel: {
  color: 'var(--text-muted)',
  fontSize: '10px',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginBottom: '4px',
}
```

### Result / Output Panel

```js
resultsPanel: {
  marginTop: '24px',
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  padding: '20px',
}
```

---

## SIEM Component Structure

### Title Bar (all SIEM views)

```js
titleBar: {
  padding: '0 20px',
  height: '45px',
  borderBottom: '1px solid var(--border)',
  background: 'var(--bg-surface)',
  display: 'flex',
  alignItems: 'center',
  flexShrink: 0,
}
```

Height is fixed at `45px` on all SIEM views — Dashboard, Alerts, Log Search, Cases, etc. Never use `padding` alone to set height on title bars — use explicit `height: '45px'`.

### SIEM Tab Menu (Configuration and all sub-tab rows)

Active tab: `color: 'var(--accent-amber)'`, `borderBottom: '2px solid var(--accent-amber)'`.
Inactive tab: `color: 'var(--text-muted)'`, `borderBottom: '2px solid transparent'`.

This is the same rule as tool tabs. There is one tab style standard for the entire app.

---

## Mobile Adaptation Rules

### What changes on mobile

| Element | Desktop | Mobile |
|---|---|---|
| Tool container padding | `padding: '24px'` (App.jsx wrapper) | Same — do not change |
| Multi-column layouts (e.g. sidebar + main) | `gridTemplateColumns: '220px 1fr'` | `gridTemplateColumns: '1fr'` — single column |
| History/sidebar panels | Left column | Stacked above main, `minHeight: 'unset'`, `marginBottom: '12px'` |
| History items in sidebar | Vertical list | `display: 'flex', flexWrap: 'wrap', gap: '4px'` |
| Request bars / input rows | `flexWrap: 'nowrap'` | `flexWrap: 'wrap'` |
| Indicator rows (label + detail) | `flexDirection: 'row'` | `flexDirection: 'column'` |
| `minWidth` on items in flex rows | Set (e.g. `'160px'`) | `0` or `'unset'` |
| Tables (audit log, results) | Full table | Card-per-row layout |

### What changes on mobile (header bar)

The App.jsx tool wrapper uses `padding: '16px'` on mobile (vs `'24px'` on desktop). Use the `-16px` escape on mobile:

```jsx
style={{ ...styles.header, margin: isMobile ? '-16px -16px 20px -16px' : '-24px -24px 20px -24px' }}
```

Tab-tool variant (0 bottom margin):
```jsx
style={{ ...styles.header, margin: isMobile ? '-16px -16px 0 -16px' : '-24px -24px 0 -24px' }}
```

Tab row margin (tab tools only):
```jsx
tabs: (isMobile) => ({ ..., margin: isMobile ? '0 -16px' : '0 -24px' })
```

### What changes on mobile (buttons)

- Buttons must never be `width: '100%'` on mobile. `theme.css` has `button { width: auto; }` as a baseline.
- In flex column containers (`flexDirection: 'column'`), buttons stretch by default due to `alignItems: stretch`. Fix with `alignSelf: 'flex-start'` on the button.
- When a button sits alongside a full-width input in the same column, keep the container default (stretch for input), add `alignSelf: 'flex-start'` to the button only.
- Buttons with `alignSelf: 'flex-end'` in their base style must override to `alignSelf: 'flex-start'` on mobile.

```jsx
<button style={{ ...styles.button(!disabled), alignSelf: isMobile ? 'flex-start' : 'flex-end' }} />
// or simply:
<button style={{ ...styles.button(!disabled), alignSelf: 'flex-start' }} />  // mobile-only context
```

### What changes on mobile (select dropdowns)

- Select dropdowns must never be `width: '100%'` on mobile — use natural width.
- In flex column containers, add `alignSelf: 'flex-start'` to prevent stretch.

### What changes on mobile (inputs)

- Primary search/query inputs should be `width: '100%', boxSizing: 'border-box'` on mobile so they fill the available width.
- Narrower secondary inputs (port, year range, etc.) stay at their natural or fixed width.

### What changes on mobile (control row ordering)

Tools where a selector + button row controls a textarea or file upload should place the control row **below** the textarea/upload, not above it. This matches the expected flow: input first, then submit controls.

### What never changes on mobile

- Header `padding: '12px 20px'` and `background: 'var(--bg-surface)'`
- Tab row pattern and amber active style
- Font, colors, spacing tokens
- Form control styles (inputs, buttons, selects)
- Error message styles
- The `container: { padding: 0 }` rule

### Implementation pattern

```jsx
const isMobile = useIsMobile();

// Conditional style:
style={{ ...styles.layout, gridTemplateColumns: isMobile ? '1fr' : '220px 1fr' }}

// Conditional JSX block (for significantly different layouts):
{isMobile ? <MobileResultCard data={result} /> : <DesktopResultTable data={result} />}
```

Never create separate component files. Never use CSS media queries in tool components. The `useIsMobile` hook is the only branching mechanism.

### Safe bulk edit rule

Any sed/script that touches style objects across multiple tool files MUST be audited for `isMobile` conditional branches in those files. The pattern `style={isMobile ? {...} : {...}}` means both sides need the change, not just the outer style definition.

---

## Things That Are Always Wrong

These are never acceptable anywhere in the codebase:

- `fontWeight: 'bold'` — use weight 500 everywhere
- `borderRadius` on inputs, buttons, or panels — no rounded corners
- Hardcoded hex colors — always use CSS variables
- `<h1>`, `<h2>`, etc. for tool titles — use `<span>` with explicit `fontSize`
- `fontFamily` omitted from `<button>` style objects — browsers don't inherit it
- `maxWidth` on a tool container — use `padding: 0`
- CSS media queries inside tool components — use `useIsMobile()`
- Separate component files for mobile/desktop versions of the same tool

---

## Checklist: Adding or Editing a Tool

- [ ] `container: { padding: 0 }`
- [ ] Header uses negative margin escape: `margin: '-24px -24px Npx -24px'`
- [ ] Title uses `<span>`, not `<h1>` — `fontSize: '13px'`, `fontWeight: 'normal'`
- [ ] Tab row uses amber active style if tabs present
- [ ] All buttons have `fontFamily: 'var(--font)'`
- [ ] No `fontWeight: 'bold'` anywhere
- [ ] No hardcoded colors
- [ ] No `borderRadius`
- [ ] Mobile: multi-column layouts collapse to single column via `isMobile`
- [ ] Mobile: `isMobile` conditional branches audited if bulk style changes were made
- [ ] Mobile: all inputs, outputs, and actions reachable (tap targets ≥ 44px)

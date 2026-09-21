---
name: Project Junction
description: Restrained operational briefing for a synthetic-only platform foundation.
colors:
    canvas: 'oklch(0.975 0.006 255)'
    surface: 'oklch(0.995 0.003 255)'
    ink: 'oklch(0.205 0.025 267)'
    muted: 'oklch(0.48 0.025 267)'
    line: 'oklch(0.885 0.015 265)'
    signal: 'oklch(0.49 0.19 270)'
    signal-soft: 'oklch(0.94 0.045 270)'
    success: 'oklch(0.72 0.15 160)'
typography:
    display:
        fontFamily: '"Avenir Next", Avenir, "Segoe UI", sans-serif'
        fontSize: '4.5rem'
        fontWeight: 600
        lineHeight: 1
        letterSpacing: '-0.045em'
    body:
        fontFamily: '"Avenir Next", Avenir, "Segoe UI", sans-serif'
        fontSize: '1rem'
        lineHeight: 1.75
rounded:
    panel: '16px'
    control: '8px'
spacing:
    compact: '12px'
    panel: '28px'
components:
    status-chip:
        backgroundColor: '{colors.surface}'
        textColor: '{colors.muted}'
        rounded: '999px'
        padding: '7px 11px'
    proof-panel:
        backgroundColor: '{colors.surface}'
        textColor: '{colors.ink}'
        rounded: '{rounded.panel}'
        padding: '28px'
---

# Design System: Project Junction

## Overview

**Creative North Star: "The Operational Briefing"**

This is an operate-mode system for making system boundaries legible under review. It uses quiet, cool-neutral fields and a single indigo signal so the viewer reads status and ownership before decoration. It refuses the generic marketplace hero and does not use visual flourish to imply a live service.

**Key Characteristics:** restrained operational density; clear disclosure; tonal surface separation; concise, high-contrast hierarchy.

## Colors

Indigo is reserved for current meaning, numbered capabilities, focus, and named platform status. Neutral layers carry almost all of the page.

### Primary

- **Signal Indigo** (`oklch(0.49 0.19 270)`): phase labels, capability markers, and keyboard focus.

### Neutral

- **Cool Canvas** (`oklch(0.975 0.006 255)`): page field in light mode.
- **Slate Ink** (`oklch(0.205 0.025 267)`): primary reading color.
- **Measured Muted** (`oklch(0.48 0.025 267)`): secondary copy and quiet status.

**The Signal Rule.** Indigo carries active meaning, not decoration; it must not become a full background or a second text color.

## Typography

**Display Font:** Avenir Next with Avenir and Segoe UI fallbacks.
**Body Font:** Avenir Next with Avenir and Segoe UI fallbacks.

Display is compact and confident; body copy stays spacious and quietly legible.

### Hierarchy

- **Display** (600, 3rem–4.5rem, 1): one Phase statement per viewport.
- **Headline** (600, 1.875rem–2.25rem): section ownership statements.
- **Title** (600, 1.25rem, 1.2): proof panel and capability titles.
- **Body** (400, 1rem, 1.75): explanatory copy, kept below 75ch.
- **Label** (750, 0.75rem, 0.08em): sparingly used phase/category labels.

## Layout

The page uses a centered 72rem container. The first viewport becomes a two-column briefing on large screens and a single reading column below the `lg` breakpoint. The details section pairs its explanation with a vertically divided capability list; no same-size card grid is used.

## Elevation & Depth

Surfaces are tonal by default. The proof panel alone receives a low, diffuse shadow (`0 20px 45px oklch(0.2 0.02 267 / 0.11)`) because it is a current-state instrument, not a decorative card.

## Shapes

Panels use a 16px radius. Capability markers use 8px corners; only the small runtime status uses a pill. Borders are 1px cool-neutral dividers.

## Components

### Chips

- **Style:** a quiet one-pixel outlined status pill with muted text.
- **State:** it states a runtime boundary and is not a clickable control.

### Cards / Containers

- **Corner Style:** 16px for the proof panel.
- **Background:** tonal `surface` mixed with `signal-soft`.
- **Shadow Strategy:** one low ambient shadow for the proof panel only.
- **Border:** 1px `line`.
- **Internal Padding:** 28px.

### Navigation

The top row holds the compact Junction mark on the left and the synthetic-runtime disclosure on the right. It collapses naturally without hiding either fact.

## Do's and Don'ts

### Do:

- **Do** lead every foundation surface with an unambiguous environment or runtime disclosure.
- **Do** use the indigo signal for focus and meaningful status.
- **Do** preserve semantic headings, landmarks, a visible-on-focus skip link, and system color preference.

### Don't:

- **Don't** present live-commerce wording, provider logos, testimonials, or performance claims without evidence.
- **Don't** use a generic icon-card grid as the page structure.
- **Don't** add decorative motion or glass effects to make a foundation state feel more complete than it is.

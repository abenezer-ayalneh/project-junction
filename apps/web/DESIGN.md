---
name: Project Junction
description: Stock shadcn/ui baseline for private staging.
colors:
    brand: '#e23247'
    background: 'shadcn neutral'
    foreground: 'shadcn neutral'
    semantic: 'shadcn destructive with restrained success and warning'
typography:
    display:
        fontFamily: 'Geist, sans-serif'
        fontSize: 'stock shadcn scale'
        fontWeight: 600
    body:
        fontFamily: 'Geist, sans-serif'
        fontSize: 'stock shadcn scale'
rounded:
    default: '0.625rem'
---

# Design System: Project Junction

## Overview

Project Junction uses the stock shadcn/ui neutral preset, Lucide icons, and its semantic CSS-variable tokens. The interface is quiet and functional across all roles; branding must not recolor controls or surfaces.

## Colors

The standard shadcn/ui neutral tokens own backgrounds, foregrounds, borders, controls, focus, and elevation. `#e23247` identifies Project Junction through its mark and small brand accents only. It is never the default button fill or ordinary-text color.

Use destructive, success, and warning colors only to communicate their respective states. State must also have plain-language text and an appropriate Lucide icon where an icon improves recognition.

## Themes

Light, Dark, and System are supported. System is the initial setting; a person may select any mode from the appearance menu and that choice persists only in the current browser. The selected theme controls the document class and browser color scheme before sign-in.

## Typography

Use the shadcn/ui type scale with Geist. Let semantic headings establish hierarchy; avoid display treatments that require custom type rules.

## Layout

Use responsive, mobile-first layouts and stock shadcn/ui spacing, border, radius, Card, Badge, Button, Separator, and menu primitives. Pages can be editorially structured but must not introduce a competing component aesthetic.

## Components

Use shadcn/ui components directly from `src/components/ui`, with their default neutral variants unless semantic meaning calls for a state variant. Use Lucide icons instead of bespoke iconography.

Vendor Storefronts remain neutral. Vendor identity is expressed through a Vendor's logo, cover, and content; Vendor-selected accent colors are not supported.

## Do's and Don'ts

### Do:

- **Do** lead every foundation surface with an unambiguous environment or runtime disclosure.
- **Do** preserve semantic headings, landmarks, a visible-on-focus skip link, keyboard focus, and all three appearance choices.

### Don't:

- **Don't** present live-commerce wording, provider logos, testimonials, or performance claims without evidence.
- **Don't** recolor stock controls, focus rings, or surfaces with the Junction brand red.
- **Don't** add decorative motion, glass effects, or Vendor color layers.

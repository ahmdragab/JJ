# Color Scheme

This document defines the consistent color scheme used throughout the application, inspired by lattice colors with a greenish palette.

## Primary Colors

### Emerald Green (Primary Actions)
- **Primary Button**: `emerald-500` (`#10b981`) - Main CTAs, primary buttons
- **Primary Hover**: `emerald-600` (`#059669`) - Hover states for primary buttons
- **Primary Light**: `emerald-400` (`#34d399`) - Focus rings, accents, links
- **Primary Dark**: `emerald-700` (`#047857`) - Active states

**Usage:**
- Main action buttons (Sign Up, Sign In, Create, Generate, etc.)
- Primary CTAs
- Focus states on inputs
- Active links
- Primary interactive elements

## Neutral Colors

### Slate (Text, Borders, Backgrounds)
- **Slate 900**: `#0f172a` - Primary text, headings
- **Slate 800**: `#1e293b` - Secondary text
- **Slate 700**: `#334155` - Tertiary text, labels
- **Slate 600**: `#475569` - Muted text
- **Slate 500**: `#64748b` - Very muted text
- **Slate 400**: `#94a3b8` - Placeholder text
- **Slate 200**: `#e2e8f0` - Borders
- **Slate 100**: `#f1f5f9` - Light backgrounds
- **Slate 50**: `#f8fafc` - Very light backgrounds

**Usage:**
- All text content
- Borders and dividers
- Backgrounds for cards and containers
- Neutral UI elements

## Status Colors

### Red (Errors, Danger Actions)
- **Red 600**: `#dc2626` - Error text, danger buttons
- **Red 50**: `#fef2f2` - Error backgrounds
- **Red 200**: `#fecaca` - Error borders

**Usage:**
- Error messages
- Delete/danger actions
- Validation errors

## Brand-Specific Colors

The app also supports dynamic brand colors extracted from user websites:
- `brand.colors?.primary` - Used for brand-specific UI elements
- Fallback: `#1a1a1a` (dark gray) or `#2563eb` (blue-600)

## Examples

### Primary Button
```tsx
<button className="bg-emerald-500 hover:bg-emerald-600 text-white">
  Primary Action
</button>
```

### Input Focus
```tsx
<input className="focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" />
```

### Text Hierarchy
```tsx
<h1 className="text-slate-900">Heading</h1>
<p className="text-slate-600">Body text</p>
<span className="text-slate-400">Muted text</span>
```

### Error State
```tsx
<div className="text-red-600 bg-red-50 border border-red-200">
  Error message
</div>
```


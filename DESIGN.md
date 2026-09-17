---
name: Evidex
description: Calm, precise, blue-led interfaces for traceable oncology evidence.
colors:
  evidence-blue: '#175CD3'
  evidence-blue-hover: '#134EAE'
  deep-navy: '#0B3975'
  ink-navy: '#0B1F3A'
  near-black-navy: '#07182D'
  slate-copy: '#52637A'
  quiet-slate: '#60748D'
  mist-canvas: '#F4F8FF'
  glass-white: '#FFFFFF'
  pale-evidence-blue: '#EAF2FF'
  selected-evidence-blue: '#DDEBFF'
  soft-border-blue: '#B4CAE6'
  strong-border-blue: '#8DB6EA'
  error-ink: '#7C2D12'
  error-surface: '#FFF7ED'
  success-ink: '#166534'
  success-surface: '#DCFCE7'
typography:
  display:
    fontFamily: 'Manrope, ui-sans-serif, sans-serif, system-ui'
    fontSize: '3.75rem'
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: '-0.035em'
  headline:
    fontFamily: 'Manrope, ui-sans-serif, sans-serif, system-ui'
    fontSize: '3rem'
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: '-0.035em'
  title:
    fontFamily: 'Manrope, ui-sans-serif, sans-serif, system-ui'
    fontSize: '1.5rem'
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: '-0.025em'
  body:
    fontFamily: 'Manrope, ui-sans-serif, sans-serif, system-ui'
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: 2
  label:
    fontFamily: 'Manrope, ui-sans-serif, sans-serif, system-ui'
    fontSize: '0.75rem'
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: '0.14em'
  mono:
    fontFamily: 'JetBrains Mono, monospace'
    fontSize: '0.875rem'
    fontWeight: 400
    lineHeight: 1.5
rounded:
  xs: '4px'
  sm: '6px'
  md: '8px'
  control: '10px'
  lg: '12px'
  xl: '16px'
  pill: '9999px'
spacing:
  1: '4px'
  2: '8px'
  3: '12px'
  4: '16px'
  5: '20px'
  6: '24px'
  7: '28px'
  8: '32px'
  section-sm: '72px'
  section-md: '96px'
  section-lg: '112px'
components:
  button-primary:
    backgroundColor: '{colors.evidence-blue}'
    textColor: '{colors.glass-white}'
    typography: '{typography.label}'
    rounded: '{rounded.control}'
    padding: '12px 20px'
    height: '48px'
  button-primary-hover:
    backgroundColor: '{colors.evidence-blue-hover}'
    textColor: '{colors.glass-white}'
    typography: '{typography.label}'
    rounded: '{rounded.control}'
    padding: '12px 20px'
    height: '48px'
  button-secondary:
    backgroundColor: 'rgba(255, 255, 255, 0.8)'
    textColor: '{colors.deep-navy}'
    typography: '{typography.label}'
    rounded: '{rounded.control}'
    padding: '12px 20px'
    height: '48px'
  input-evidence:
    backgroundColor: '{colors.glass-white}'
    textColor: '{colors.ink-navy}'
    typography: '{typography.body}'
    rounded: '{rounded.control}'
    padding: '12px'
    height: '44px'
  chip-status:
    backgroundColor: '#EDF5FF'
    textColor: '#0B4DA2'
    typography: '{typography.label}'
    rounded: '{rounded.pill}'
    padding: '6px 12px'
    height: '28px'
  card-glass:
    backgroundColor: 'rgba(255, 255, 255, 0.75)'
    textColor: '{colors.ink-navy}'
    rounded: '{rounded.xl}'
    padding: '24px'
  nav-item:
    backgroundColor: 'transparent'
    textColor: '{colors.deep-navy}'
    rounded: '{rounded.md}'
    padding: '10px 12px'
    height: '40px'
  stage-active:
    backgroundColor: '{colors.evidence-blue}'
    textColor: '{colors.glass-white}'
    rounded: '{rounded.xl}'
    padding: '16px'
---

# Design System: Evidex

## Overview

**Creative North Star: "The Verifiable Blue Evidence Desk"**

Evidex is a calm, precise evidence workspace: a question or knowledge object is placed on the desk first, then conclusions, applicability limits, and sources unfold in a clear sequence. The visual world is blue-led and service-like rather than clinical-theatrical. It earns trust through legible hierarchy, visible provenance, and measured density instead of decorative authority.

Public surfaces breathe, using mist-blue fields, generous whitespace, and restrained translucent panels. Operational surfaces carry more information but keep the same navy typography, blue actions, fine borders, rounded geometry, and status language. Motion guides attention along real stages and never substitutes for a readable static state.

**Key Characteristics:**

- Question-first composition with evidence and provenance revealed progressively.
- Mist-blue and white fields anchored by navy text and a single decisive blue action color.
- Restrained glass materials, fine blue-grey borders, and soft ambient depth.
- Spacious public reading surfaces paired with denser, auditable operational workspaces.
- Chinese-first hierarchy with original-source language preserved where required.

## Colors

The palette uses cool blue-white atmosphere and navy structure, reserving saturated blue for actions, focus, progress, and traceable links.

### Primary

- **Evidence Blue** (`#175CD3`): The decisive interaction color for primary actions, focus rings, active stages, key icons, and source links.
- **Deepened Evidence Blue** (`#134EAE`): The hover state for primary actions; it adds certainty without introducing a second accent.

### Secondary

- **Deep Navy** (`#0B3975`): Branded supporting surfaces, secondary action text, strong callouts, and navigation emphasis.
- **Ink Navy** (`#0B1F3A`): Default headings and primary reading text; it replaces generic black with a cooler, less severe anchor.

### Tertiary

- **Success Ink and Surface** (`#166534`, `#DCFCE7`): Positive states such as completed or published work, always paired with explicit text or iconography.
- **Error Ink and Surface** (`#7C2D12`, `#FFF7ED`): Recoverable failures and warnings, expressed as readable messages rather than color-only signals.

### Neutral

- **Mist Canvas** (`#F4F8FF`): The public product background and the lightest atmospheric field.
- **Glass White** (`#FFFFFF`): Cards, input surfaces, and translucent overlays; opacity may soften it, but content contrast remains solid.
- **Pale Evidence Blue** (`#EAF2FF`): Quiet grouping, hover fields, contextual input regions, and low-priority evidence blocks.
- **Selected Evidence Blue** (`#DDEBFF`): Selected chips, completed steps, and active navigation backgrounds.
- **Slate Copy** (`#52637A`): Long-form secondary copy and explanatory text.
- **Quiet Slate** (`#60748D`): Metadata, inactive steps, timestamps, and tertiary labels.
- **Soft Border Blue** (`#B4CAE6`): Default control and card edge.
- **Strong Border Blue** (`#8DB6EA`): Emphasized card edge or status outline when a surface needs more definition.
- **Near-black Navy** (`#07182D`): High-contrast overlays, skip links, and selection text.

### Named Rules

**The One Decisive Blue Rule.** Saturated blue belongs to actions, focus, progress, and traceable links; large decorative areas stay pale or navy so the primary action remains unmistakable.

**The Meaning Beyond Color Rule.** Success, warning, error, review, and scope states always include a label, icon, or explanatory copy; hue never carries the message alone.

## Typography

**Display Font:** Manrope (with UI sans-serif and system fallbacks)

**Body Font:** Manrope (with UI sans-serif and system fallbacks)

**Label/Mono Font:** Manrope for labels; JetBrains Mono for identifiers, structured values, and source-oriented technical strings

**Character:** Manrope keeps the interface contemporary, open, and neutral enough for dense evidence work. Tight headline tracking gives public surfaces authority, while generous body leading protects Chinese readability and mixed-language source content.

### Hierarchy

- **Display** (600, `3.75rem`, `1.05`): Public hero statements and the main question-first proposition; it steps down responsively to `2.25rem` on small screens.
- **Headline** (600, `3rem`, `1.1`): Major section introductions and top-level knowledge views; it steps down to `1.875rem` where width is constrained.
- **Title** (600, `1.5rem`, `1.25`): Evidence panels, strong callouts, and entity summaries.
- **Body** (400, `1rem`, `2`): Explanations and evidence summaries, normally capped around `65–68ch` to preserve scanning.
- **Label** (600, `0.75rem`, `0.14em`, uppercase only for compact English overlines): Status, metadata, and categorical wayfinding.
- **Mono** (400, `0.875rem`, `1.5`): Variant notation, request-shaped examples, identifiers, and code-like source details.

### Named Rules

**The Calm Authority Rule.** Use weight and spacing before adding color: headings stay semibold, body copy stays regular, and all-caps is limited to short English overlines.

**The Evidence Reading Rule.** Keep explanatory prose near `65–68ch` and preserve comfortable leading; dense operational data may tighten, but clinical and source context must never become cramped.

## Layout

Public surfaces use centered containers between `80rem` and `90rem`, with `16px` mobile gutters, `24px` small-screen gutters, and `32px` desktop gutters. Landing-page sections use a `72px` to `112px` vertical rhythm, while product workspaces use tighter `40px` to `80px` openings and compact internal gaps. The main breakpoints are `640px`, `768px`, `1024px`, and `1280px`.

The recurring spatial model is question or orientation first, then evidence or action. Public pages move from a broad headline and workbench into split or gridded evidence regions. Operational pages are desktop-first with a fixed `17rem` navigation rail; on narrower screens the rail becomes an off-canvas sheet beneath a sticky header. Narrow layouts stack actions and content before reducing type below readable sizes.

**The Density Follows Responsibility Rule.** Public reading gets generous whitespace; authenticated operations may become denser, but they retain the same hierarchy, hit areas, state labels, and recovery affordances.

## Elevation & Depth

The system uses a hybrid of tonal layering, fine borders, blur, and soft blue ambient shadows. Ordinary lists and tables stay nearly flat; elevation appears on question workbenches, translucent evidence panels, branded marks, and active workflow states. Glass remains restrained: it clarifies foreground/background relationships and must retain an opaque fallback.

### Shadow Vocabulary

- **Brand Mark** (`0 8px 22px rgba(23, 92, 211, 0.22)`): Small blue logo tiles and compact signature controls.
- **Action Lift** (`0 10px 25px rgba(23, 92, 211, 0.20)`): Primary actions that need separation from a pale surface.
- **Panel Ambient** (`0 18px 50px rgba(20, 70, 140, 0.11)`): Search, evidence, and result panels at rest.
- **Workbench Ambient** (`0 24px 70px rgba(20, 70, 140, 0.14)`): The primary question composer or other dominant translucent workspace.
- **Navy Feature** (`0 22px 60px rgba(11, 57, 117, 0.20)`): Large dark-blue trust or provenance panels.

### Named Rules

**The Flat Until Meaningful Rule.** Use borders and tonal change for routine structure; reserve shadows for a primary work surface, current process state, or branded focal element.

**The Readable Glass Rule.** Translucency may soften a surface, but never lowers text contrast, hides boundaries, or becomes the only cue that layers differ.

## Shapes

Evidex uses gently curved controls and more generous surface containers. Compact controls use `8px` to `10px` corners, navigation and nested panels use `12px`, and primary cards or workbenches use `16px`. Pills are reserved for status, filters, and compact examples. Hairline blue-grey borders define structure; fully round shapes belong to small icons, markers, or atmospheric gradients rather than content cards.

**The Nested Radius Rule.** Inner controls are always equal to or tighter than their containing surface: `8–10px` inside `12–16px` panels.

## Components

### Buttons

Buttons feel clear and assured, with enough height for touch and no exaggerated motion.

- **Shape:** Gently curved (`10px` on public calls to action, `12px` on prominent workspace actions) with a minimum height of `44–48px`.
- **Primary:** Evidence Blue with white text, semibold `0.875rem` labels, `20px` horizontal padding, and an Action Lift shadow when visually prominent.
- **Hover / Focus:** Hover deepens to Deepened Evidence Blue; focus uses a visible `2px` Evidence Blue ring and offset; active state may move down `1px`.
- **Secondary / Ghost:** Secondary actions use translucent white, Deep Navy text, and a Soft Border Blue edge. Ghost navigation actions remain transparent until a pale-blue or white hover field appears.
- **Disabled:** Preserve the label, reduce opacity, remove pointer affordance, and keep enough contrast to remain identifiable.

### Chips

Chips are compact evidence labels rather than decorative badges.

- **Style:** Status chips use a pale blue fill, stronger blue outline, blue text, `28px` minimum height, and fully rounded ends. Example-question chips use translucent white and quiet slate text.
- **State:** Selection moves to Selected Evidence Blue with an Evidence Blue border; semantic chips pair their color with text and, where useful, an icon.

### Cards / Containers

Cards feel like translucent evidence sheets placed on a cool work surface.

- **Corner Style:** Generously curved (`16px`) for primary cards; nested callouts use `12px`.
- **Background:** White at `68–88%` opacity over Mist Canvas, Pale Evidence Blue for quiet grouping, or Deep Navy for trust and provenance features.
- **Shadow Strategy:** Flat for collections and routine operations; Panel Ambient or Workbench Ambient only for focal surfaces.
- **Border:** Soft Border Blue by default; Strong Border Blue when emphasis or status requires a firmer edge.
- **Internal Padding:** `20–32px`, responsive to density and surface importance.

### Inputs / Fields

Inputs are quiet, legible evidence-entry surfaces.

- **Style:** White or transparent-on-glass background, Soft Border Blue stroke, `8–10px` corners, `44–48px` minimum height, and Ink Navy text.
- **Focus:** Evidence Blue border or a visible blue ring; focus never relies on shadow alone.
- **Error / Disabled:** Error uses Error Ink with a warm pale surface and explanatory copy. Disabled fields retain their shape and label with reduced opacity.

### Navigation

Public navigation is a sticky translucent bar with compact `40px` targets, navy labels, and pale hover fields. Operations use a fixed `17rem` translucent side rail on desktop and an off-canvas sheet on smaller screens; items use `44px` minimum height, `12px` corners, and blue-tinted active or hover treatment. Keyboard focus always produces a visible blue ring.

### Evidence Stage Rail

The four-stage rail—understand, retrieve, organize, validate—is the signature product component. Inactive steps use Quiet Slate, completed steps use a white or Selected Evidence Blue surface, and the current step becomes Evidence Blue with white text and soft lift. Transitions use `500ms` for state movement; the corresponding answer content reveals over `550ms` with an emphasized deceleration curve. Reduced-motion preference collapses these transitions to near-instant state changes.

## Do's and Don'ts

### Do:

- **Do** lead public tasks with the question, knowledge object, or user goal before exposing evidence detail.
- **Do** keep primary actions, focus, progress, and source links in the single Evidence Blue family.
- **Do** use labels, icons, and explanatory copy alongside every semantic state.
- **Do** preserve `44–48px` interactive targets and visible keyboard focus across public and operational surfaces.
- **Do** use translucent material selectively with an opaque fallback and readable contrast.
- **Do** preserve source language and provenance while keeping surrounding interface hierarchy Chinese-first.

### Don't:

- **Don't** turn Evidex into a generic admin grid on public surfaces or a collection of unrelated cards.
- **Don't** introduce competing saturated accent colors for ordinary actions.
- **Don't** use shadow on every container; routine structure belongs to borders, spacing, and tonal layers.
- **Don't** use color alone to communicate review, publication, error, risk, or completion.
- **Don't** make glass blur, animation, or hover the only way to understand hierarchy or state.
- **Don't** present medical authority through dramatic imagery, black-heavy contrast, or ornamental clinical motifs.

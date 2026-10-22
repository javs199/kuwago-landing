---
name: Kuwago Permanent Identity
colors:
  surface: '#fff7fc'
  surface-dim: '#e5d5e9'
  surface-bright: '#fff7fc'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#fdefff'
  surface-container: '#f9e9fd'
  surface-container-high: '#f3e3f7'
  surface-container-highest: '#edddf1'
  on-surface: '#211826'
  on-surface-variant: '#4c444f'
  inverse-surface: '#372d3c'
  inverse-on-surface: '#fcecff'
  outline: '#7d7480'
  outline-variant: '#cec3d0'
  surface-tint: '#784b98'
  primary: '#200037'
  on-primary: '#ffffff'
  primary-container: '#3b0c5b'
  on-primary-container: '#a97acb'
  inverse-primary: '#e2b6ff'
  secondary: '#775a1a'
  on-secondary: '#ffffff'
  secondary-container: '#fed489'
  on-secondary-container: '#785a1b'
  tertiary: '#140f1a'
  on-tertiary: '#ffffff'
  tertiary-container: '#292430'
  on-tertiary-container: '#928a99'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#f3daff'
  primary-fixed-dim: '#e2b6ff'
  on-primary-fixed: '#2e004d'
  on-primary-fixed-variant: '#5e337e'
  secondary-fixed: '#ffdea5'
  secondary-fixed-dim: '#e9c178'
  on-secondary-fixed: '#271900'
  on-secondary-fixed-variant: '#5d4202'
  tertiary-fixed: '#e9dfef'
  tertiary-fixed-dim: '#cdc3d3'
  on-tertiary-fixed: '#1e1925'
  on-tertiary-fixed-variant: '#4a4451'
  background: '#fff7fc'
  on-background: '#211826'
  surface-variant: '#edddf1'
  warm-off-white: '#F8F6FA'
  pure-white: '#FFFFFF'
  dark-gold: '#8F691F'
  dark-bg: '#160B1D'
  dark-surface: '#24172C'
  dark-elevated: '#302039'
  dark-text-secondary: '#CFC4D2'
  bright-gold: '#D1AD66'
typography:
  display-lg:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  title-lg:
    fontFamily: Hanken Grotesk
    fontSize: 20px
    fontWeight: '500'
    lineHeight: 28px
  body-lg:
    fontFamily: Hanken Grotesk
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Hanken Grotesk
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Hanken Grotesk
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Hanken Grotesk
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 8px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 40px
  sidebar-width: 280px
  max-content-width: 1440px
---

## Brand & Style

The design system is built on the concept of **Sovereign Modernism**—a premium, authoritative identity that balances the security of a permanent establishment with the refined tranquility of high-end hospitality. It serves as a digital sanctuary for administrative oversight, replacing the generic bustle of commercial interfaces with an atmosphere of quiet, expensive competence.

The visual style is **Corporate / Modern** with a **Tactile** edge. It utilizes generous breathing room, structured grids, and subtle material layers to evoke a sense of protection and intentionality. The emotional response is one of total control and unshakeable reliability, represented by the watchful presence of the "Kuwago" (owl) archetype.

## Colors

The palette is a sophisticated interplay between deep nocturnal purples and metallic golds, signifying both authority and luxury.

### Light Mode (Default)
- **Primary Purple (#3B0C5B):** Used for primary actions and navigational anchors.
- **Warm Off-White (#F8F6FA):** The main application canvas background to reduce glare.
- **Pure White (#FFFFFF):** Reserved for elevated surfaces like cards and content containers.
- **Champagne Gold (#C6A15B):** A refined accent for icons, secure-access indicators, and eyebrow labels.
- **Dark Gold (#8F691F):** An accessible variant for gold-toned text on light backgrounds.
- **Charcoal-Purple (#241B29):** The core color for all primary legibility and body text.

### Dark Mode
- **Background (#160B1D):** A deep, immersive purple-black.
- **Elevated Surfaces:** Uses tiered purples (#24172C and #302039) to create hierarchy.
- **Bright Gold (#D1AD66):** Becomes the primary action color in dark mode to ensure high-contrast visibility.

## Typography

This design system exclusively employs **Hanken Grotesk** to maintain a clean, sharp, and contemporary professional standard. The type scale is designed for clarity in high-density data environments without sacrificing its premium feel.

- **Authority:** Headlines use tight letter-spacing and heavier weights (600-700) to project confidence.
- **Legibility:** Body text is optimized with a generous line-height to maintain comfort during prolonged administrative tasks.
- **Categorization:** Labels and eyebrow text should often use **Dark Gold** or **Champagne Gold** to differentiate metadata from primary content. Labels use a slightly higher weight and increased tracking for immediate recognition.

## Layout & Spacing

The layout utilizes a **Fluid Grid** model with strict mathematical rigor. All spacing must follow an 8px incremental scale to ensure a balanced, architectural rhythm.

- **Grid Model:** A 12-column grid on desktop with 24px gutters. External margins are set to 40px to create a spacious frame.
- **Breakpoints:**
  - **Desktop (1024px+):** Fixed sidebar at 280px. Content occupies the remaining fluid space up to a maximum width of 1440px.
  - **Tablet (768px - 1023px):** 8-column grid. The sidebar collapses into a narrow icon rail or an overlay drawer.
  - **Mobile (Up to 767px):** 4-column grid with 16px margins. Components reflow to a single vertical column.

## Elevation & Depth

Hierarchy is established through **Tonal Layering** and **Low-Contrast Outlines** rather than heavy shadows, preserving a modern and precise aesthetic.

- **Z-Axis Tiering:** Surfaces are stacked using color. In light mode, the Warm Off-White background hosts Pure White cards. In dark mode, surfaces progress from deep background to lighter elevated purples.
- **Outlines:** Containers use a 1px solid border of Soft Lavender (#E7DDED) in light mode to define edges without adding visual weight.
- **Shadows:** Use sparingly and only for transient elements (modals, dropdowns). Shadows should be highly diffused and tinted with the primary neutral color (e.g., 0px 12px 24px rgba(36, 27, 41, 0.08)).

## Shapes

The shape language is professional and balanced, favoring a clean geometric look with "softened" corners that prevent the UI from feeling aggressive.

- **Standard Radius:** All interactive components (buttons, inputs, cards) use a base radius of 10px to 12px.
- **Large Components:** Dashboard containers and primary modals use a 16px (1rem) radius.
- **Interactive Pill:** Data tags and status indicators use a fully rounded (pill) shape to distinguish them from rectangular action buttons.
- **Iconography:** Icons should be housed in subtly rounded squares or "squircles" when used as secondary decorative elements.

## Components

- **Buttons:** 
  - *Light Mode Primary:* Purple (#3B0C5B) with White text.
  - *Dark Mode Primary:* Bright Gold (#D1AD66) with Charcoal-Purple (#241B29) text.
  - *Secondary:* Soft Lavender border (#E7DDED) with Primary Purple text.
- **Input Fields:** Pure White background with 1px Soft Lavender border. On focus, the border transitions to 2px Primary Purple. Labels sit persistently above the field.
- **Cards:** White surfaces with a 1px Soft Lavender border and 24px internal padding. Content should be grouped logically with subtle dividers.
- **Secure-Access Shield:** A dedicated gold-accented component for high-security areas, utilizing the Champagne Gold (#C6A15B) for its icon and border.
- **Status Chips:** Pill-shaped with low-saturation backgrounds. The text color should match the Accessible Dark Gold (#8F691F) or a muted version of the status intent (e.g., success/error).
- **Lists & Tables:** Minimum row height of 56px with 1px #E7DDED horizontal dividers. Use the Label-MD style for headers to ensure a clear distinction from data.
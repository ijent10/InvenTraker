# InvenTraker Design System (IDS)

IDS is the shared design contract for the marketing site, web portal, and iOS app. Platform controls may remain native; semantics, hierarchy, status language, spacing, and motion must remain recognizable.

## Principles

- Complex underneath, effortless on the surface.
- Attention before decoration.
- Progressive disclosure for advanced controls.
- One obvious primary action per context.
- Status always uses text or iconography in addition to color.
- Preserve native interaction expectations on iOS.

## Semantic tokens

Use semantic names in components; do not introduce new feature-specific hex colors.

| Token | Light | Dark |
|---|---|---|
| `background.app` | `#F5F5F7` | `#101012` |
| `surface.primary` | `#FFFFFF` | `#1C1C1E` |
| `surface.secondary` | `#F0F0F2` | `#2C2C2E` |
| `text.primary` | `#1D1D1F` | `#F5F5F7` |
| `text.secondary` | `#6E6E73` | `#AEAEB2` |
| `text.tertiary` | `#86868B` | `#8E8E93` |
| `accent.primary` | `#007AFF` | `#0A84FF` |
| `status.success` | `#248A3D` | `#30D158` |
| `status.warning` | `#B86E00` | `#FF9F0A` |
| `status.critical` | `#D92D20` | `#FF453A` |
| `separator` | `rgba(60,60,67,.12)` | `rgba(255,255,255,.12)` |

The existing organization accent/secondary theming remains supported. Organization colors may fill primary actions and selected navigation but must not alter semantic warning, success, or critical meaning.

## Typography

Use the system UI stack on web and native system typography in SwiftUI. Use sentence case, restrained weights, tabular figures for quantities and currency, and Dynamic Type on iOS.

| Role | Desktop | Mobile |
|---|---:|---:|
| Marketing hero | 64–80 | 38–48 |
| Page title | 34–40 | 28–34 |
| Section title | 24–28 | 22–24 |
| Widget title | 15–17 | 15–17 |
| Body | 15–16 | 15–17 |
| Secondary | 13–14 | 13–14 |
| Caption | 12–13 | 12–13 |
| Large metric | 32–44 | 28–40 |

## Geometry and spacing

- Spacing scale: `4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80`.
- Radii: `6, 10, 14, 20, 28`, plus pill.
- Default portal surface: 14px radius; compact controls: 10px; major sheets: 20–28px.
- Use background separation before borders or shadows.
- Shadows are reserved for menus, sheets, dragged widgets, and temporary overlays.

## Icons

Web uses Lucide; iOS uses SF Symbols. A semantic map must bind the same concepts: package, clipboard-check, package-plus, truck, trash, arrow-left-right, scale, shopping-bag, shield-check, sparkle, and chart. Icon-only controls require accessible labels and at least a 44px touch target on mobile.

## Motion

| Purpose | Duration |
|---|---:|
| Immediate feedback | 100ms |
| Standard transition | 180–240ms |
| Sheet/panel | 250–350ms |
| Widget reflow | 200–300ms |

Use ease-out or platform springs. Reduced motion removes transform-based travel while retaining state feedback. Never delay task completion for animation.

## Core primitives

- Button: primary, secondary, quiet, destructive; loading and disabled states.
- Field: label, value, help, validation, and accessible error relationship.
- Status: icon + label + optional semantic color.
- Toolbar: page context on left, primary action and utilities on right.
- List/table: sticky headings when useful, keyboard row movement, selection, bulk action disclosure.
- Inspector: persistent on wide screens, sheet on compact screens.
- Confirmation: inline undo for reversible changes; deliberate dialog for irreversible actions.
- Widget surface: size-aware content, common loading/empty/stale/denied/offline/error states.

## Shell rules

The marketing site remains a presentation surface. The portal uses a collapsible sidebar and compact contextual toolbar. Mobile uses Home, Inventory, Activity, Assistant, and More tabs. Do not compress desktop navigation into a phone sidebar.

## Accessibility acceptance

- WCAG AA text contrast.
- Visible focus and logical tab order.
- Keyboard alternatives for drag and resize.
- Screen-reader names for every icon action.
- High/increased contrast and reduced transparency.
- Text scaling without clipped critical values.
- Color-independent status meaning.

## Migration and rollback

Map existing CSS variables to IDS names first, then migrate components incrementally. Keep compatibility aliases until all pages move. On iOS, introduce an `IDS` token namespace without replacing native semantics. Roll back at token alias or component level; no data migration is required.

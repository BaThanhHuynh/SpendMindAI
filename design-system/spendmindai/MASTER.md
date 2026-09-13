# Design System Master File - Apple Design Language

> **LOGIC:** When building or updating components, strictly follow these Apple Human Interface Guidelines and Apple Web Design tokens.

---

**Project:** SpendMindAI  
**Design System:** Apple Human Interface Guidelines & Web Design  
**Category:** Intelligent Personal Finance Management  

---

## Global Rules

### Color Palette

| Role | Hex / Value (Light) | Hex / Value (Dark) | CSS Variable |
|------|--------------------|-------------------|--------------|
| Primary (Action Blue) | `#0071e3` | `#2997ff` | `--color-primary` / `--accent-color` |
| Primary Hover | `#0077ed` | `#339cff` | `--accent-color-hover` |
| Primary Active | `#005bb5` | `#1a80e5` | `--accent-color-active` |
| Background (Canvas) | `#f5f5f7` (Parchment) | `#000000` (Apple Black) | `--bg-primary` |
| Surface (Card) | `#ffffff` | `#1c1c1e` | `--card-bg` |
| Surface Elevated | `#fbfbfd` | `#2c2c2e` | `--surface-raised` |
| Hairline Border | `rgba(0, 0, 0, 0.08)` | `rgba(255, 255, 255, 0.12)` | `--card-border` |
| Text Primary (Ink) | `#1d1d1f` | `#f5f5f7` | `--text-primary` |
| Text Secondary | `#6e6e73` | `#a1a1a6` | `--text-secondary` |
| Text Muted | `#86868b` | `#86868b` | `--text-muted` |
| Income (System Green) | `#34c759` | `#30d158` | `--income-color` |
| Expense (System Red) | `#ff3b30` | `#ff453a` | `--expense-color` |
| Warning (System Orange) | `#ff9500` | `#ff9f0a` | `--warning-color` |
| Frosted Glass Surface | `rgba(255, 255, 255, 0.78)` | `rgba(28, 28, 30, 0.78)` | `--glass-bg` |

---

### Typography

- **Primary Font Family:** `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", -apple-system, sans-serif`
- **Headline Display Tracking:** `-0.022em` to `-0.03em` ("Apple tight")
- **Body Size:** `17px` at `weight: 400`, `line-height: 1.47`
- **Hierarchy:**
  - Hero / Display: 36px - 48px, Weight 600
  - Section Headings: 22px - 28px, Weight 600
  - Body Text: 17px, Weight 400
  - Subhead / Button Text: 15px, Weight 500/600
  - Captions / Meta: 12px - 13px, Weight 400

---

### Shapes & Corner Radii

| Token | Value | Component Usage |
|-------|-------|-----------------|
| `--radius-sm` | `8px` | Small tags, sub-chips |
| `--radius-md` | `12px` | Inset grouped elements, list item chips |
| `--radius-lg` | `18px` | Cards, popups, charts |
| `--radius-xl` | `24px` | Modals, bottom sheets, balance card |
| `--radius-pill` | `9999px` | Buttons, search inputs, status badges, Dynamic Island |

---

### Shadows & Materials

- **Frosted Glass:** `backdrop-filter: blur(20px) saturate(180%); -webkit-backdrop-filter: blur(20px) saturate(180%);`
- **Card Shadow (Light):** `0 4px 20px rgba(0, 0, 0, 0.04), 0 1px 2px rgba(0, 0, 0, 0.02)`
- **Card Shadow (Dark):** `0 8px 32px rgba(0, 0, 0, 0.38)`
- **Floating / Dynamic Island:** `0 12px 36px rgba(0, 0, 0, 0.16)`

---

### Motion & Physics

- **Snappy Spring:** `0.18s cubic-bezier(0.16, 1, 0.3, 1)`
- **Smooth Spring:** `0.32s cubic-bezier(0.32, 0.72, 0, 1)`
- **Tactile Active Press:** `transform: scale(0.96);` on buttons and interactive chips.
- **Respect Motion Preference:** All transitions fold to simple opacity under `prefers-reduced-motion: reduce`.

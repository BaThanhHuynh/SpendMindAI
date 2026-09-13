---
version: 2.1.0
name: SpendMindAI-Apple-Borderless-Emerald-Design-System
description: Official Apple Borderless Design System for SpendMindAI. Combining Apple Human Interface Guidelines (HIG) with modern emerald accents, 100% borderless surfaces separated by subtle elevation and depth, dynamic 4-level monthly budget thresholds (Green/Yellow/Orange/Red), and restored vibrant data visualizations.

colors:
  dark:
    canvas: "#000000"
    elevated: "#161618"
    surface-card: "#1c1c1e"
    surface-secondary: "#2c2c2e"
    hairline: "transparent"
    text-primary: "#f5f5f7"
    text-secondary: "#a1a1a6"
    text-muted: "#86868b"
    accent: "#10b981"
    accent-hover: "#059669"
    accent-text: "#ffffff"
    income: "#30d158"
    income-bg: "rgba(48, 209, 88, 0.08)"
    expense: "#ff453a"
    expense-bg: "rgba(255, 69, 58, 0.08)"
  light:
    canvas: "#f5f5f7"
    elevated: "#ffffff"
    surface-card: "#ffffff"
    surface-secondary: "#f2f2f7"
    hairline: "transparent"
    text-primary: "#1d1d1f"
    text-secondary: "#6e6e73"
    text-muted: "#86868b"
    accent: "#059669"
    accent-hover: "#047857"
    accent-text: "#ffffff"
    income: "#248a3d"
    income-bg: "rgba(36, 138, 61, 0.07)"
    expense: "#d70015"
    expense-bg: "rgba(215, 0, 21, 0.07)"

budget-thresholds:
  level-safe:
    range: "< 70%"
    color: "#10b981"
    badge: "An toàn"
  level-caution:
    range: "70% - 85%"
    color: "#eab308"
    badge: "Cần chú ý"
  level-alert:
    range: "85% - 100%"
    color: "#f97316"
    badge: "Gần chạm ngưỡng"
  level-danger:
    range: ">= 100%"
    color: "#ef4444"
    badge: "Vượt hạn mức"

typography:
  font-family: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'SF Pro Text', 'Inter', system-ui, sans-serif"
  display-tight-tracking: "-0.025em"
  body-font-size: "17px"
  body-line-height: "1.47"

components:
  borderless: "All cards, panels, inputs, buttons, tables, badges, and modals have zero borders (border: none !important)"
  button-primary:
    dark: "background: #10b981; color: #ffffff; font-weight: 600; border-radius: 9999px; border: none;"
    light: "background: #059669; color: #ffffff; font-weight: 600; border-radius: 9999px; border: none;"
  button-secondary:
    dark: "background: rgba(255, 255, 255, 0.08); color: #f5f5f7; border: none;"
    light: "background: rgba(0, 0, 0, 0.04); color: #1d1d1f; border: none;"
  balance-card:
    dark: "background: #1c1c1e; border: none; amount: #ffffff;"
    light: "background: #ffffff; border: none; amount: #1d1d1f;"
  charts:
    category-donut: "Vibrant Apple multi-tint palette: Emerald, Blue, Amber, Pink, Purple, Cyan, Orange, Lime"
    trends-bar: "Income: #10b981; Expense: #ef4444; clean borderless columns"

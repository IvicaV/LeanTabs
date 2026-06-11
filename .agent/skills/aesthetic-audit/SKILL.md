---
name: aesthetic-auditor
description: Ensures LeanTabs components follow premium Vanilla CSS design principles (gradients, theme variables, glassmorphism, micro-animations). Use when editing or creating UI elements.
---

# Aesthetic Auditor: Vanilla CSS, Glassmorphism & UI Consistency

Use this skill whenever modifying or creating user interfaces in LeanTabs (`saved-links.html`, `options.html`, `popup.html`, `styles.css`) to ensure the extension maintains a premium developer tool aesthetic.

## Core Design Principles

### 1. Vibrancy Over Flatness
- Avoid flat colors. Utilize modern, tailored HSL color tokens and gradients configured in `styles.css`.
- Ensure elements change state smoothly when hovered or activated using CSS variables (e.g., modifying background opacity or borders dynamically).

### 2. Glassmorphism & Overlays
- Popups, dropdowns, and custom modals (`#customModal`) must feel premium.
- Use low-opacity border styling (e.g., `rgba(255, 255, 255, 0.08)`) combined with backdrop filtering (`backdrop-filter: blur(8px)`) to create glass layers.

### 3. Visual Stability & Micro-Animations
- Avoid heavy, scale-based animations (like `transform: scale(1.05)`) on interactive components, as they cause layout shifts and visual unrest.
- Prioritize subtle, color-based transitions, brightness variations, or opacity adjustments.
- Always implement a standard transition rule (`transition: all 0.2s ease-in-out;`) on buttons, cards, and input fields to ensure state shifts are smooth.

### 4. Zero Intrusive Borders
- Avoid high-contrast solid borders. All structural lines (dividers, panel outlines) should be extremely subtle.
- Use transparent borders for secondary actions that only become visible as subtle outlines on hover.

### 5. Interaction Consistency (Einheitlichkeit)
- All confirmation states, warning modals, and success highlights must match.
- If deleting a link in the Dashboard triggers a specific warning modal style and red highlight animation, deleting a backup or clearing history in Options must use the exact same modal framework and layout behavior.

---

## Vanilla CSS Reference Patterns

### Premium Glass Panel (`styles.css`)
```css
.premium-card {
  background: var(--bg-surface-glass); /* e.g., rgba(30, 41, 59, 0.5) */
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--border-subtle); /* e.g., rgba(255, 255, 255, 0.08) */
  border-radius: 12px;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
  transition: all 0.2s ease-in-out;
}
```

### Visual Transition Button
```css
.btn-interactive {
  padding: 8px 16px;
  border-radius: 8px;
  background: var(--primary-color-alpha);
  color: var(--primary-color);
  border: 1px solid transparent;
  cursor: pointer;
  transition: background-color 0.2s ease, opacity 0.2s ease;
}
.btn-interactive:hover {
  background: var(--primary-color-alpha-hover);
}
.btn-interactive:active {
  opacity: 0.8;
}
```

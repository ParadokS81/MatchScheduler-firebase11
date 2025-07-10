# Frontend Architecture Guide - MatchScheduler

## Overview
This document defines the complete frontend architecture for MatchScheduler, consolidating layout rules, scaling strategies, design system, and implementation patterns into a single source of truth.

## Table of Contents
1. [Core Layout System](#core-layout-system)
2. [Scaling Strategy](#scaling-strategy)
3. [Design System](#design-system)
4. [Component Patterns](#component-patterns)
5. [Firebase Integration](#firebase-integration)
6. [Responsive Design](#responsive-design)
7. [Implementation Workflow](#implementation-workflow)

---

## Core Layout System

### The Sacred 3x3 Grid

**This structure is IMMUTABLE - it never changes**

```css
.main-grid {
  display: grid;
  
  /* HYBRID SCALING for sidebars:
     - 20% of viewport width for proportional scaling
     - Never smaller than 300px (usable minimum)
     - Never larger than 400px (prevents excessive width)
     This ensures perfect layout from 1080p to 4K displays
  */
  grid-template-columns: clamp(300px, 20vw, 400px) 1fr clamp(300px, 20vw, 400px);
  
  grid-template-rows: 80px 1fr 1fr;        /* Fixed header, equal content rows */
  gap: 1rem;
  height: calc(100vh - 60px - 2rem);      /* Full height minus nav and padding */
}
```

### Panel Layout
```
┌─────────────┬─────────────────┬─────────────┐
│ TOP-LEFT    │ TOP-CENTER      │ TOP-RIGHT   │
│ User Profile│ Week Navigation │ Team Filters│
├─────────────┼─────────────────┼─────────────┤
│ MIDDLE-LEFT │ MIDDLE-CENTER   │ MIDDLE-RIGHT│
│ Team Info   │ Grid Week 1     │ Favorites   │
├─────────────┼─────────────────┼─────────────┤
│ BOTTOM-LEFT │ BOTTOM-CENTER   │ BOTTOM-RIGHT│
│ Grid Tools  │ Grid Week 2     │ Browse Teams│
└─────────────┴─────────────────┴─────────────┘
```

### Layout Rules
1. **Components own their panel interior only**
2. **Never modify panel dimensions or grid position**
3. **Use flexbox for internal panel layouts**
4. **Panels have overflow handling (scroll/hidden)**

---

## Scaling Strategy

### Hybrid Scaling Approach

**Base Font Size Scaling**
```css
:root {
  /* Base: 16px at 1920px viewport */
  font-size: clamp(14px, 0.833vw, 20px);
}
```

### Scaling Units Reference

| Unit Type | Use Case | Example |
|-----------|----------|---------|
| `rem` | Most sizing (scales with root) | `padding: 1rem` |
| `em` | Relative to parent font | `margin: 0.5em` |
| `px` | Borders, minimum sizes | `border: 1px solid` |
| `%` | Relative widths within panels | `width: 100%` |
| `vw/vh` | Full viewport references | `height: calc(100vh - 60px)` |

### Component Scaling Rules
```css
/* Small elements (buttons, inputs) */
.btn {
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  min-height: 2.5rem;
}

/* Medium elements (cards, sections) */
.card {
  padding: 1rem;
  margin-bottom: 1rem;
  border-radius: 0.5rem;
}

/* Large elements (panels, modals) */
.panel-content {
  padding: 1.5rem;
  gap: 1rem;
}
```

---

## Design System

### Color Palette

**Modern Approach: Use a Theme Generator**

Instead of manually defining colors, use [TweakCN](https://tweakcn.com/editor/theme) to:
1. Visually design your color scheme
2. Get automatic dark mode support
3. Export theme with proper OKLCH colors
4. Copy the generated CSS variables

**Example Theme Structure:**
```css
:root {
  /* Generated from TweakCN */
  --background: oklch(0.2046 0 0);
  --foreground: oklch(0.9219 0 0);
  --card: oklch(0.2686 0 0);
  --card-foreground: oklch(0.9219 0 0);
  --primary: oklch(0.7686 0.1647 70.0804);
  --primary-foreground: oklch(0 0 0);
  --secondary: oklch(0.2686 0 0);
  --muted: oklch(0.2686 0 0);
  --muted-foreground: oklch(0.7155 0 0);
  --accent: oklch(0.4732 0.1247 46.2007);
  --destructive: oklch(0.6368 0.2078 25.3313);
  --border: oklch(0.3715 0 0);
  /* ... plus shadows, radii, fonts */
}
```

**Why OKLCH?**
- Perceptually uniform color space
- Consistent lightness across hues
- Better for creating color scales
- Modern CSS standard

### Typography Scale
```css
/* Using rem for scalability */
--text-xs: 0.75rem;     /* 12px */
--text-sm: 0.875rem;    /* 14px */
--text-base: 1rem;      /* 16px */
--text-lg: 1.125rem;    /* 18px */
--text-xl: 1.25rem;     /* 20px */
--text-2xl: 1.5rem;     /* 24px */
```

### Spacing System
Based on 0.25rem increments:
```css
/* Consistent spacing scale */
--space-1: 0.25rem;   /* 4px */
--space-2: 0.5rem;    /* 8px */
--space-3: 0.75rem;   /* 12px */
--space-4: 1rem;      /* 16px */
--space-5: 1.25rem;   /* 20px */
--space-6: 1.5rem;    /* 24px */
--space-8: 2rem;      /* 32px */
```

### Component Styling Patterns

**Tailwind-First Approach**

Use Tailwind utility classes exclusively - no custom CSS needed:

```html
<!-- Example: Card Component -->
<div class="bg-card text-card-foreground border border-border rounded-lg p-4">
  <h3 class="text-lg font-semibold mb-2">Card Title</h3>
  <p class="text-muted-foreground">Card content goes here</p>
</div>

<!-- Example: Button (from Shadcn/UI pattern) -->
<button class="bg-primary text-primary-foreground hover:bg-primary/90 
               px-4 py-2 rounded-md font-medium transition-colors">
  Click Me
</button>
```

**Using Shadcn/UI Components**

1. Visit [shadcn/ui](https://ui.shadcn.com/docs/components)
2. Find the component you need
3. Copy the HTML structure
4. The component automatically uses your theme variables
5. Adapt the React patterns to vanilla JS

**Benefits:**
- No custom CSS to maintain
- Consistent with modern web standards
- AI tools understand these patterns
- Easy to modify and iterate

---

## Component Patterns

### JavaScript Structure (Revealing Module Pattern)
```javascript
const ComponentName = (function() {
    // Private variables
    let _panel;
    let _elements = {};
    let _state = {};
    
    // Private methods
    function _render() {
        // Update DOM
    }
    
    function _handleEvent(e) {
        // Handle events
    }
    
    // Public API
    function init(panelId) {
        _panel = document.getElementById(panelId);
        if (!_panel) {
            console.error(`Panel ${panelId} not found`);
            return;
        }
        
        _setupElements();
        _attachListeners();
        console.log(`${ComponentName} initialized`);
    }
    
    function update(data) {
        _state = { ..._state, ...data };
        _render();
    }
    
    return { init, update };
})();
```

### HTML Structure Pattern
```html
<!-- Component root always uses flexbox -->
<div class="component-root">
    <!-- Header section (if needed) -->
    <div class="component-header">
        <h3 class="text-base font-semibold">Title</h3>
        <button class="btn btn-sm">Action</button>
    </div>
    
    <!-- Content section -->
    <div class="component-content">
        <!-- Component specific content -->
    </div>
    
    <!-- Footer section (if needed) -->
    <div class="component-footer">
        <!-- Actions, pagination, etc -->
    </div>
</div>
```

### CSS Pattern for Components
```css
.component-root {
    display: flex;
    flex-direction: column;
    height: 100%;
    padding: var(--space-4);
}

.component-header {
    flex-shrink: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-4);
}

.component-content {
    flex: 1;
    overflow-y: auto;
}

.component-footer {
    flex-shrink: 0;
    margin-top: var(--space-4);
    padding-top: var(--space-4);
    border-top: 1px solid var(--border);
}
```

---

## Firebase Integration

### Pattern Conversions

**Old (Google Apps Script)**
```javascript
google.script.run
    .withSuccessHandler(handleSuccess)
    .withFailureHandler(handleError)
    .functionName(params);
```

**New (Firebase)**
```javascript
// Using async/await pattern
async function callFirebaseFunction(functionName, params) {
    try {
        const result = await getFunctions()
            .httpsCallable(functionName)(params);
            
        if (result.data.success) {
            return result.data;
        } else {
            throw new Error(result.data.message);
        }
    } catch (error) {
        console.error(`${functionName} error:`, error);
        throw error;
    }
}
```

### Real-time Listeners
```javascript
// Subscribe to data changes
function subscribeToTeam(teamId, callback) {
    const unsubscribe = getDb()
        .collection('teams')
        .doc(teamId)
        .onSnapshot((doc) => {
            if (doc.exists) {
                callback({ id: doc.id, ...doc.data() });
            }
        });
    
    // Return unsubscribe function for cleanup
    return unsubscribe;
}
```

### State Management Pattern
```javascript
// In StateService
const StateService = (function() {
    let _state = {
        user: null,
        currentTeam: null,
        weekOffset: 0
    };
    
    let _listeners = new Map();
    
    function setState(key, value) {
        _state[key] = value;
        _notifyListeners(key, value);
    }
    
    function getState(key) {
        return _state[key];
    }
    
    function subscribe(key, callback) {
        if (!_listeners.has(key)) {
            _listeners.set(key, []);
        }
        _listeners.get(key).push(callback);
    }
    
    return { setState, getState, subscribe };
})();
```

---

## Responsive Design

### Breakpoint Strategy
```css
/* Mobile First Approach */
/* Base styles for mobile < 640px */

/* Tablet */
@media (min-width: 640px) {
    /* sm: styles */
}

/* Desktop */
@media (min-width: 1024px) {
    /* lg: styles */
    /* This is where 3x3 grid applies */
}

/* Large Desktop */
@media (min-width: 1536px) {
    /* 2xl: styles */
}
```

### Mobile Layout
Below 1024px, panels stack vertically:
```css
@media (max-width: 1023px) {
    .main-grid {
        grid-template-columns: 1fr;
        grid-template-rows: auto;
        gap: var(--space-4);
    }
    
    /* Adjust panel heights for mobile */
    .panel {
        min-height: auto;
        max-height: 80vh;
    }
}
```

---

## Implementation Workflow

### Theme Setup (Do This First!)

1. **Generate Your Theme**
   - Go to [TweakCN](https://tweakcn.com/editor/theme)
   - Customize colors, typography, shadows
   - Test light/dark modes
   - Copy the generated CSS

2. **Install Theme**
   ```html
   <!-- In your index.html or main CSS file -->
   <style>
     /* Paste your TweakCN theme here */
     :root { ... }
     .dark { ... }
   </style>
   ```

3. **Configure Tailwind**
   ```javascript
   // tailwind.config.js
   module.exports = {
     theme: {
       extend: {
         colors: {
           // Map CSS variables to Tailwind
           background: 'var(--background)',
           foreground: 'var(--foreground)',
           primary: {
             DEFAULT: 'var(--primary)',
             foreground: 'var(--primary-foreground)',
           },
           // ... etc
         }
       }
     }
   }
   ```

### For Each Component

1. **Structure HTML**
   ```html
   <!-- Follow component HTML pattern -->
   <div class="component-root">
       <!-- Use semantic HTML -->
       <!-- Apply utility classes -->
   </div>
   ```

2. **Apply Styling**
   - Use CSS variables for colors
   - Use rem units for sizing
   - Follow spacing scale
   - Ensure responsive behavior

3. **Implement JavaScript**
   - Follow revealing module pattern
   - Connect to Firebase services
   - Handle loading/error states
   - Clean up listeners

4. **Test Scaling**
   - Check at 1366px (laptop)
   - Check at 1920px (desktop)
   - Check at 2560px (large monitor)
   - Verify mobile stack

### Iteration Checklist
- [ ] Component fits within panel boundaries
- [ ] Scaling works across viewports
- [ ] Colors match design system
- [ ] Spacing follows scale
- [ ] Interactive states work
- [ ] Firebase integration complete
- [ ] Error states handled
- [ ] Loading states shown

---

## Quick Reference

### CSS Class Naming
```css
/* Component roots */
.user-profile-root
.week-nav-root
.team-info-root

/* Sub-sections */
.component-header
.component-content
.component-footer

/* States */
.is-loading
.is-active
.has-error
```

### Common Tailwind Utilities

**With Theme Variables:**
```css
/* Colors - automatically use your theme */
bg-background, bg-card, bg-primary
text-foreground, text-muted-foreground
border-border, border-input

/* Spacing - use Tailwind's scale */
p-4 (1rem), m-2 (0.5rem), gap-4, space-y-2

/* Typography */
text-sm, text-base, font-semibold, font-mono

/* Layout */
flex, flex-col, grid, items-center, justify-between

/* Sizing */
w-full, h-full, min-h-screen, max-w-md

/* Borders & Radius */
border, rounded-md, rounded-lg

/* Shadows (from theme) */
shadow-sm, shadow-md, shadow-lg

/* States */
hover:bg-primary/90, focus:ring-2, disabled:opacity-50
```

**Example Component with Full Tailwind:**
```html
<div class="bg-card text-card-foreground rounded-lg border border-border p-6 shadow-sm">
  <div class="flex items-center justify-between mb-4">
    <h2 class="text-xl font-semibold">Team Info</h2>
    <button class="text-muted-foreground hover:text-foreground transition-colors">
      <svg class="w-5 h-5">...</svg>
    </button>
  </div>
  <div class="space-y-2">
    <p class="text-sm text-muted-foreground">Manage your team settings</p>
  </div>
</div>
```

### Debug Helpers
```javascript
// Check if panel fits content
console.log('Panel height:', _panel.offsetHeight);
console.log('Content height:', _panel.scrollHeight);

// Check computed styles
const styles = window.getComputedStyle(_panel);
console.log('Font size:', styles.fontSize);
console.log('Padding:', styles.padding);
```
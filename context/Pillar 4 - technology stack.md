# Pillar 4: Technology Stack Blueprint

**Purpose:** This document serves as the definitive technical reference for all tools, libraries, frameworks, and platforms used in the MatchScheduler project. It defines the "with what" we build, ensuring consistency and preventing the use of unapproved or outdated technologies. All development must use this stack exclusively.

## 1. Core Technology Stack

| Category | Technology | Version / Specification |
|----------|------------|------------------------|
| Backend Platform | Firebase | v11+ (Modular SDK) |
| Database | Cloud Firestore | - |
| Serverless Logic | Cloud Functions | Node.js 20 |
| Authentication | Firebase Auth | Google Provider |
| Frontend Framework | Vanilla JavaScript | ES6+ |
| Reactive UI | Alpine.js | v3.13+ |
| Styling | Tailwind CSS | v3+ |
| Build Tool | None (MVP) / Vite (Post-MVP) | - |
| Local Environment | Firebase Emulator Suite (Hybrid) | - |

## 2. Frontend Technologies

### Framework: Vanilla JavaScript (ES6+)

**Decision:** We will use modern, standard JavaScript without a heavy frontend framework like React, Angular, or Vue.

**Reasoning:**

- **Simplicity:** For the project's scale, a full framework introduces unnecessary complexity and a steep learning curve. Vanilla JS is sufficient
- **Performance:** Avoids the overhead of a large framework library, leading to faster initial load times
- **No Build Step (for MVP):** Allows for rapid development and deployment without configuring complex build tools like Webpack or Vite initially

### Reactive UI: Alpine.js

**Decision:** Alpine.js is used for reactive UI components, particularly the availability grid and other interactive elements that benefit from declarative state management.

**Reasoning:**

- **Lightweight:** Only 15KB minified - adds minimal overhead compared to React/Vue
- **Tailwind-Native:** Created by the same community, designed to work seamlessly with Tailwind CSS
- **No Build Step:** Works directly in the browser via CDN, consistent with our MVP approach
- **Declarative State:** Simplifies complex UI interactions (grid selection, toggles, real-time updates) without manual DOM manipulation
- **Progressive Enhancement:** Can be added to specific components without rewriting existing vanilla JS code

**Usage Pattern:**

```html
<!-- Alpine.js component example for availability grid -->
<div x-data="availabilityGrid()" class="grid grid-cols-8">
    <template x-for="slot in slots" :key="slot.id">
        <div
            @click="toggleSlot(slot.id)"
            :class="slot.selected ? 'bg-primary' : 'bg-muted'"
            class="p-2 cursor-pointer">
            <span x-text="slot.label"></span>
        </div>
    </template>
</div>

<script>
function availabilityGrid() {
    return {
        slots: [],
        async init() {
            // Load from cache, set up Firebase listener
        },
        toggleSlot(id) {
            // Optimistic update + Firebase sync
        }
    }
}
</script>
```

**Integration with Existing Patterns:**

- Services (AuthService, TeamService) remain vanilla JS - they manage cache
- Alpine components consume services and own their Firebase listeners
- The cache + listener pattern is preserved, Alpine just handles the reactive UI rendering

### Styling: Tailwind CSS

**Decision:** All styling will be implemented using Tailwind CSS utility classes. Custom CSS files for individual components are forbidden.

**Reasoning:**

- **Consistency:** Enforces the use of a pre-defined design system (colors, spacing, typography), preventing visual inconsistencies
- **Maintainability:** Styles are co-located with their HTML elements, making them easier to find and update
- **AI-Friendly:** AI models are highly proficient at generating and understanding utility-class-based styling

### Build Tool: None (for MVP), Vite (for Production Optimization)

**Decision:** Initial development will not use a build tool. Post-MVP, Vite will be introduced to optimize for production.

**Reasoning:**

- **MVP Speed:** Skipping the build tool setup allows us to focus entirely on functionality during the initial development phase
- **Future Optimization:** Vite is a modern, extremely fast build tool that will be used later for "tree-shaking" (removing unused code from libraries like Firebase) and bundling, significantly reducing the final application size and improving load times

## 3. Backend Technologies

### Platform: Firebase (v11+)

**Decision:** The entire backend infrastructure will be built on the Firebase platform, using the modern v11+ modular SDK.

**Reasoning:**

- **All-in-One Solution:** Firebase provides a tightly integrated suite of tools (Database, Functions, Auth, Hosting) that work together seamlessly, reducing the need to manage multiple services
- **Real-time Capabilities:** Firestore's real-time listeners are fundamental to the app's interactive nature
- **Scalability:** Firebase is built to scale automatically, providing a clear growth path for the future
- **Lesson Learned:** Previous project failures were caused by refactoring from older Firebase versions. By mandating v11+ from the start, we avoid this critical issue and benefit from its modularity and performance improvements

### Specific Firebase Services

- **Cloud Firestore:** The primary NoSQL database for all application data
- **Cloud Functions:** For all server-side logic, such as creating teams, processing events, and running scheduled jobs. The runtime will be Node.js 20
- **Firebase Authentication:** To handle all user sign-in and identity management, starting with Google OAuth
- **Firebase Hosting:** To serve the static frontend assets (HTML, CSS, JS)

## 4. Development Workflow & Tooling

### Authoring Tools

- **Code Editor:** Cursor
- **AI Assistants:** Claude
- **Terminal Environment:** Windows Subsystem for Linux (WSL)

### Local Development Environment: Hybrid Model

**Decision:** The local environment will run in a "hybrid" mode. The frontend (Hosting) and Cloud Functions will be run locally using the Firebase Emulator Suite, but they will connect to the live development Firestore database.

**Reasoning (Critical Lesson Learned):**

**Problem:** The Firestore Emulator does not always perfectly replicate the behavior of the production environment, particularly concerning the evaluation of complex firestore.rules. This led to bugs that were only discovered after deployment.

**Solution:** By connecting the locally-run frontend and functions to the live development database, we ensure that all security rules are tested against the real service, providing a much more accurate development experience and preventing post-deployment surprises.

### Version Control & Package Management

- **Version Control:** Git
- **Package Manager:** npm

## 5. Explicitly Forbidden Technologies

To enforce architectural integrity and prevent repeating past mistakes, the following are explicitly forbidden:

- **Complex State Management Libraries:** No Redux, MobX, Zustand, or similar. State is managed via the patterns in the Pillar 3 document
- **Older Firebase Versions:** Any version below v11 is not to be used. All code must use the modular `import { function } from 'firebase/...'` syntax
- **CSS-in-JS Libraries:** No Styled Components, Emotion, etc. All styling must be done with Tailwind CSS
- **jQuery:** This library is not needed and should not be included. Modern Vanilla JS provides all the necessary DOM manipulation capabilities

### Icon Libraries

**Decision:** Use open-source SVG icon libraries compatible with our vanilla JS approach.

**Available Options:**

- **Lucide Icons** (https://lucide.dev/)
  - Default icon set for shadcn/ui
  - 1450+ icons in consistent style
  - Clean, minimalist design
  - Each icon available as copyable SVG

- **Heroicons** (https://heroicons.com/)
  - Created by Tailwind CSS team
  - Available in two sizes: 20px (small) and 24px (medium)
  - Both outline and solid variants
  - Optimized for use with Tailwind utilities

**Implementation Pattern:**

Since we're using vanilla JavaScript (not React), use the direct SVG copy/paste approach:

```html
<!-- Example: Lucide "Users" icon for team -->
<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"></path>
</svg>

<!-- Example: Heroicons "Calendar" icon for availability -->
<svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
</svg>
```

**Styling Icons:**

Icons inherit color from CSS `color` property, making them easy to style with Tailwind:

```html
<!-- Tailwind color utilities -->
<svg class="w-5 h-5 text-sky-500">...</svg>
<svg class="w-5 h-5 text-slate-400 hover:text-slate-600">...</svg>

<!-- Size utilities (use Tailwind's width/height) -->
<svg class="w-4 h-4">...</svg>  <!-- 16px -->
<svg class="w-5 h-5">...</svg>  <!-- 20px -->
<svg class="w-6 h-6">...</svg>  <!-- 24px -->
```

**Best Practices:**

1. **Consistency:** Stick to one icon library per project for visual consistency
2. **Accessibility:** Always include descriptive titles or aria-labels for important icons
3. **Performance:** SVGs are inline, no additional HTTP requests
4. **Customization:** Use `currentColor` for stroke/fill to inherit text color

**Common Icons for MatchScheduler:**

- **Teams:** Users, UserGroup, People icons
- **Calendar:** Calendar, Clock, Schedule icons  
- **Settings:** Cog, Settings, Gear icons
- **Navigation:** ChevronLeft/Right, Menu, X icons
- **Actions:** Plus, Trash, Edit, Check icons
- **Status:** CheckCircle, XCircle, AlertCircle icons
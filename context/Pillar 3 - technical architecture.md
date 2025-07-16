# Pillar 3: Technical Architecture Blueprint

**Purpose:** This document serves as the single source of truth for how MatchScheduler is built. It consolidates all core architectural decisions for the data model, frontend structure, and state management, including the reasoning behind each choice. All development must adhere to these patterns.

## 1. Overall Architectural Philosophy

This architecture is founded on principles learned directly from previous development cycles. The primary goal is to favor simplicity and leverage the native strengths of the chosen tech stack, avoiding the over-engineering that caused issues in the past.

**Simplicity over Complexity:** The system is intentionally right-sized for a community of ~300 players. We will always choose the simplest solution that meets the requirements.

**Direct Data Flow:** UI components are responsible for their own data. They will subscribe directly to Firebase for the information they need, eliminating complex intermediate layers.

**Minimal State Management:** A global, complex state "warehouse" is explicitly forbidden. Cross-component communication will be handled by a minimal, simple event bus for coordination, not data distribution.

**Firebase-Native Patterns:** We will leverage the built-in capabilities of the modern Firebase SDK (v11+), such as its powerful real-time listeners and native caching, to reduce custom code.

## 2. Data Model & Database Structure (Firestore)

The database is designed with a core philosophy: separate data by its update frequency and access patterns. This optimizes for the most common user action: comparing team availability.

### Collection: /users/{userId}

This collection stores individual user profile information.

```json
{
  "displayName": "string",
  "initials": "ABC",          // 3 chars, unique per team
  "discordUsername?": "string",
  "photoURL?": "string",
  "teams": {
    "team_abc123": true,    // Map format for efficient lookups
    "team_def456": true
  },
  "savedTemplates?": {
    "template_name": ["mon_1800", "tue_1900"]
  },
  "lastLogin": "timestamp",
  "createdAt": "timestamp"
}
```

**Reasoning:**

- The teams map is a standard, performant way to check a user's team memberships without needing a separate query
- Storing initials here allows for easy display across the app, but uniqueness is enforced at the team level

### Collection: /teams/{teamId}

This collection holds the core information for each team, including the roster.

```json
{
  "teamName": "string",
  "leaderId": "userId",
  "divisions": ["1", "2"],
  "maxPlayers": 10,
  "joinCode": "ABC123",
  "status": "active | inactive | archived",
  "playerRoster": [
    {
      "userId": "user_123",
      "displayName": "Player Name",
      "initials": "ABC",
      "joinedAt": "timestamp",
      "role": "member | leader"
    }
  ],
  "lastActivityAt": "timestamp",
  "createdAt": "timestamp"
}
```

**Reasoning:**

- Embedding the playerRoster directly in the team document is efficient for a small community. For a roster size capped at 20, this is far more performant than querying a separate subcollection every time team info is needed
- The status field allows for filtering out inactive or archived teams from public view

### Collection: /availability/{teamId}_{weekId}

This top-level collection stores the high-frequency availability data.

```json
// Document ID format: "team_abc123_2025-W26"
{
  "teamId": "team_abc123",
  "year": 2025,
  "weekNumber": 26,
  "availabilityGrid": {
    "mon_1800": ["ABC", "XYZ"], // Player initials in time slots
    "mon_1830": ["ABC"],
    "tue_1900": ["ABC", "XYZ", "DEF"]
  },
  "lastUpdatedAt": "serverTimestamp()",
  "lastUpdatedBy": "userId"
}
```

**Reasoning (Critical Decision):**

**Problem:** Storing availability in a subcollection under each team (/teams/{teamId}/availability/{weekId}) makes the primary use case—comparing 5-10 teams at once—slow and expensive, requiring 5-10 separate queries.

**Solution:** By using a top-level collection with a compound document ID ({teamId}_{weekId}), we can fetch the availability for 10 teams for a given week in a single, highly efficient batch query.

**Tradeoff:** Document IDs are slightly longer, but the massive performance gain for the app's core feature is worth it.

### Collection: /eventLog/{eventId}

This collection provides a comprehensive, immutable audit trail for all significant system activities.

```json
{
  "eventId": "20250709-1430-slackers-team_created_X7Y9",
  "teamId": "team_abc123",
  "type": "TEAM_CREATED",
  "category": "TEAM_LIFECYCLE | PLAYER_MOVEMENT",
  "timestamp": "serverTimestamp()",
  "userId?": "user_xyz789",
  "details": "/* Event-specific metadata */"
}
```

**Reasoning:**

**Problem:** Simply updating documents loses historical context. We need to know when and why changes happened.

**Solution:** An event-sourcing model provides a perfect audit trail. It allows for future features like activity feeds, analytics on player movement, and makes debugging support issues trivial. This structure is future-proof and can be used to rebuild or migrate any other data structure if needed.

## 3. Frontend Architecture

The frontend is built on a set of strict, non-negotiable patterns to ensure consistency, maintainability, and a high-quality user experience.

### Layout System: The "Sacred 3x3 Grid"

The entire application UI is built on a fixed 3x3 grid. This structure is immutable.

```
┌─────────────┬─────────────────┬─────────────┐
│ User Profile│ Week Navigation │ Team Filters│
├─────────────┼─────────────────┼─────────────┤
│ Team Info   │ Grid Week 1     │ Favorites   │
├─────────────┼─────────────────┼─────────────┤
│ Grid Tools  │ Grid Week 2     │ Browse Teams│
└─────────────┴─────────────────┴─────────────┘
```

**Reasoning:**

- Provides a predictable and organized structure that is easy for both users and the AI to understand
- The layout is optimized for desktop gaming setups (e.g., 1080p monitors), the primary use case
- Using clamp() for column widths creates a "hybrid" scaling system that is responsive on various monitor sizes without breaking the layout

### Styling: Tailwind CSS & OKLCH Color System

All styling is handled through utility classes, not custom component CSS.

**Method:** We use Tailwind CSS exclusively. Component-specific styles are forbidden.

**Theme:** The color palette is defined using CSS variables with the modern OKLCH color space, generated via a tool like TweakCN. This provides a professional, consistent theme with automatic dark mode support.

**Reasoning:**

- A utility-first approach with a centralized theme is highly maintainable and scalable
- It forces consistency across all components
- AI tools are very effective at working with utility classes and pre-defined design systems
- OKLCH is perceptually uniform, making it better for creating accessible and visually pleasing color schemes

### Component Pattern: Revealing Module Pattern

All JavaScript components must follow this pattern to encapsulate logic and avoid polluting the global scope.

```javascript
const ComponentName = (function() {
    // Private variables and methods
    let _panel;
    function _render() { /* ... */ }

    // Public API
    function init(panelId) {
        _panel = document.getElementById(panelId);
        _render();
        // ...
    }

    return { init }; // Reveal only the public methods
})();
```

**Reasoning:**

- This pattern provides clear separation between public and private code, making components easier to understand and debug
- It prevents naming conflicts between different components
- It creates a predictable and consistent API for all components (init, update, etc.), which is very AI-friendly

## 4. State Management Strategy

This is the most critical architectural decision, born from the failure of a previous, over-engineered approach.

### The Problem: The Over-Engineered "Warehouse"

The previous version used a 400+ line central StateService that handled deep cloning, complex subscription tracking, type validation, and more. This created more bugs than it solved and was incredibly difficult to debug.

### The Solution: Radical Simplification

We are explicitly rejecting a complex state management library or a central state "warehouse". The new architecture uses two simple, decoupled patterns:

**Direct Component Subscriptions:** As stated above, each component subscribes directly to the Firestore data it needs. Firebase's SDK handles caching, offline support, and real-time updates.

**Simple Event Bus for Coordination:** For the few cases where components need to coordinate (e.g., "the user selected a new team"), we use a minimal, ~50-line event bus.

```javascript
// The entire state coordination system
const AppEvents = {
  listeners: new Map(),
  emit(event, data) {
    this.listeners.get(event)?.forEach(callback => callback(data));
  },
  on(event, callback) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }
};
```

**Reasoning:**

- **90% Reduction in Code:** This approach drastically reduces the amount of state-related boilerplate code
- **Clear Data Flow:** Debugging is trivial. If data is wrong in a component, the problem is either in the component's query or the database itself. There is no complex intermediate layer to inspect
- **Leverages Firebase:** We let Firebase do the heavy lifting of caching and real-time synchronization, which it is designed to do well
- **Faster Development:** No need to learn a complex state management library. The patterns are simple and intuitive
# Pillar 2: Performance & User Experience Blueprint

**Purpose:** This document defines the application's "feel." It is the single source of truth for all performance requirements, error handling procedures, and user feedback patterns. The goal is to create an experience that feels fast, responsive, and reliable.

## 1. Core Philosophy: The 99/1 Rule

We optimize for what users do 99% of the time, not the 1% edge cases. This philosophy dictates our entire approach to performance and UX.

### Hot Paths (The 99% - Must Be Instant)

These are common, repetitive actions that must feel instantaneous (< 50ms) to the user. We will use optimistic updates and aggressive caching to eliminate any perception of loading.

- Toggling availability slots
- Switching between a user's teams
- Navigating between weeks
- Filtering and selecting teams for comparison

### Cold Paths (The 1% - Can Show Loading)

These are infrequent, one-time actions where a brief loading state (< 2 seconds) is acceptable and expected.

- Initial application load
- Creating a new team
- Joining or leaving a team
- Uploading a logo

## 2. Performance Implementation Patterns

This section defines the technical strategies we use to achieve our performance goals.

### Caching Strategy: Pre-load Everything

**On App Load:** The application will fetch all team data and all availability data for all teams into a local cache.

**Smart Refresh:** Subsequent loads will check the freshness of the cache against the server and only download data that has changed.

**Reasoning:** For a community of this size (~40 teams), the total dataset is small (~188KB). A full pre-load is negligible on modern connections and enables instant browsing, filtering, and comparison setup, which are core "Hot Path" activities.

### Optimistic Updates for Hot Paths

**Pattern:** For any "Hot Path" action (like setting availability), the UI will update immediately as if the operation succeeded. The data is sent to Firebase in the background.

**Rollback:** If the background operation fails, the UI will revert the change and notify the user.

**Reasoning:** This makes the application feel exceptionally fast and responsive, as the user never has to wait for a server round-trip for common actions.

### Real-time Listener Management

**Strategy:** Components subscribe directly to the Firestore data they need. Listeners are managed to be active only when necessary.

**Lifecycle:** Listeners are activated when a component is visible or a feature (like comparison) is in use. They are cleaned up when the user navigates away or the tab becomes inactive for an extended period.

**Auto-Resume:** When a user returns to the tab, a health check is performed to silently refresh data and restart listeners if needed.

## 3. Error Handling & User Feedback

This section defines how the system communicates its state (success, errors, warnings) to the user.

### Error Categories

**User Input Errors:** Invalid data entered by the user (e.g., "Team tag must be 4 characters," "Join code not found"). These are handled with inline validation messages.

**Permission Errors:** A user attempts an action they are not authorized for (e.g., a member tries to kick another player). These are handled with clear, explanatory modals or toasts.

**System Errors:** Issues with network connectivity or backend services. These are handled with persistent banners and automatic recovery mechanisms.

### Feedback Mechanisms

**Toast Notifications:** For brief, non-blocking status updates (e.g., "Team created successfully," "Changes saved," "Failed to update availability - changes reverted"). Toasts are color-coded:

- **Green (Success):** For successful actions
- **Red (Error):** For failed actions that require user attention
- **Yellow (Warning):** For important information (e.g., "Working offline")
- **Blue (Info):** For helpful tips or instructions

**Modals:** For actions that require user confirmation or have significant consequences (e.g., "Are you sure you want to leave this team?").

**Inline Messages:** For validating specific input fields (e.g., "This team name is already taken").

**Empty States:** For when there is no data to display (e.g., a new user who hasn't joined a team, or a comparison that yields no matching time slots).

### Connection & Recovery System

**Offline Indicator:** A persistent banner will appear when the user loses connection, informing them they are in offline mode and changes will be synced later.

**Automatic Recovery:** The system will automatically detect when the connection is restored, sync any pending changes, and update the UI.

**Optimistic Update Rollback:** As defined in the performance section, if an optimistic update fails, the UI change is reverted, and a red error toast is shown to the user.

## 4. Loading State Strategy

This section explicitly defines when and how to show loading indicators, based on our Hot vs. Cold Path philosophy.

### Hot Paths: No Loading States

**Rule:** There will be no spinners or loading indicators for any action defined as a "Hot Path." The perception of speed is paramount.

**Implementation:** These actions rely on cached data and optimistic updates to provide an instant response.

### Cold Paths: Clear Loading States

**Rule:** Actions defined as "Cold Paths" must display a clear, non-blocking loading indicator.

**Implementation:**

- For actions within a modal (like creating a team), the primary action button will enter a disabled state with a loading spinner and text (e.g., "Creating...")
- For page-level actions (like the initial app load), a subtle loading animation will be displayed in the center of the screen
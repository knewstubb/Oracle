# Requirements: PWA Infrastructure

## 1. Problem Statement

Users wanted to access The Oracle from their phone's home screen without going through a browser. A Progressive Web App (PWA) provides native-like experience with full-screen mode and persistent camera permissions.

## 2. Outcome

Installable PWA with home screen icons, standalone display mode, and mobile-optimized navigation.

## 3. Users

| User | Role |
|------|------|
| Mobile user | Accesses the app from phone home screen |

## 4. Non-Functional Requirements

| ID | Requirement |
|----|-------------|
| NFR-1 | Install prompt appears on compatible browsers |
| NFR-2 | App loads in standalone mode (no browser chrome) |

## 5. User Stories & Acceptance Criteria

### 5.1 Installation

**US-5.1.1** As a mobile user, I want to install the app to my home screen.

#### Acceptance Criteria
- WHEN using iOS Safari, THE SYSTEM SHALL be installable via "Add to Home Screen".
- WHEN using Android Chrome, THE SYSTEM SHALL prompt "Install app" in menu.
- WHEN installed, THE SYSTEM SHALL launch in standalone display mode.

### 5.2 Manifest

**US-5.2.1** As a mobile user, I want proper app branding when installed.

#### Acceptance Criteria
- WHEN viewing app info, THE SYSTEM SHALL show "The Oracle" as the app name.
- WHEN installed, THE SYSTEM SHALL use 192px and 512px icons.
- WHEN installed, THE SYSTEM SHALL use the app's dark theme color.

### 5.3 Mobile Navigation

**US-5.3.1** As a mobile user, I want easy navigation on small screens.

#### Acceptance Criteria
- WHEN viewport < 768px, THE SYSTEM SHALL replace sidebar with hamburger menu.
- WHEN tapping hamburger, THE SYSTEM SHALL show slide-out drawer.
- WHEN navigating, THE SYSTEM SHALL close the drawer automatically.

### 5.4 Safe Areas

**US-5.4.1** As an iOS user, I want content to respect device safe areas.

#### Acceptance Criteria
- WHEN on iOS with notch/dynamic island, THE SYSTEM SHALL pad content from top safe area.
- WHEN on iOS with home indicator, THE SYSTEM SHALL pad navigation from bottom safe area.

## 6. In Scope

- manifest.json with icons and theme
- Standalone display mode
- Mobile hamburger menu
- iOS safe-area-inset handling
- Version badge (v0.2.0)

## 7. Out of Scope

| Item | Reason |
|------|--------|
| Offline support | Requires service worker complexity |
| Push notifications | Not needed for single-user app |

## 8. Open Questions

None — shipped.

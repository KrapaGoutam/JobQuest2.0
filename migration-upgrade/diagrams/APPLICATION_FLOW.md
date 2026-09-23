# Application Flow Diagram

The full navigation map and all 13 user journeys live in `../docs/APP_FLOW.md` —
this file holds the single top-level navigation diagram for quick reference; see
that document for every journey-specific flowchart.

```mermaid
flowchart TD
    Auth[Auth] -->|success| Dashboard

    subgraph Primary
        Dashboard --> Applications
        Applications --> AppDetail[Application Detail]
        Applications --> AddApp[Add/Edit Application]
    end

    subgraph Activity
        Calendar
        Tasks
        Habits
        Notes
        Reminders
        Interviews
        Rejections
        FollowUps[Follow-Ups]
        Networking
    end

    subgraph CareerAssets["Career Assets"]
        Resumes
        Bulk[Bulk Import]
    end

    subgraph Insights
        Analytics
        GoalHistory[Goal History]
        Aging[Aging Report]
        StageAnalytics[Stage Analytics]
        Exports
    end

    subgraph ManagerOnly["Manager (role-gated)"]
        ManagerDash[Manager Dashboard]
        Users[User Management]
        Audit[Audit History]
    end

    Dashboard --> Activity
    Dashboard --> CareerAssets
    Dashboard --> Insights
    Dashboard -.->|role: MANAGER| ManagerOnly

    AppDetail --> Interviews
    AppDetail --> FollowUps
    AppDetail --> Networking
    AppDetail --> Tasks
    AppDetail --> Notes

    Bulk --> ImportHistory[Import History\n— orphaned nav item, CR-004]

    Settings --> Profile
    Settings --> Goals[Goal Settings]
    Settings --> Reminders
    Dashboard --> Settings
```

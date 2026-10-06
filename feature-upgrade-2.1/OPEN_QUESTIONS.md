# Open Questions

### Requires Product Decision

1. **Goal History Alteration:** If a user changes their daily application goal from 10 to 15, should historical days retroactively show a target of 15, or should they lock in the target of 10 from the time they were recorded? (Recommendation: Lock historical targets to preserve true historical attainment).
2. **AI JSON Scope:** Should the "Copy Job JSON" functionality live inside the Browser Extension popup, the main JobQuest web application, or both? (Recommendation: The web application, as it has the definitive, persisted state).
3. **Application Date Grouping semantics:** Should "Today" and "Yesterday" in the "Group by Date" view shift based on the exact user timezone at the moment of viewing, or UTC boundaries? (Recommendation: Local user timezone, matching the dashboard metrics).

### Requires External/Provider Research

1. **ChatGPT Custom Actions:** Verify if ChatGPT Custom Actions support polling external REST APIs on a schedule without user intervention (for Daily Digests), or if they are strictly user-prompt driven.



## Reorder Sidebar Navigation Items

Move **Events**, **Stages**, and **Communities** above **Feature Requests** in the left sidebar menu.

### Current order (lines 43-48):
```text
Feature Requests
Staking
Governance
Communities
Events
Stages
```

### New order:
```text
Communities
Events
Stages
Feature Requests
Staking
Governance
```

### Change
In `src/constants/app.constants.ts`, reorder lines 43-48 so Communities, Events, and Stages come before Feature Requests, Staking, and Governance.


# Connected release 16.18.3

## Checklist list refinement

- Adds a visible Complete/Completed label beside every checklist checkbox.
- Reflows checklist-card controls into a compact header that wraps cleanly on mobile.
- Adds an All projects filter to Work → All checklist.
- Renames the search-field label to Search text while retaining matching across checklist descriptions, parent tasks and projects.
- Preserves the parent-task, project, responsible-person and deadline context and the Open task action.

## Deployment

This is a Connected frontend-only release using the existing workspace-isolated project and checklist routes. No database migration or Worker deployment is required. The service-worker cache advances to 16.18.3.

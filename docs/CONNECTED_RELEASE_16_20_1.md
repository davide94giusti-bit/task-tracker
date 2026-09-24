# Connected 16.20.1 — User Manual rendering hotfix

## Fixed

- Prevents the User Manual from rendering a blank screen after new text-only chapters are added.
- Replaces fragile chapter-position walkthrough selection with an explicit chapter-to-visual mapping.
- Keeps the new Checklist editor and Project people chapters available without requiring duplicate screenshots.
- Adds a server-render regression test for the complete manual view.

## Deployment

This is a frontend-only hotfix. No Supabase migration or Worker deployment is required.

Deploy Cloudflare Pages after merging the patch. The service-worker cache advances to `task-tracker-connected-v16-20-1`, so installed PWAs receive the corrected application shell.

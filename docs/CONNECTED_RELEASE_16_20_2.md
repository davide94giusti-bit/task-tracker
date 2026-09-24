# Connected 16.20.2 — deep-link asset hotfix

## Fixed

- Invitation URLs such as `/join/CODE` now load the Connected JavaScript, stylesheet, manifest, and icons from the site root.
- Prevents Cloudflare Pages' SPA fallback from returning `index.html` for mistaken `/join/assets/...` requests.
- Eliminates the resulting JavaScript and stylesheet MIME-type errors and blank invitation page.
- Retains the v16.20.1 User Manual rendering correction.

## Deployment

This is a frontend-only hotfix. No Supabase migration or Worker deployment is required.

Deploy Cloudflare Pages after merging. The service-worker cache advances to `task-tracker-connected-v16-20-2`.

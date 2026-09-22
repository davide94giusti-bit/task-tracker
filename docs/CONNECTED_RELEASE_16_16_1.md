# Connected release 16.16.1

## Guided PWA installation for notifications

This release adds a platform-aware Task Tracker installation experience without changing the browser security model. Installation and notification permission remain separate, explicit user decisions.

- Supported Chromium browsers receive an in-app **Install Task Tracker** action that opens the native browser confirmation through `beforeinstallprompt`.
- iPhone and iPad receive a Safari-specific **Share → Add to Home Screen** guide because iOS does not expose a programmable installation prompt.
- Installed mode is detected through the standalone display mode and the iOS standalone property.
- The application reacts to `appinstalled`, hides obsolete prompts, and explains that notification permission must still be enabled.
- Settings shows application installation and browser notification-permission status next to the existing backend and subscription readiness.
- The signed-in application shows a dismissible installation reminder where installation is available or required. Dismissal lasts seven days and Settings always retains the installation action.
- On iPhone or iPad, **Enable notifications** redirects to installation guidance until Task Tracker is launched as an installed Home Screen app.
- Desktop browsers may continue enabling notifications without installation when their browser supports it.

The service-worker cache name is advanced so existing installations retrieve the new application shell. No Supabase migration or Worker API change is required.

## Focused Today and collapsible Dashboard

- Today keeps task and checklist attention only; Deadline Pressure is no longer embedded in that view.
- Dashboard headline task metrics remain visible at a glance.
- Overall workload, Progress by project, Checklist attention, Deadline pressure, and Total cost start collapsed and expand independently.
- Collapsed sections are keyboard accessible and defer their heavier data requests until opened.

## Deployment

Deploy Workers and Pages through the existing coordinated Connected deployment. Although Worker code is unchanged, the shared release version is `16.16.1`, so the normal deployment keeps health versions aligned. Existing v16.16.0 database migration `0020` remains current.

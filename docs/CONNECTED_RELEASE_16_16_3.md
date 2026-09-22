# Connected release 16.16.3

## Cross-platform shared-portal installation

Shared-work installation and notification onboarding now applies consistently across installable browsers.

- Android is treated as an installation-capable platform and receives **Install Task Tracker to enable notifications** before notification permission.
- Desktop Chrome, Microsoft Edge, and other browsers exposing `beforeinstallprompt` receive the same shared-portal installation action and their native confirmation dialog.
- The portal remembers that installation capability after the native dialog is dismissed, so it does not incorrectly fall back to the notification switch.
- The current `/shared-tasks?token=...` destination is stored before invoking installation.
- On first standalone launch, Task Tracker consumes the saved destination, removes it, and redirects from the manifest `/` start page to the originating shared portal.
- Once installed, the portal requests notification permission. The subscription switch appears after permission is granted.
- Browsers that genuinely have no PWA installation facility retain direct browser-notification setup.
- iPhone and iPad retain the Safari Share → Add to Home Screen instructions.

No database migration or API change is required. The service-worker cache advances to `16.16.3`.

## Deployment

Build and deploy the coordinated Connected release, followed by Cloudflare Pages. Existing database migration `0020` remains current.

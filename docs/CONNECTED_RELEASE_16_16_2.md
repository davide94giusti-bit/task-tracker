# Connected release 16.16.2

## Shared-portal PWA notification onboarding

The public Shared work portal now applies the same installation prerequisites as the signed-in application on iPhone and iPad.

- A recipient using the portal in an iPhone/iPad browser sees **Install Task Tracker to enable notifications** instead of an ineffective notification switch.
- The action opens the Safari **Share → Add to Home Screen** guide.
- After launching the installed Home Screen application, the portal shows **Enable notifications** until browser permission is granted.
- The **Browser notifications** subscription switch is exposed only after the installed application has notification permission.
- Installed applications do not receive another installation prompt.
- Installing from a shared link remembers that link and returns the newly launched Home Screen app to the same collaboration portal without dropping its access token.
- Denied notification permission produces an actionable device-settings message.
- Permission state is refreshed when the portal regains focus or visibility.
- Other platforms retain the existing notification subscription behavior.

This is a frontend-only follow-up. It reuses the existing public push-subscription endpoint and does not require a Supabase migration or Worker route change. The service-worker cache advances to `16.16.2` so existing installations retrieve the updated portal.

## Deployment

Deploy the coordinated Connected release normally. No database migration is required. Workers can be built and deployed with the shared `16.16.2` release version, followed by Cloudflare Pages.

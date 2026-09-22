# Connected release 16.18.4

## Contact editing

- Adds an Edit action to every card in People.
- Loads the current private contact record before editing so the form includes the latest name, function, company, email, phone, address, website, preferred contact method, and notes.
- Keeps task assignments, project links, shared access, and recap settings unchanged when contact details are updated.
- Uses the contact version for optimistic concurrency. A stale editor receives a conflict message instead of overwriting a newer update from another device.
- Preserves workspace authorization through the existing API Gateway → People Worker → Data Worker path.
- Updates the User Manual with the editing workflow and conflict behavior.

## Deployment

No database migration is required. Deploy the Data Worker, People Worker, API Gateway, and Cloudflare Pages together. The service-worker cache advances to 16.18.4.

Recommended order:

1. Data Worker
2. People Worker
3. API Gateway
4. Cloudflare Pages

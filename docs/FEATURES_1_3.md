# Task Tracker 1.3 feature behavior

## Progress summaries and filtered drill-downs

Project cards show average calculated progress across every current and completed task assigned to that project. People cards use the same rule across the person's complete assigned task load. Completed tasks contribute 100%; active tasks contribute their current automatic, weighted, or manual progress. Cancelled, archived, and trashed tasks are excluded. The Task service owns these aggregate rules and exposes them through the versioned local Gateway contract.

Dashboard metric cards explain their counting rule in an information tooltip and open a task view carrying the exact corresponding server-side filter. The same applies to overall workload, each project progress row, and each day in the seven-day workload graph. Project and people cards drill down by stable project/person identifier. All Tasks also provides a project selector.

**Today** contains active tasks due today or overdue. Priority and Waiting status alone do not put a future or undated task in Today. **Next 7 days** begins tomorrow and ends seven local calendar days from today.

Reminder, recurrence, due date, project, and responsible-person fields support explicit clearing. The Data service distinguishes an omitted property (keep the previous value) from an explicit `null` (clear it). Calendar date popups are one-shot selections and are not reopened from stale navigation state.

Dark mode sets both the application background and foreground at the root and main-content boundaries so page subtitles and secondary text retain theme contrast.

## Checklist items and prerequisite tasks

A checklist item is a step performed inside its parent task. A prerequisite is an independently managed task with its own owner, due date, reminder, history, project, and priority. Only prerequisite tasks contribute to **Dependency load by person**.

- Required, incomplete checklist items prevent completion; optional items do not.
- Mandatory, incomplete prerequisite tasks prevent completion; optional relationships do not.
- Completed, cancelled, archived, or trashed prerequisites are not active blockers.
- Clearing every blocker unlocks the waiting task but does not complete it automatically.
- **Create new prerequisite** creates the task and relationship in one Data-service transaction.
- **Convert to prerequisite task** creates the prerequisite, links it, and removes the checklist item in one transaction.
- Trashing a prerequisite hides its relationship. Restoring it reactivates the preserved relationship; permanent deletion removes it through SQLite foreign-key cascading.

## Dependency load by person

The Dependency & Progress service traverses the active dependency graph in reverse from every incomplete mandatory prerequisite. Affected tasks include direct and indirect active downstream tasks. Within one person's totals, an affected task and its project count once even when several prerequisites or paths reach it. The drill-down retains the distinct prerequisite relationships and shortest safe path. A task reached from prerequisites owned by multiple people is marked **Shared dependency** for each person. Missing owners are grouped as **Unassigned**.

Default order is impact score, affected tasks, affected projects, then person name. The formula is:

`10 × affected tasks + 25 × affected projects + 15 × overdue prerequisites + 20 × critical affected tasks + 10 × high-priority affected tasks + 2 × capped dependency depth`

Dependency depth is capped at three per affected task. Visited-node and path checks prevent duplicate-path inflation and infinite traversal if legacy data contains a cycle.

## Calendar

The calendar requests only the visible month plus its leading/trailing week. A task appears for its due date, reminder date, or completion date. Project/task start dates are intentionally excluded. If several fields put one task on the same day, it appears once with multiple reason badges.

Primary day severity is red for overdue or critical, orange for high priority, blue for ordinary scheduled work, green for completed-only work, and neutral for an empty day. Counts and text labels accompany color. Selecting a day opens its tasks; **Add task** pre-fills that day as the due date. Selecting a task deep-links to its exact editor and preserves the calendar date in the route.

## Diagnostics and responsiveness

Prerequisite candidates are loaded only while the Dependencies tab is open and are searched in pages of at most 50. Save/delete/create/convert/import/backup operations expose pending state. Task operations use controlled dialogs instead of blocking browser dialogs. Renderer errors, unhandled rejections, failed or timed-out API actions, and UI tasks over 250 ms are stored in privacy-filtered renderer diagnostics. Routine reminder polling is excluded from information-level request logs.

The diagnostics screen displays every local service separately. Non-Data services can be restarted with a bounded supervisor operation. Data requires an application restart to preserve database ownership and consistency.

## Windows icon

`build/icon.svg` is the canonical vector design and `build/icon-source.png` is its checked-in 256-pixel build input. `scripts/generate-windows-icon.ps1` creates `build/brand-icon.ico` at 16, 20, 24, 32, 40, 48, 64, 128, and 256 pixels using ImageMagick 7. Electron Builder applies this icon to the executable, installer, shortcuts, and application window. Changing it requires rebuilding; there is no misleading runtime emoji/icon setting.

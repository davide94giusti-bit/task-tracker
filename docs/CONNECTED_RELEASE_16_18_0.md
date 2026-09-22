# Connected release 16.18.0

## Work

The former All Tasks navigation entry is now **Work**. It contains two independent sections—**All tasks** and **All checklist**—that both start collapsed. Expanding All tasks preserves the existing task filters, sorting, table/card layouts and actions. All checklist provides backend-filtered open, overdue, due-today, next-seven-days, required and completed views.

Checklist rows show the checklist description and its upward context: parent task, project, responsible person, parent due date, status, priority and blocked state. Users can complete the item directly or open its parent task.

## Dashboard

Dashboard now places two calm, compact six-card groups side by side on larger screens and stacked on smaller screens. Task and checklist counts remain semantically separate. The old Checklist attention dropdown is removed; its information is represented by Open, Overdue, Due today, Next 7 days, Required and Completed checklist cards.

This release adds `GET /v1/tasks/checklists`. No database migration is required. Deploy Tasks Worker, API Gateway, and Pages together. The service-worker cache advances to 16.18.0.

export type View='dashboard'|'today'|'tasks'|'upcoming'|'calendar'|'projects'|'people'|'dependencies'|'completed'|'trash'|'settings'|'access'|'security'|'backup'|'diagnostics';
export type Task={id:string;title:string;description:string;status:string;priority:string;dueDate?:string|null;dueTime?:string|null;projectId?:string|null;projectName?:string;responsiblePersonId?:string|null;responsiblePersonName?:string;calculatedProgress:number;blocked:boolean;version:number;updatedAt:string};
export type Project={id:string;name:string;color:string;description:string;progress:number;activeTasks:number};
export type Person={id:string;fullName:string;role:string;company:string;progress:number;activeTasks:number};
export type Dashboard={counts:Record<string,number>;overallProgress:number;projectProgress:Project[];peopleProgress:Person[];workload:Array<{date:string;count:number}>};
export type ChecklistItem={id?:string;taskId?:string;description:string;completed:boolean;required:boolean;position?:number};
export type TaskDependency={id:string;waitingTaskId:string;prerequisiteTaskId:string;mandatory:boolean;prerequisiteTitle:string;prerequisiteStatus:string};
export type NotificationItem={id:string;taskId?:string|null;kind:string;status:string;createdAt:string;deliveredAt?:string|null;readAt?:string|null};

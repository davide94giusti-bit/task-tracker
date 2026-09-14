export type View='dashboard'|'today'|'tasks'|'upcoming'|'calendar'|'projects'|'people'|'dependencies'|'completed'|'trash'|'settings'|'backup'|'diagnostics';
export type Task={id:string;title:string;description:string;status:string;priority:string;dueDate?:string|null;dueTime?:string|null;projectId?:string|null;projectName?:string;responsiblePersonId?:string|null;responsiblePersonName?:string;calculatedProgress:number;blocked:boolean;version:number;updatedAt:string};
export type Project={id:string;name:string;color:string;description:string;progress:number;activeTasks:number};
export type Person={id:string;fullName:string;role:string;company:string;progress:number;activeTasks:number};
export type Dashboard={counts:Record<string,number>;overallProgress:number;projectProgress:Project[];peopleProgress:Person[];workload:Array<{date:string;count:number}>};

import type { BottleneckAnalysis, CalendarRange, CalendarTask, DependencyRelationship, Person, Project, Task, TaskRef } from './types';

export const IMPACT_WEIGHTS={affectedTask:10,affectedProject:25,overduePrerequisite:15,criticalTask:20,highPriorityTask:10,indirectDepth:2,maxIndirectDepth:3} as const;
const inactive=(t:Task)=>Boolean(t.deletedAt)||t.archived||['completed','cancelled','archived'].includes(t.status);
const localDate=(d:Date)=>{const y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`};
const daysOverdue=(due?:string|null)=>due&&due<localDate(new Date())?Math.max(1,Math.floor((new Date().setHours(0,0,0,0)-new Date(`${due}T00:00:00`).getTime())/864e5)):0;

function ref(t:Task,people:Map<string,Person>,projects:Map<string,Project>):TaskRef{return{id:t.id,title:t.title,status:t.status,priority:t.priority,projectId:t.projectId,projectName:projects.get(t.projectId||'')?.name||'No project',responsiblePersonId:t.responsiblePersonId,responsiblePersonName:people.get(t.responsiblePersonId||'')?.fullName||'Unassigned',dueDate:t.dueDate}}

export function calculateDependencyLoad(tasks:Task[],peopleInput:Person[],projectsInput:Project[]):BottleneckAnalysis{
  const taskById=new Map(tasks.map(t=>[t.id,t])),people=new Map(peopleInput.map(p=>[p.id,p])),projects=new Map(projectsInput.map(p=>[p.id,p]));
  const active=tasks.filter(t=>!inactive(t)),reverse=new Map<string,string[]>();
  for(const waiting of active)for(const link of waiting.links)if(link.type==='blocked_by'&&link.mandatory){const prerequisite=taskById.get(link.toTaskId);if(prerequisite&&!inactive(prerequisite)){const list=reverse.get(prerequisite.id)||[];if(!list.includes(waiting.id))list.push(waiting.id);reverse.set(prerequisite.id,list)}}
  type LoadRecord={personId:string|null;personName:string;prereqs:Set<string>;affected:Set<string>;projects:Set<string>;overdue:Set<string>;critical:Set<string>;high:Set<string>;depthByAffected:Map<string,number>;relationships:DependencyRelationship[]};
  const records=new Map<string,LoadRecord>();
  for(const prerequisite of active){
    if(!reverse.has(prerequisite.id))continue;
    const key=prerequisite.responsiblePersonId||'__unassigned__',personName=people.get(prerequisite.responsiblePersonId||'')?.fullName||'Unassigned';
    const record:LoadRecord=records.get(key)||{personId:prerequisite.responsiblePersonId||null,personName,prereqs:new Set(),affected:new Set(),projects:new Set(),overdue:new Set(),critical:new Set(),high:new Set(),depthByAffected:new Map(),relationships:[]};
    record.prereqs.add(prerequisite.id);if(daysOverdue(prerequisite.dueDate))record.overdue.add(prerequisite.id);
    const queue=(reverse.get(prerequisite.id)||[]).map(id=>({id,depth:1,path:[prerequisite.id,id]})),best=new Map<string,number>();
    while(queue.length){
      const current=queue.shift()!,affected=taskById.get(current.id);if(!affected||inactive(affected))continue;
      const prior=best.get(current.id);if(prior!==undefined&&prior<=current.depth)continue;best.set(current.id,current.depth);
      record.affected.add(affected.id);if(affected.projectId)record.projects.add(affected.projectId);if(affected.priority==='critical')record.critical.add(affected.id);if(affected.priority==='high')record.high.add(affected.id);
      record.depthByAffected.set(affected.id,Math.min(IMPACT_WEIGHTS.maxIndirectDepth,Math.max(record.depthByAffected.get(affected.id)||0,current.depth)));
      record.relationships.push({prerequisite:ref(prerequisite,people,projects),affectedTask:ref(affected,people,projects),depth:current.depth,direct:current.depth===1,path:current.path.map(id=>({id,title:taskById.get(id)?.title||'Unavailable task'})),sharedDependency:false,otherResponsiblePeople:[],daysOverdue:daysOverdue(prerequisite.dueDate)});
      for(const next of reverse.get(affected.id)||[])if(!current.path.includes(next))queue.push({id:next,depth:current.depth+1,path:[...current.path,next]});
    }
    records.set(key,record);
  }
  const ownersByAffected=new Map<string,Set<string>>();
  for(const record of records.values())for(const id of record.affected){const owners=ownersByAffected.get(id)||new Set();owners.add(record.personName);ownersByAffected.set(id,owners)}
  const result=[...records.values()].map(r=>{
    for(const relationship of r.relationships){const owners=[...(ownersByAffected.get(relationship.affectedTask.id)||new Set())].filter(name=>name!==r.personName);relationship.sharedDependency=owners.length>0;relationship.otherResponsiblePeople=owners}
    const breakdown={affectedTasks:r.affected.size*IMPACT_WEIGHTS.affectedTask,affectedProjects:r.projects.size*IMPACT_WEIGHTS.affectedProject,overduePrerequisites:r.overdue.size*IMPACT_WEIGHTS.overduePrerequisite,criticalTasks:r.critical.size*IMPACT_WEIGHTS.criticalTask,highPriorityTasks:r.high.size*IMPACT_WEIGHTS.highPriorityTask,indirectDepth:[...r.depthByAffected.values()].reduce((sum,depth)=>sum+depth,0)*IMPACT_WEIGHTS.indirectDepth};
    return{personId:r.personId,personName:r.personName,blockingPrerequisites:r.prereqs.size,affectedTasks:r.affected.size,affectedProjects:r.projects.size,overduePrerequisites:r.overdue.size,criticalHighImpact:new Set([...r.critical,...r.high]).size,impactScore:Object.values(breakdown).reduce((a,b)=>a+b,0),scoreBreakdown:breakdown,relationships:r.relationships.sort((a,b)=>b.daysOverdue-a.daysOverdue||a.depth-b.depth||a.affectedTask.title.localeCompare(b.affectedTask.title))};
  }).sort((a,b)=>b.impactScore-a.impactScore||b.affectedTasks-a.affectedTasks||b.affectedProjects-a.affectedProjects||a.personName.localeCompare(b.personName));
  return{generatedAt:new Date().toISOString(),formula:'10 × affected tasks + 25 × affected projects + 15 × overdue prerequisites + 20 × critical tasks + 10 × high-priority tasks + 2 × capped dependency depth',people:result};
}

export function buildCalendarRange(tasks:Task[],projectsInput:Project[],peopleInput:Person[],start:string,end:string):CalendarRange{
  const projects=new Map(projectsInput.map(p=>[p.id,p])),people=new Map(peopleInput.map(p=>[p.id,p])),byDate=new Map<string,CalendarTask[]>();
  for(const task of tasks){
    const reasons=new Map<string,Set<'due'|'reminder'|'completed'>>();
    const add=(date:string|undefined|null,reason:'due'|'reminder'|'completed')=>{if(date&&date>=start&&date<=end){const set=reasons.get(date)||new Set();set.add(reason);reasons.set(date,set)}};
    add(task.dueDate,'due');add(task.reminder?.at?.slice(0,10),'reminder');add(task.completedAt?.slice(0,10),'completed');
    for(const [date,reasonSet] of reasons){
      const reasonList=[...reasonSet],overdue=reasonList.includes('due')&&task.status!=='completed'&&date<localDate(new Date());
      const severity=overdue||task.priority==='critical'?'red':task.priority==='high'?'orange':task.status==='completed'&&reasonList.every(r=>r==='completed')?'green':'blue';
      const item:CalendarTask={task,projectName:projects.get(task.projectId||'')?.name||'No project',responsiblePersonName:people.get(task.responsiblePersonId||'')?.fullName||'Unassigned',reasons:reasonList,relevantTime:reasonList.includes('reminder')?task.reminder?.at?.slice(11,16):task.dueTime,blocked:Boolean(task.blockedReasons?.length),overdue,severity};
      byDate.set(date,[...(byDate.get(date)||[]),item]);
    }
  }
  const rank={red:4,orange:3,blue:2,green:1,neutral:0};
  const days=[] as CalendarRange['days'];const cursor=new Date(`${start}T12:00:00`),last=new Date(`${end}T12:00:00`);
  while(cursor<=last){const date=localDate(cursor),items=byDate.get(date)||[],severity=items.reduce<CalendarRange['days'][number]['severity']>((best,item)=>rank[item.severity]>rank[best]?item.severity:best,'neutral');days.push({date,severity,counts:{total:items.length,overdue:items.filter(i=>i.overdue).length,critical:items.filter(i=>i.task.priority==='critical').length,high:items.filter(i=>i.task.priority==='high').length,completed:items.filter(i=>i.task.status==='completed').length},tasks:items});cursor.setDate(cursor.getDate()+1)}
  return{start,end,generatedAt:new Date().toISOString(),days};
}

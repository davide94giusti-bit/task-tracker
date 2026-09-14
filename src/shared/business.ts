import type { ChecklistItem, Link, Priority, Status, Task } from './types';
const priorityPoints:Record<Priority,number>={critical:500,high:300,medium:100,low:30,none:0};
export function calculateProgress(mode:Task['progressMode'], status:Status, manual:number, items:ChecklistItem[]):number {
  if(status==='completed') return 100;
  if(!items.length) return status==='not_started'?0:Math.max(0,Math.min(99,manual||0));
  if(mode==='manual') return Math.max(0,Math.min(100,manual));
  if(mode==='weighted') { const total=items.reduce((s,i)=>s+(i.weight||1),0); return total?Math.round(items.reduce((s,i)=>s+(i.completed?(i.weight||1):0),0)*100/total):0; }
  return Math.round(items.filter(i=>i.completed).length*100/items.length);
}
export function urgencyScore(task:Pick<Task,'status'|'priority'|'dueDate'|'calculatedProgress'|'blockedReasons'>, now=new Date()):number {
  if(['completed','cancelled','archived'].includes(task.status)) return -1000;
  let score=priorityPoints[task.priority];
  if(task.dueDate){ const due=new Date(`${task.dueDate}T23:59:59`); const days=(due.getTime()-now.getTime())/86400000; if(days<0)score+=1000+Math.min(300,Math.abs(days)*10); else if(days<1)score+=450; else if(days<=3)score+=250; else if(days<=7)score+=120; if(days<=3&&task.calculatedProgress<40)score+=150; }
  if(task.status==='blocked'||task.blockedReasons?.length)score+=180;
  if(task.status==='waiting')score+=160;
  return Math.round(score);
}
export function visualState(task:Pick<Task,'status'|'priority'|'dueDate'|'calculatedProgress'>, now=new Date()):string {
  if(task.status==='completed')return 'green'; if(['blocked','cancelled','archived'].includes(task.status))return 'gray';
  if(task.dueDate&&new Date(`${task.dueDate}T23:59:59`)<now)return 'darkred'; if(task.priority==='critical')return 'red';
  const days=task.dueDate?(new Date(`${task.dueDate}T23:59:59`).getTime()-now.getTime())/86400000:99;
  if(task.priority==='high'||days<=1)return 'orange'; if(days<=3)return 'amber'; if(task.status==='waiting')return 'purple'; if(task.status==='in_progress')return 'blue'; return 'neutral';
}
export function wouldCreateCycle(from:string,to:string,links:Pick<Link,'fromTaskId'|'toTaskId'|'type'>[]):boolean {
  if(from===to)return true; const edges=new Map<string,string[]>(); links.filter(l=>l.type==='blocked_by'||l.type==='parent').forEach(l=>edges.set(l.fromTaskId,[...(edges.get(l.fromTaskId)||[]),l.toTaskId]));
  edges.set(from,[...(edges.get(from)||[]),to]); const seen=new Set<string>(); const visit=(n:string):boolean=>{if(n===from&&seen.size>0)return true;if(seen.has(n))return false;seen.add(n);return (edges.get(n)||[]).some(visit);}; return visit(to);
}
export const labels={not_started:'Not started',in_progress:'In progress',waiting:'Waiting',blocked:'Blocked',completed:'Completed',cancelled:'Cancelled',archived:'Archived'} as const;

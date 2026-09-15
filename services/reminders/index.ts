import {service,call} from '../_shared/runtime';
import type {Task,TaskPage} from '../../src/shared/types';
const data=process.env.DATA_URL!,scheduled=new Map<string,Task>();
const state=(task:Task)=>{const now=new Date(),at=new Date(task.reminder?.snoozedUntil||task.reminder?.at||0),today=now.toISOString().slice(0,10),date=at.toISOString().slice(0,10);if(task.reminder?.snoozedUntil&&at>now)return'snoozed';if(task.reminder?.fired)return'triggered';if(at<now)return'overdue';if(date===today)return'today';return'upcoming'};
async function current(requestId:string){const page=await call<TaskPage>(data,'/v1/tasks/list',{method:'POST',body:{pageSize:10000},requestId});return page.items.filter(task=>task.reminder&&!task.reminder.dismissed)}
async function update(taskId:string,requestId:string,fn:(task:Task)=>void){const task=await call<Task>(data,'/v1/tasks/get',{method:'POST',body:{id:taskId},requestId});if(!task.reminder)return false;fn(task);await call(data,'/v1/tasks/save',{method:'POST',body:task,requestId});scheduled.set(task.id,task);return true}
service('reminders',[
  {method:'POST',path:'/v1/sync',handler:({body})=>{const task=body.task as Task;if(task.reminder)scheduled.set(task.id,task);else scheduled.delete(task.id);return{scheduled:scheduled.size}}},
  {method:'GET',path:'/v1/due',handler:async({requestId})=>{const now=new Date().toISOString(),due=(await current(requestId)).filter(task=>task.reminder&&!task.reminder.fired&&(task.reminder.snoozedUntil||task.reminder.at)<=now);for(const task of due)await update(task.id,requestId,value=>{if(value.reminder)value.reminder.fired=true});return due}},
  {method:'GET',path:'/v1/center',handler:async({requestId})=>(await current(requestId)).sort((a,b)=>(a.reminder?.snoozedUntil||a.reminder?.at||'').localeCompare(b.reminder?.snoozedUntil||b.reminder?.at||'')).map(task=>({task,state:state(task),actionable:state(task)!=='upcoming'}))},
  {method:'POST',path:'/v1/snooze',handler:async({body,requestId})=>({updated:await update(body.taskId,requestId,task=>{if(task.reminder){task.reminder.snoozedUntil=body.until;task.reminder.fired=false;task.reminder.dismissed=false}})})},
  {method:'POST',path:'/v1/dismiss',handler:async({body,requestId})=>({updated:await update(body.taskId,requestId,task=>{if(task.reminder)task.reminder.dismissed=true})})}
],{data});

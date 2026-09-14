import { service,call } from '../_shared/runtime';
import { calculateProgress,urgencyScore,wouldCreateCycle } from '../../src/shared/business';
import { calculateDependencyLoad } from '../../src/shared/analytics';
import { DependencyAnalysisQuery } from '../../packages/contracts';
import type { Person,Project,Task } from '../../src/shared/types';
const data=process.env.DATA_URL!;
const enrich=(task:Task)=>{const calculatedProgress=calculateProgress(task.progressMode,task.status,task.manualProgress,task.checklist);const value={...task,calculatedProgress};return{...value,urgencyScore:urgencyScore(value)}};
service('dependencies-progress',[
  {method:'POST',path:'/v1/enrich',handler:({body})=>(body.tasks as Task[]).map(enrich)},
  {method:'POST',path:'/v1/validate-links',handler:({body})=>{for(const link of body.proposed)if((link.type==='blocked_by'||link.type==='parent')&&wouldCreateCycle(body.taskId,link.toTaskId,body.existing))throw new Error('This relationship would create a circular dependency');return{valid:true}}},
  {method:'POST',path:'/v1/project-progress',handler:({body})=>{const tasks=(body.tasks as Task[]).map(enrich);return tasks.length?Math.round(tasks.reduce((sum,t)=>sum+t.calculatedProgress,0)/tasks.length):0}},
  {method:'POST',path:'/v1/people-load',handler:async({body,requestId})=>{DependencyAnalysisQuery.parse(body||{});const snapshot=await call<{tasks:Task[];people:Person[];projects:Project[]}>(data,'/v1/read-model/dependencies',{requestId,timeout:10000});return calculateDependencyLoad(snapshot.tasks,snapshot.people,snapshot.projects)}}
],{data});

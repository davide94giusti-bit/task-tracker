import {describe,expect,it} from 'vitest';
import {buildCalendarRange,calculateDependencyLoad,IMPACT_WEIGHTS} from '../src/shared/analytics';
import type {Person,Project,Task} from '../src/shared/types';

const people:Person[]=[
  {id:'davide',fullName:'Davide',company:'',role:'Engineer',phone:'',email:'',address:'',website:'',preferredContact:'',notes:'',tags:[],createdAt:'',updatedAt:''},
  {id:'mattia',fullName:'Mattia',company:'',role:'Mason',phone:'',email:'',address:'',website:'',preferredContact:'',notes:'',tags:[],createdAt:'',updatedAt:''}
];
const projects:Project[]=[{id:'terrace',name:'Terrace',color:'#00f',description:'',archived:false},{id:'house',name:'House',color:'#0f0',description:'',archived:false}];
const task=(id:string,patch:Partial<Task>={}):Task=>({id,title:id,description:'',status:'not_started',priority:'medium',startDate:null,dueDate:null,dueTime:null,createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z',completedAt:null,projectId:'terrace',categoryId:null,responsiblePersonId:null,tags:[],notes:'',progressMode:'automatic',manualProgress:0,archived:false,deletedAt:null,recurrence:null,reminder:null,attachments:[],checklist:[],links:[],blockedReasons:[],calculatedProgress:0,urgencyScore:0,...patch});
const blockedBy=(...ids:string[])=>ids.map((id,index)=>({id:`l-${id}-${index}`,fromTaskId:'',toTaskId:id,type:'blocked_by' as const,mandatory:true}));

describe('dependency load by person',()=>{
  it('counts direct, indirect, shared, unassigned, distinct tasks and projects',()=>{
    const tasks=[
      task('permit',{responsiblePersonId:'davide',dueDate:'2020-01-01'}),
      task('masonry',{responsiblePersonId:'mattia'}),
      task('survey'),
      task('flooring',{links:blockedBy('permit','masonry'),priority:'critical'}),
      task('finish',{links:blockedBy('flooring'),projectId:'house',priority:'high'})
    ];
    const result=calculateDependencyLoad(tasks,people,projects);
    const davide=result.people.find(row=>row.personId==='davide')!;
    expect(davide.affectedTasks).toBe(2);
    expect(davide.affectedProjects).toBe(2);
    expect(davide.overduePrerequisites).toBe(1);
    expect(davide.relationships.some(item=>item.depth===2)).toBe(true);
    expect(davide.relationships.find(item=>item.affectedTask.id==='flooring')?.sharedDependency).toBe(true);
    expect(result.people[0].impactScore).toBeGreaterThanOrEqual(result.people.at(-1)!.impactScore);
    expect(davide.scoreBreakdown.affectedTasks).toBe(2*IMPACT_WEIGHTS.affectedTask);
  });
  it('guards duplicate paths and cycles',()=>{
    const a=task('a',{responsiblePersonId:'davide',links:blockedBy('c')}),b=task('b',{links:blockedBy('a')}),c=task('c',{links:blockedBy('a','b')});
    const result=calculateDependencyLoad([a,b,c],people,projects).people.find(row=>row.personId==='davide')!;
    expect(result.affectedTasks).toBe(2);
    expect(result.relationships.filter(item=>item.affectedTask.id==='c')).toHaveLength(1);
  });
  it('excludes completed and archived downstream tasks',()=>{
    const p=task('p',{responsiblePersonId:'davide'}),done=task('done',{status:'completed',links:blockedBy('p')}),archived=task('archived',{archived:true,links:blockedBy('p')});
    expect(calculateDependencyLoad([p,done,archived],people,projects).people).toEqual([]);
  });
});

describe('calendar range',()=>{
  it('includes due, reminder, and completion reasons once while excluding start dates',()=>{
    const tasks=[task('multi',{startDate:'2024-02-01',dueDate:'2024-02-29',reminder:{id:'reminder',at:'2024-02-29T09:00:00',repeatOverdue:false},completedAt:'2024-02-29T12:00:00Z',status:'completed'})];
    const range=buildCalendarRange(tasks,projects,people,'2024-02-01','2024-02-29');
    expect(range.days).toHaveLength(29);
    expect(range.days.find(day=>day.date==='2024-02-01')?.tasks).toHaveLength(0);
    const leapDay=range.days.find(day=>day.date==='2024-02-29')!;
    expect(leapDay.tasks).toHaveLength(1);
    expect(leapDay.tasks[0].reasons.sort()).toEqual(['completed','due','reminder']);
  });
  it('uses severity precedence',()=>{
    const range=buildCalendarRange([task('normal',{dueDate:'2030-01-01'}),task('critical',{dueDate:'2030-01-01',priority:'critical'})],projects,people,'2030-01-01','2030-01-01');
    expect(range.days[0].severity).toBe('red');
  });
});

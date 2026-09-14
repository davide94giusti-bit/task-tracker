import {afterEach,beforeEach,describe,expect,it} from 'vitest';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {AppDatabase} from '../src/main/database';let dir:string,db:AppDatabase;beforeEach(()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'prioritydesk-test-'));db=new AppDatabase(path.join(dir,'test.db'),path.resolve('src/main/schema.sql'))});afterEach(()=>{db.close();fs.rmSync(dir,{recursive:true,force:true})});describe('data service repository',()=>{it('creates, edits, completes, reopens and trashes tasks',()=>{let t=db.saveTask({title:'Test',priority:'high'});expect(db.listTasks().total).toBe(1);t=db.saveTask({...t,status:'completed'});expect(t.completedAt).toBeTruthy();t=db.saveTask({...t,status:'in_progress'});expect(t.completedAt).toBeNull();db.removeTask(t.id);expect(db.listTasks().total).toBe(0);db.restoreTask(t.id);expect(db.listTasks().total).toBe(1)});it('hides trashed prerequisites and restores their dependency reversibly',()=>{const prerequisite=db.saveTask({title:'Buy materials'});const waiting=db.saveTask({title:'Install materials',links:[{fromTaskId:'ignored',toTaskId:prerequisite.id,type:'blocked_by',mandatory:true}]});expect(db.getTask(waiting.id).blockedReasons).toEqual(['Buy materials']);expect(db.getTask(waiting.id).links).toHaveLength(1);db.removeTask(prerequisite.id);expect(db.getTask(waiting.id).blockedReasons).toEqual([]);expect(db.getTask(waiting.id).links).toEqual([]);db.restoreTask(prerequisite.id);expect(db.getTask(waiting.id).blockedReasons).toEqual(['Buy materials']);expect(db.getTask(waiting.id).links).toHaveLength(1)});it('does not treat archived prerequisites as active blockers',()=>{let prerequisite=db.saveTask({title:'Old prerequisite'});const waiting=db.saveTask({title:'Current task',links:[{fromTaskId:'ignored',toTaskId:prerequisite.id,type:'blocked_by',mandatory:true}]});prerequisite=db.saveTask({...prerequisite,archived:true,status:'archived'});expect(db.getTask(waiting.id).blockedReasons).toEqual([])});it('updates checklist transactionally',()=>{const t=db.saveTask({title:'Steps',checklist:[{description:'One',completed:false,weight:1}]});const changed=db.toggleChecklist(t.id,t.checklist[0].id,true);expect(changed.checklist[0].completed).toBe(true)});it('warns on duplicate contacts',()=>{db.savePerson({fullName:'Ada Lovelace',email:'ada@example.test'});expect(()=>db.savePerson({fullName:'Ada Lovelace',email:''})).toThrow(/duplicate/)})});

describe('completion and prerequisite consistency',()=>{
  it('rejects completion with required checklist items and allows optional items',()=>{
    const task=db.saveTask({title:'Terrace',checklist:[{description:'Required step',completed:false,required:true},{description:'Optional idea',completed:false,required:false}]});
    expect(()=>db.saveTask({...task,status:'completed'})).toThrow(/cannot be completed/i);
    const updated=db.saveTask({...task,checklist:task.checklist.map(item=>item.required?{...item,completed:true}:item),status:'completed'});
    expect(updated.status).toBe('completed');
  });
  it('rejects active mandatory prerequisites but not optional or completed ones',()=>{
    let prerequisite=db.saveTask({title:'Install connection'});
    let waiting=db.saveTask({title:'Terrace',links:[{toTaskId:prerequisite.id,type:'blocked_by',mandatory:true}]});
    expect(()=>db.saveTask({...waiting,status:'completed'})).toThrow(/cannot be completed/i);
    prerequisite=db.saveTask({...prerequisite,status:'completed'});
    waiting=db.saveTask({...waiting,status:'completed'});
    expect(waiting.status).toBe('completed');
  });
  it('creates and links a prerequisite atomically and converts a checklist step',()=>{
    const waiting=db.saveTask({title:'Terrace',projectId:db.listProjects()[0].id,checklist:[{description:'Masonry',completed:false,required:true}]});
    const created=db.createPrerequisite(waiting.id,{title:'Permit'},true);
    expect(created.waitingTask.links[0].toTaskId).toBe(created.prerequisite.id);
    expect(created.prerequisite.projectId).toBe(waiting.projectId);
    const converted=db.convertChecklist(waiting.id,waiting.checklist[0].id,{title:'Mattia completes masonry'},true);
    expect(converted.waitingTask.checklist).toHaveLength(0);
    expect(converted.waitingTask.links).toHaveLength(2);
  });
  it('does not expose incoming dependency links as editable prerequisites',()=>{
    const prerequisite=db.saveTask({title:'Permit'});
    const waiting=db.saveTask({title:'Terrace',links:[{toTaskId:prerequisite.id,type:'blocked_by',mandatory:true}]});
    expect(db.getTask(prerequisite.id).links).toEqual([]);
    expect(db.getTask(waiting.id).links).toHaveLength(1);
  });
});

describe('task filters and nullable schedule fields',()=>{
  it('keeps future high-priority work out of Today while retaining overdue work',()=>{
    db.saveTask({title:'Future critical',priority:'critical',dueDate:'2099-12-31'});
    db.saveTask({title:'Overdue',priority:'low',dueDate:'2000-01-01'});
    expect(db.listTasks({view:'today'}).items.map(task=>task.title)).toEqual(['Overdue']);
  });
  it('clears reminders, recurrence, dates, project and responsible person explicitly',()=>{
    const projectId=db.listProjects()[0].id;
    const personId=db.savePerson({fullName:'Schedule owner'}).id;
    let task=db.saveTask({title:'Scheduled',projectId,responsiblePersonId:personId,dueDate:'2030-01-02',recurrence:{frequency:'weekly',interval:1,generation:'completion'},reminder:{id:'r1',at:'2030-01-01T09:00',repeatOverdue:false}});
    task=db.saveTask({...task,projectId:null,responsiblePersonId:null,dueDate:null,recurrence:null,reminder:null});
    expect(task).toMatchObject({projectId:null,responsiblePersonId:null,dueDate:null,recurrence:null,reminder:null});
  });
  it('filters task drill-downs by project, person, date, priority, status and blocked state',()=>{
    const projectId=db.listProjects()[0].id;
    const personId=db.savePerson({fullName:'Drilldown owner'}).id;
    const prerequisite=db.saveTask({title:'Prerequisite'});
    db.saveTask({title:'Target',projectId,responsiblePersonId:personId,dueDate:'2035-03-04',priority:'critical',status:'waiting',links:[{toTaskId:prerequisite.id,type:'blocked_by',mandatory:true}]});
    const queries:Array<Parameters<AppDatabase['listTasks']>[0]>=[{projectId},{responsiblePersonId:personId},{dueDate:'2035-03-04'},{priorities:['critical']},{statuses:['waiting']},{blocked:true}];
    for(const query of queries)expect(db.listTasks(query).items.map(task=>task.title)).toEqual(['Target']);
  });
});

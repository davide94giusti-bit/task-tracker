import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Activity, Category, CompletionBlockers, DashboardData, Link, LogEntry, Person, PrerequisiteCandidatePage, Project, Settings, Task, TaskPage, TaskQuery } from '../shared/types';

const now=()=>new Date().toISOString();
const json=<T>(v:string|null|undefined,fallback:T):T=>{try{return v?JSON.parse(v):fallback}catch{return fallback}};
const bool=(v:unknown)=>Boolean(v);
const defaults:Settings={theme:'system',defaultView:'dashboard',defaultSort:'smart',defaultPriority:'medium',dateFormat:'dd/MM/yyyy',firstDay:1,notifications:true,quietStart:'22:00',quietEnd:'07:00',startWithWindows:false,backupFolder:'',backupFrequency:'daily',backupRetention:10,logLevel:'info',logRetentionDays:30,trashRetentionDays:30};
export class DatabaseRuleError extends Error {
  constructor(public code:string,message:string,public details?:unknown){super(message);this.name='DatabaseRuleError'}
}

class LocalDatabase {
  private raw:DatabaseSync;
  private depth=0;
  constructor(file:string){this.raw=new DatabaseSync(file)}
  prepare(sql:string):StatementSync{return this.raw.prepare(sql)}
  exec(sql:string){return this.raw.exec(sql)}
  close(){return this.raw.close()}
  pragma(sql:string):any {if(sql.trim().toLowerCase()==='integrity_check')return this.raw.prepare('PRAGMA integrity_check').all();return this.raw.exec(`PRAGMA ${sql}`)}
  transaction<T extends (...args:any[])=>any>(fn:T):T {return ((...args:any[])=>{const level=this.depth++,savepoint=`pd_nested_${level}`;this.raw.exec(level===0?'BEGIN IMMEDIATE':`SAVEPOINT ${savepoint}`);try{const result=fn(...args);this.raw.exec(level===0?'COMMIT':`RELEASE ${savepoint}`);return result}catch(error){this.raw.exec(level===0?'ROLLBACK':`ROLLBACK TO ${savepoint}`);throw error}finally{this.depth--}}) as T}
}

export class AppDatabase {
  db:LocalDatabase;
  constructor(public file:string, schemaPath:string){
    fs.mkdirSync(path.dirname(file),{recursive:true}); this.db=new LocalDatabase(file); this.db.pragma('journal_mode = WAL'); this.db.pragma('foreign_keys = ON'); this.db.pragma('busy_timeout = 5000');
    this.db.exec(fs.readFileSync(schemaPath,'utf8')); this.seed(); this.log('info','database','Database initialized',{schemaVersion:1});
  }
  close(){this.db.close()}
  private seed(){
    if(Number((this.db.prepare('SELECT COUNT(*) n FROM projects').get() as {n:number}|undefined)?.n||0)>0)return;
    const tx=this.db.transaction(()=>{this.db.prepare('INSERT INTO projects(id,name,color,description) VALUES(?,?,?,?)').run(randomUUID(),'Personal','#2563eb','Personal responsibilities');this.db.prepare('INSERT INTO categories(id,name,color) VALUES(?,?,?)').run(randomUUID(),'General','#64748b');});tx();
  }
  log(level:LogEntry['level'],module:string,message:string,details?:unknown,errorRef?:string){
    const masked=JSON.stringify(details??'').replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[email masked]').replace(/(password|token|secret)\s*[=:]\s*[^,}\s]+/gi,'$1=[masked]');
    this.db.prepare('INSERT INTO app_logs VALUES(?,?,?,?,?,?,?)').run(randomUUID(),now(),level,module,message,masked,errorRef||null);
  }
  private activity(taskId:string,action:string,summary:string,details?:unknown){this.db.prepare('INSERT INTO activities VALUES(?,?,?,?,?,?)').run(randomUUID(),taskId,action,summary,details?JSON.stringify(details):null,now());}
  private hydrate(row:any):Task {
    const checklist=(this.db.prepare('SELECT * FROM checklist WHERE task_id=? ORDER BY position').all(row.id) as any[]).map(i=>({id:i.id,taskId:i.task_id,description:i.description,completed:bool(i.completed),responsiblePersonId:i.responsible_person_id,dueDate:i.due_date,weight:i.weight,notes:i.notes,position:i.position,required:bool(i.required)}));
    // Soft-deleted tasks remain stored for restoration, but they are not part of
    // the active dependency graph. Preserve the underlying link so restoring a
    // prerequisite can reactivate it without showing a stale "Linked task".
    const links=(this.db.prepare(`SELECT l.* FROM task_links l
      JOIN tasks source ON source.id=l.from_task_id
      JOIN tasks target ON target.id=l.to_task_id
      WHERE l.from_task_id=?
        AND source.deleted_at IS NULL
        AND target.deleted_at IS NULL`).all(row.id) as any[]).map(l=>({id:l.id,fromTaskId:l.from_task_id,toTaskId:l.to_task_id,type:l.type,mandatory:bool(l.mandatory)} as Link));
    const prereqs=links.filter(l=>l.fromTaskId===row.id&&l.type==='blocked_by'&&l.mandatory).map(l=>this.db.prepare('SELECT id,title,status,archived,deleted_at FROM tasks WHERE id=?').get(l.toTaskId) as any).filter(t=>t&&!t.deleted_at&&!bool(t.archived)&&!['completed','cancelled','archived'].includes(t.status));
    return {id:row.id,title:row.title,description:row.description,status:row.status,priority:row.priority,startDate:row.start_date,dueDate:row.due_date,dueTime:row.due_time,createdAt:row.created_at,updatedAt:row.updated_at,completedAt:row.completed_at,projectId:row.project_id,categoryId:row.category_id,responsiblePersonId:row.responsible_person_id,tags:json(row.tags,[]),notes:row.notes,progressMode:row.progress_mode,manualProgress:row.manual_progress,archived:bool(row.archived),deletedAt:row.deleted_at,recurrence:json(row.recurrence,null),reminder:json(row.reminder,null),attachments:json(row.attachments,[]),checklist,links,blockedReasons:prereqs.map(t=>t.title),calculatedProgress:row.manual_progress,urgencyScore:0};
  }
  listTasks(q:TaskQuery={}):TaskPage {
    const page=Math.max(1,q.page||1), size=Math.min(10000,Math.max(1,q.pageSize||100)); const where:string[]=[]; const params:any[]=[];
    if(q.view==='trash'||q.includeDeleted)where.push('t.deleted_at IS NOT NULL');else where.push('t.deleted_at IS NULL');
    if(!['completed','trash'].includes(q.view||'')){where.push('t.archived=0'); if(!q.statuses?.length)where.push("t.status NOT IN ('completed','cancelled','archived')");}
    if(q.view==='completed')where.push("t.status='completed'"); if(q.view==='today')where.push("t.due_date<=date('now','localtime')");
    if(q.view==='upcoming')where.push("(t.due_date>date('now','localtime') OR t.due_date IS NULL)");
    if(q.search){where.push("(t.title LIKE ? OR t.description LIKE ? OR t.notes LIKE ? OR t.tags LIKE ? OR EXISTS(SELECT 1 FROM people p WHERE p.id=t.responsible_person_id AND p.full_name LIKE ?))");params.push(...Array(5).fill(`%${q.search}%`));}
    if(q.statuses?.length){where.push(`t.status IN (${q.statuses.map(()=>'?').join(',')})`);params.push(...q.statuses)} if(q.priorities?.length){where.push(`t.priority IN (${q.priorities.map(()=>'?').join(',')})`);params.push(...q.priorities)}
    if(q.projectId){where.push('t.project_id=?');params.push(q.projectId)}
    if(q.responsiblePersonId){where.push('t.responsible_person_id=?');params.push(q.responsiblePersonId)}
    if(q.due==='overdue')where.push("t.due_date<date('now','localtime')");
    if(q.due==='today')where.push("t.due_date=date('now','localtime')");
    if(q.due==='next7')where.push("t.due_date>date('now','localtime') AND t.due_date<=date('now','localtime','+7 days')");
    if(q.dueDate){where.push('t.due_date=?');params.push(q.dueDate)}
    if(q.completedSince){where.push('t.completed_at>=?');params.push(q.completedSince)}
    const base=`FROM tasks t WHERE ${where.join(' AND ')}`; const rows=this.db.prepare(`SELECT t.* ${base} ORDER BY t.updated_at DESC`).all(...params) as any[]; let items=rows.map(r=>this.hydrate(r));
    if(q.blocked!==undefined)items=items.filter(t=>Boolean(t.blockedReasons?.length)===q.blocked);
    const sort=q.sort||'smart'; items.sort((a,b)=>sort==='due'?(a.dueDate||'9999').localeCompare(b.dueDate||'9999'):sort==='priority'?b.urgencyScore-a.urgencyScore:sort==='progress'?a.calculatedProgress-b.calculatedProgress:sort==='title'?a.title.localeCompare(b.title):b.urgencyScore-a.urgencyScore);
    return {items:items.slice((page-1)*size,page*size),total:items.length,page,pageSize:size};
  }
  getTask(id:string){const row=this.db.prepare('SELECT * FROM tasks WHERE id=?').get(id);if(!row)throw new Error('Task not found');return this.hydrate(row)}
  saveTask(input:any):Task {
    const isNew=!input.id; const id=input.id||randomUUID(); const old=!isNew?this.getTask(id):null; const timestamp=now();
    if(!String(input.title||'').trim())throw new Error('Task title is required'); if(input.startDate&&input.dueDate&&input.dueDate<input.startDate)throw new Error('Due date cannot precede start date');
    const incomingLinks=(input.links||[]) as Link[];
    const status=input.status||old?.status||'not_started'; const manual=Number(input.manualProgress??old?.manualProgress??0);
    const supplied=(key:string)=>Object.prototype.hasOwnProperty.call(input,key);
    const optional=(key:string,fallback:unknown)=>supplied(key)?input[key]:fallback;
    const tx=this.db.transaction(()=>{
      this.db.prepare(`INSERT INTO tasks(id,title,description,status,priority,start_date,due_date,due_time,created_at,updated_at,completed_at,project_id,category_id,responsible_person_id,tags,notes,progress_mode,manual_progress,archived,deleted_at,recurrence,reminder,attachments,previous_progress) VALUES(@id,@title,@description,@status,@priority,@startDate,@dueDate,@dueTime,@createdAt,@updatedAt,@completedAt,@projectId,@categoryId,@responsiblePersonId,@tags,@notes,@progressMode,@manualProgress,@archived,@deletedAt,@recurrence,@reminder,@attachments,@previousProgress) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,status=excluded.status,priority=excluded.priority,start_date=excluded.start_date,due_date=excluded.due_date,due_time=excluded.due_time,updated_at=excluded.updated_at,completed_at=excluded.completed_at,project_id=excluded.project_id,category_id=excluded.category_id,responsible_person_id=excluded.responsible_person_id,tags=excluded.tags,notes=excluded.notes,progress_mode=excluded.progress_mode,manual_progress=excluded.manual_progress,archived=excluded.archived,recurrence=excluded.recurrence,reminder=excluded.reminder,attachments=excluded.attachments,previous_progress=excluded.previous_progress`).run({id,title:String(input.title).trim(),description:input.description??old?.description??'',status,priority:input.priority||old?.priority||'medium',startDate:optional('startDate',old?.startDate??null),dueDate:optional('dueDate',old?.dueDate??null),dueTime:optional('dueTime',old?.dueTime??null),createdAt:old?.createdAt||timestamp,updatedAt:timestamp,completedAt:status==='completed'?(old?.completedAt||timestamp):null,projectId:optional('projectId',old?.projectId??null),categoryId:optional('categoryId',old?.categoryId??null),responsiblePersonId:optional('responsiblePersonId',old?.responsiblePersonId??null),tags:JSON.stringify(input.tags??old?.tags??[]),notes:input.notes??old?.notes??'',progressMode:input.progressMode||old?.progressMode||'automatic',manualProgress:manual,archived:Number(input.archived??old?.archived??false),deletedAt:optional('deletedAt',old?.deletedAt??null),recurrence:JSON.stringify(optional('recurrence',old?.recurrence??null)),reminder:JSON.stringify(optional('reminder',old?.reminder??null)),attachments:JSON.stringify(input.attachments??old?.attachments??[]),previousProgress:old?.calculatedProgress||0});
      if(input.checklist){this.db.prepare('DELETE FROM checklist WHERE task_id=?').run(id);const st=this.db.prepare('INSERT INTO checklist VALUES(?,?,?,?,?,?,?,?,?,?)');input.checklist.forEach((c:any,i:number)=>st.run(c.id||randomUUID(),id,c.description,Number(c.completed),c.responsiblePersonId||null,c.dueDate||null,Number(c.weight||1),c.notes||'',i,Number(c.required!==false)));}
      if(input.links){this.db.prepare('DELETE FROM task_links WHERE from_task_id=?').run(id);const st=this.db.prepare('INSERT INTO task_links VALUES(?,?,?,?,?)');incomingLinks.forEach(l=>st.run(l.id||randomUUID(),id,l.toTaskId,l.type,Number(l.mandatory)));}
      if(status==='completed')this.assertCompletable(id);
      this.activity(id,isNew?'created':'updated',isNew?'Task created':'Task updated',{changes:isNew?'initial':Object.keys(input)});
    });tx(); this.log('info','tasks',isNew?'Task created':'Task updated',{taskId:id}); return this.getTask(id);
  }
  toggleChecklist(taskId:string,itemId:string,completed:boolean){this.db.prepare('UPDATE checklist SET completed=? WHERE id=? AND task_id=?').run(Number(completed),itemId,taskId);this.db.prepare('UPDATE tasks SET updated_at=? WHERE id=?').run(now(),taskId);this.activity(taskId,'checklist',completed?'Checklist step completed':'Checklist step reopened',{itemId});return this.getTask(taskId)}
  removeTask(id:string,permanent=false){const dependents=this.db.prepare("SELECT COUNT(*) n FROM task_links WHERE to_task_id=? AND type='blocked_by'").get(id) as any;if(permanent){this.db.prepare('DELETE FROM tasks WHERE id=?').run(id);this.log('warn','tasks','Task permanently deleted',{taskId:id,dependents:dependents.n});}else{this.db.prepare('UPDATE tasks SET deleted_at=?,updated_at=? WHERE id=?').run(now(),now(),id);this.activity(id,'deleted','Task moved to Trash',{dependents:dependents.n});}}
  restoreTask(id:string){this.db.prepare('UPDATE tasks SET deleted_at=NULL,updated_at=? WHERE id=?').run(now(),id);this.activity(id,'restored','Task restored from Trash')}
  bulk(ids:string[],patch:any){const tx=this.db.transaction(()=>ids.forEach(id=>this.saveTask({...this.getTask(id),...patch,id})));tx()}
  completionBlockers(taskId:string):CompletionBlockers {
    const checklist=this.db.prepare('SELECT id FROM checklist WHERE task_id=? AND required=1 AND completed=0').all(taskId) as Array<{id:string}>;
    const prerequisites=this.db.prepare(`SELECT t.id,t.title FROM task_links l JOIN tasks t ON t.id=l.to_task_id
      WHERE l.from_task_id=? AND l.type='blocked_by' AND l.mandatory=1
      AND t.deleted_at IS NULL AND t.archived=0 AND t.status NOT IN ('completed','cancelled','archived') ORDER BY t.title`).all(taskId) as Array<{id:string;title:string}>;
    return {taskId,incompleteRequiredChecklist:checklist.length,activeMandatoryPrerequisites:prerequisites.length,checklistItemIds:checklist.map(x=>x.id),prerequisites};
  }
  private assertCompletable(taskId:string){
    const blockers=this.completionBlockers(taskId);
    if(blockers.incompleteRequiredChecklist||blockers.activeMandatoryPrerequisites)throw new DatabaseRuleError('TASK_COMPLETION_BLOCKED','Task cannot be completed while required checklist items or mandatory prerequisites remain incomplete',blockers);
  }
  prerequisiteCandidates(input:{taskId:string;search?:string;page?:number;pageSize?:number}):PrerequisiteCandidatePage {
    const page=Math.max(1,input.page||1),pageSize=Math.min(50,Math.max(1,input.pageSize||25)),search=`%${input.search||''}%`;
    const where=`deleted_at IS NULL AND archived=0 AND status NOT IN ('cancelled','archived') AND id<>? AND title LIKE ?`;
    const total=Number((this.db.prepare(`SELECT COUNT(*) n FROM tasks WHERE ${where}`).get(input.taskId,search) as any)?.n||0);
    const rows=this.db.prepare(`SELECT id,title,status,priority,due_date,project_id,responsible_person_id FROM tasks WHERE ${where} ORDER BY title LIMIT ? OFFSET ?`).all(input.taskId,search,pageSize,(page-1)*pageSize) as any[];
    return {items:rows.map(r=>({id:r.id,title:r.title,status:r.status,priority:r.priority,dueDate:r.due_date,projectId:r.project_id,responsiblePersonId:r.responsible_person_id})),total,page,pageSize};
  }
  createPrerequisite(waitingTaskId:string,input:any,mandatory=true){
    return this.db.transaction(()=>{
      const waiting=this.getTask(waitingTaskId);
      const prerequisite=this.saveTask({...input,id:undefined,status:input.status||'not_started',projectId:input.projectId??waiting.projectId??null});
      this.db.prepare('INSERT INTO task_links(id,from_task_id,to_task_id,type,mandatory) VALUES(?,?,?,?,?)').run(randomUUID(),waitingTaskId,prerequisite.id,'blocked_by',Number(mandatory));
      this.activity(waitingTaskId,'dependency.added','Prerequisite created and linked',{prerequisiteId:prerequisite.id});
      this.activity(prerequisite.id,'dependency.added','Task created as a prerequisite',{waitingTaskId});
      return {waitingTask:this.getTask(waitingTaskId),prerequisite:this.getTask(prerequisite.id)};
    })();
  }
  convertChecklist(waitingTaskId:string,checklistItemId:string,input:any,mandatory=true){
    return this.db.transaction(()=>{
      const item=this.db.prepare('SELECT * FROM checklist WHERE id=? AND task_id=?').get(checklistItemId,waitingTaskId) as any;
      if(!item)throw new DatabaseRuleError('CHECKLIST_ITEM_NOT_FOUND','Checklist item no longer exists');
      const result=this.createPrerequisite(waitingTaskId,{...input,title:input.title||item.description,dueDate:input.dueDate??item.due_date,responsiblePersonId:input.responsiblePersonId??item.responsible_person_id},mandatory);
      this.db.prepare('DELETE FROM checklist WHERE id=? AND task_id=?').run(checklistItemId,waitingTaskId);
      this.activity(waitingTaskId,'checklist.converted_to_prerequisite','Checklist item converted to prerequisite',{checklistItemId,prerequisiteId:result.prerequisite.id});
      return {waitingTask:this.getTask(waitingTaskId),prerequisite:result.prerequisite};
    })();
  }
  dependencySnapshot(){
    const tasks=this.db.prepare('SELECT * FROM tasks').all() as any[];
    return {tasks:tasks.map(r=>this.hydrate(r)),people:this.listPeople(),projects:this.listProjects()};
  }
  calendarSnapshot(start:string,end:string){
    const rows=this.db.prepare(`SELECT * FROM tasks WHERE deleted_at IS NULL AND archived=0 AND status NOT IN ('cancelled','archived')
      AND (due_date BETWEEN ? AND ? OR substr(completed_at,1,10) BETWEEN ? AND ? OR substr(json_extract(reminder,'$.at'),1,10) BETWEEN ? AND ?)`).all(start,end,start,end,start,end) as any[];
    return {tasks:rows.map(r=>this.hydrate(r)),people:this.listPeople(),projects:this.listProjects()};
  }
  listPeople():Person[]{return (this.db.prepare('SELECT * FROM people ORDER BY full_name').all() as any[]).map(p=>({id:p.id,fullName:p.full_name,company:p.company,role:p.role,phone:p.phone,email:p.email,address:p.address,website:p.website,preferredContact:p.preferred_contact,notes:p.notes,tags:json(p.tags,[]),createdAt:p.created_at,updatedAt:p.updated_at}))}
  savePerson(p:any):Person{if(!p.fullName?.trim())throw new Error('Full name is required');const duplicate=this.db.prepare('SELECT id FROM people WHERE id<>? AND (lower(full_name)=lower(?) OR (?<>\'\' AND lower(email)=lower(?)))').get(p.id||'',p.fullName,p.email||'',p.email||'');if(duplicate)throw new Error('A likely duplicate contact already exists');const id=p.id||randomUUID(),t=now();this.db.prepare(`INSERT INTO people VALUES(@id,@fullName,@company,@role,@phone,@email,@address,@website,@preferredContact,@notes,@tags,@createdAt,@updatedAt) ON CONFLICT(id) DO UPDATE SET full_name=excluded.full_name,company=excluded.company,role=excluded.role,phone=excluded.phone,email=excluded.email,address=excluded.address,website=excluded.website,preferred_contact=excluded.preferred_contact,notes=excluded.notes,tags=excluded.tags,updated_at=excluded.updated_at`).run({id,fullName:p.fullName.trim(),company:p.company||'',role:p.role||'',phone:p.phone||'',email:p.email||'',address:p.address||'',website:p.website||'',preferredContact:p.preferredContact||'',notes:p.notes||'',tags:JSON.stringify(p.tags||[]),createdAt:p.createdAt||t,updatedAt:t});return this.listPeople().find(x=>x.id===id)!}
  removePerson(id:string){this.db.prepare('DELETE FROM people WHERE id=?').run(id)}
  listProjects():Project[]{return (this.db.prepare('SELECT * FROM projects ORDER BY name').all() as any[]).map(p=>({id:p.id,name:p.name,color:p.color,description:p.description,archived:bool(p.archived)}))}
  saveProject(p:any):Project{const id=p.id||randomUUID();this.db.prepare('INSERT INTO projects VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,color=excluded.color,description=excluded.description,archived=excluded.archived').run(id,p.name,p.color||'#2563eb',p.description||'',Number(p.archived||false));return this.listProjects().find(x=>x.id===id)!}
  removeProject(id:string){this.db.prepare('DELETE FROM projects WHERE id=?').run(id)}
  listCategories():Category[]{return (this.db.prepare('SELECT * FROM categories ORDER BY name').all() as any[]).map(c=>({id:c.id,name:c.name,color:c.color}))}
  dashboard():DashboardData {const all=this.listTasks({pageSize:500}).items,today=new Date().toISOString().slice(0,10),week=new Date(Date.now()+7*864e5).toISOString().slice(0,10);const blocked=(t:Task)=>Boolean(t.blockedReasons?.length);const counts={overdue:all.filter(t=>t.dueDate&&t.dueDate<today).length,today:all.filter(t=>t.dueDate===today).length,next7:all.filter(t=>t.dueDate&&t.dueDate>today&&t.dueDate<=week).length,critical:all.filter(t=>t.priority==='critical').length,high:all.filter(t=>t.priority==='high').length,blocked:all.filter(blocked).length,waiting:all.filter(t=>t.status==='waiting').length,recentCompleted:this.listTasks({view:'completed',pageSize:500}).items.filter(t=>Date.now()-new Date(t.completedAt||0).getTime()<7*864e5).length,active:all.length};const projects=this.listProjects();return{counts,needsAttention:[...all].sort((a,b)=>b.urgencyScore-a.urgencyScore).slice(0,12),recent:[...all].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)).slice(0,6),recentlyUnblocked:[],projectProgress:projects.map(p=>{const a=all.filter(t=>t.projectId===p.id);return{id:p.id,name:p.name,active:a.length,progress:a.length?Math.round(a.reduce((s,t)=>s+t.calculatedProgress,0)/a.length):0}}),workload:Array.from({length:7},(_,i)=>{const d=new Date(Date.now()+i*864e5).toISOString().slice(0,10);return{date:d,count:all.filter(t=>t.dueDate===d).length}}),overallProgress:all.length?Math.round(all.reduce((s,t)=>s+t.calculatedProgress,0)/all.length):0};}
  activities(taskId:string):Activity[]{return (this.db.prepare('SELECT * FROM activities WHERE task_id=? ORDER BY created_at DESC').all(taskId) as any[]).map(a=>({id:a.id,taskId:a.task_id,action:a.action,summary:a.summary,details:a.details,createdAt:a.created_at}))}
  logs(filters:any={}):LogEntry[]{let sql='SELECT * FROM app_logs WHERE 1=1',p:any[]=[];if(filters.level){sql+=' AND level=?';p.push(filters.level)}if(filters.search){sql+=' AND (message LIKE ? OR details LIKE ? OR module LIKE ?)';p.push(...Array(3).fill(`%${filters.search}%`))}return (this.db.prepare(sql+' ORDER BY timestamp DESC LIMIT 2000').all(...p) as any[]).map(l=>({id:l.id,timestamp:l.timestamp,level:l.level,module:l.module,message:l.message,details:l.details,errorRef:l.error_ref}))}
  clearLogs(){this.db.prepare('DELETE FROM app_logs').run();this.log('info','logs','Logs cleared')}
  getSettings():Settings{const s={...defaults};for(const r of this.db.prepare('SELECT * FROM settings').all() as any[])try{(s as any)[r.key]=JSON.parse(r.value)}catch{}return s}
  saveSettings(v:Partial<Settings>):Settings{const st=this.db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');const tx=this.db.transaction(()=>Object.entries(v).forEach(([k,val])=>st.run(k,JSON.stringify(val))));tx();this.log('info','settings','Settings updated',{keys:Object.keys(v)});return this.getSettings()}
  snapshot(){const tables=['projects','categories','people','tasks','checklist','task_links','task_contacts','activities','settings'];return Object.fromEntries(tables.map(t=>[t,this.db.prepare(`SELECT * FROM ${t}`).all()]));}
  importSnapshot(data:any,mode:'merge'|'replace') {const tables=['projects','categories','people','tasks','checklist','task_links','task_contacts','activities','settings'];const tx=this.db.transaction(()=>{this.db.pragma('defer_foreign_keys=ON');if(mode==='replace')for(const t of [...tables].reverse())this.db.prepare(`DELETE FROM ${t}`).run();for(const t of tables){if(!Array.isArray(data[t]))continue;for(const row of data[t]){const keys=Object.keys(row),q=keys.map(()=>'?').join(',');this.db.prepare(`INSERT OR ${mode==='merge'?'IGNORE':'REPLACE'} INTO ${t}(${keys.join(',')}) VALUES(${q})`).run(...keys.map(k=>row[k]));}}const completed=this.db.prepare("SELECT id FROM tasks WHERE status='completed' AND deleted_at IS NULL").all() as Array<{id:string}>;for(const task of completed)this.assertCompletable(task.id);});tx();this.log('info','import',`Data ${mode} completed`)}
  integrity(){return this.db.pragma('integrity_check') as Array<{integrity_check:string}>}
  checksum(){return createHash('sha256').update(fs.readFileSync(this.file)).digest('hex')}
}

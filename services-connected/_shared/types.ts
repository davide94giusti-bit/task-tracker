export interface Fetcher{fetch(input:Request|string,init?:RequestInit):Promise<Response>}
export interface BaseEnv{INTERNAL_SERVICE_TOKEN:string;ENVIRONMENT:string}
export interface AuthContext{userId:string;workspaceId?:string;role?:'owner'|'admin'|'member'|'viewer';email?:string;accessToken?:string;platformAdmin?:boolean}
export interface WorkerHandler<E>{fetch(request:Request,env:E,ctx:ExecutionContext):Promise<Response>;scheduled?(controller:ScheduledController,env:E,ctx:ExecutionContext):Promise<void>}
declare global{interface ExecutionContext{waitUntil(promise:Promise<unknown>):void}interface ScheduledController{scheduledTime:number;cron:string}}

import http, { type IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import type { ServiceName } from '../../packages/contracts';

export class AppError extends Error {
  constructor(public code:string,message:string,public details?:unknown,public retryable=false){super(message);this.name='AppError'}
}
export type Handler=(ctx:{req:IncomingMessage;body:any;params:URLSearchParams;requestId:string})=>unknown|Promise<unknown>;
export type Route={method:string;path:string;handler:Handler};

export function service(serviceName:ServiceName,routes:Route[],deps:Record<string,string>={}){
  const started=Date.now(),token=process.env.PRIORITYDESK_TOKEN;
  if(!token)throw new Error('Missing launch token');
  const server=http.createServer(async(req,res)=>{
    const requestId=String(req.headers['x-request-id']||randomUUID());
    res.setHeader('Content-Type','application/json');res.setHeader('X-Request-Id',requestId);
    const send=(status:number,value:any)=>{res.statusCode=status;res.end(JSON.stringify(value))};
    if(req.headers['x-local-token']!==token)return send(401,{ok:false,requestId,error:{code:'UNAUTHORIZED',message:'Invalid local service token',service:serviceName,retryable:false}});
    if(req.headers.origin&&!['file://','http://localhost:5173'].includes(req.headers.origin))return send(403,{ok:false,requestId,error:{code:'ORIGIN_REJECTED',message:'Origin is not permitted',service:serviceName,retryable:false}});
    const url=new URL(req.url||'/',`http://127.0.0.1`);
    if(req.method==='GET'&&url.pathname==='/v1/health')return send(200,{ok:true,requestId,data:{service:serviceName,status:'ok',version:'v1',uptime:(Date.now()-started)/1000,dependencies:deps}});
    const route=routes.find(r=>r.method===req.method&&r.path===url.pathname);
    if(!route)return send(404,{ok:false,requestId,error:{code:'NOT_FOUND',message:'Route not found',service:serviceName,retryable:false}});
    try{
      const chunks:Buffer[]=[];let size=0;
      for await(const c of req){size+=c.length;if(size>10_000_000)throw new AppError('PAYLOAD_TOO_LARGE','Request exceeds 10 MB');chunks.push(c)}
      const raw=Buffer.concat(chunks).toString(),body=raw?JSON.parse(raw):undefined;
      const data=await route.handler({req,body,params:url.searchParams,requestId});
      send(200,{ok:true,requestId,data});
    }catch(error){
      const e=error as any;
      send(e?.code==='NOT_FOUND'?404:400,{ok:false,requestId,error:{code:e?.code||'SERVICE_ERROR',message:e instanceof Error?e.message:String(e),service:serviceName,retryable:Boolean(e?.retryable),details:e?.details}});
    }
  });
  server.listen(Number(process.env.PORT||0),'127.0.0.1',()=>{const a=server.address();if(typeof a==='object'&&a)process.send?.({type:'ready',service:serviceName,port:a.port})});
  const stop=()=>server.close(()=>process.exit(0));
  process.on('SIGTERM',stop);process.on('SIGINT',stop);process.on('message',(m:any)=>{if(m?.type==='shutdown')stop()});
  process.on('uncaughtException',e=>{process.send?.({type:'failure',service:serviceName,message:e.message});process.exit(1)});
  return server;
}

export async function call<T=any>(base:string,path:string,options:{method?:string;body?:unknown;requestId?:string;timeout?:number}={}):Promise<T>{
  const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),options.timeout||5000);
  try{
    const r=await fetch(`${base}${path}`,{method:options.method||'GET',headers:{'content-type':'application/json','x-local-token':process.env.PRIORITYDESK_TOKEN!,'x-request-id':options.requestId||randomUUID()},body:options.body===undefined?undefined:JSON.stringify(options.body),signal:ctl.signal});
    const value:any=await r.json();
    if(!r.ok||!value.ok)throw new AppError(value.error?.code||'SERVICE_ERROR',value.error?.message||`Service returned ${r.status}`,value.error?.details,Boolean(value.error?.retryable));
    return value.data as T;
  }catch(error){
    if((error as Error).name==='AbortError')throw new AppError('TIMEOUT',`Local service timed out after ${options.timeout||5000} ms`,undefined,true);
    throw error;
  }finally{clearTimeout(timer)}
}

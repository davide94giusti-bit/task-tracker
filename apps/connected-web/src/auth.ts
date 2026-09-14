const SUPABASE_URL=import.meta.env.VITE_SUPABASE_URL as string;
const ANON_KEY=import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const KEY='tt-connected-session';
export type Session={access_token:string;refresh_token:string;expires_at:number;user:{id:string;email?:string}};
export const session={get:():Session|null=>{if(import.meta.env.VITE_DEMO_MODE==='true')return{access_token:'demo',refresh_token:'demo',expires_at:4102444800,user:{id:'demo',email:'demo@example.test'}};try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null}},set:(value:Session|null)=>value?localStorage.setItem(KEY,JSON.stringify(value)):localStorage.removeItem(KEY)};
async function auth(path:string,body:unknown){const response=await fetch(`${SUPABASE_URL}/auth/v1/${path}`,{method:'POST',headers:{apikey:ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await response.json();if(!response.ok)throw new Error(data.msg||data.error_description||'Authentication failed');return data}
export async function signIn(email:string,password:string){const data=await auth('token?grant_type=password',{email,password});session.set({...data,expires_at:Math.floor(Date.now()/1000)+data.expires_in});return data}
export async function resetPassword(email:string){return auth('recover',{email})}
export async function refresh(){const current=session.get();if(!current)throw new Error('No session');const data=await auth('token?grant_type=refresh_token',{refresh_token:current.refresh_token});session.set({...data,expires_at:Math.floor(Date.now()/1000)+data.expires_in});return data}
export async function accessToken(){let current=session.get();if(current&&current.expires_at-Date.now()/1000<60)current=await refresh();return current?.access_token}

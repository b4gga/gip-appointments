import {slotsFor,validateBooking,moscowDate,addDays} from './core.js';
const cfg = window.APP_CONFIG || {};
export const demo = !cfg.supabaseUrl && !cfg.supabaseKey;
const storageKey='gip-demo-bookings-v1';
let session;
try {session=JSON.parse(sessionStorage.getItem('gip-session')||'null');} catch {session=null;}
function saveSession(s) {session=s; if(s) sessionStorage.setItem('gip-session',JSON.stringify(s)); else sessionStorage.removeItem('gip-session');}
async function raw(path, data, token, method='POST') {
  const r=await fetch(cfg.supabaseUrl.replace(/\/$/,'')+path,{method,headers:{apikey:cfg.supabaseKey,'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(data===undefined?{}:{body:JSON.stringify(data)})});
  const value=await r.json().catch(()=>null);
  if(!r.ok) {
    const message=value?.msg||value?.message||value?.error_description||'';
    if(/slot_unavailable|23505/.test(message)||value?.code==='23505') throw new Error('Это время уже занято. Выберите другой интервал.');
    if(/Invalid login/.test(message)) throw new Error('Неверная почта или пароль.');
    if(/not_allowed/.test(message)) throw new Error('Недостаточно прав для выполнения операции.');
    if(/invalid_slot/.test(message)) throw new Error('Время недоступно. Обновите расписание.');
    if(/booking_limit/.test(message)) throw new Error('Допускается не более пяти будущих записей.');
    throw new Error(message || 'Сервис временно недоступен. Повторите попытку.');
  }
  return value;
}
async function token() {
  if(!session) throw new Error('Войдите в свою учётную запись.');
  if(session.expires_at*1000 < Date.now()+60000) {
    try {saveSession(await raw('/auth/v1/token?grant_type=refresh_token',{refresh_token:session.refresh_token}));}
    catch(e) {saveSession(null);throw new Error('Сеанс завершён. Войдите повторно.');}
  }
  return session.access_token;
}
const rpc=async(name,data={})=>raw('/rest/v1/rpc/'+name,data,await token());
const read=()=>JSON.parse(localStorage.getItem(storageKey)||'[]');
const write=rows=>localStorage.setItem(storageKey,JSON.stringify(rows));
const demoUser='demo-user';
function demoBusy(date) {return slotsFor(date).filter((_,i)=>i===2||i===7);}
export const api={
  user:()=>demo?{email:'Демонстрационный режим'}:session?.user,
  async login(email,password) {
    if(!cfg.supabaseUrl || !cfg.supabaseKey) throw new Error('Заполните оба параметра подключения в config.js.');
    saveSession(await raw('/auth/v1/token?grant_type=password',{email,password}));
  },
  async logout() {if(session) {try {await raw('/auth/v1/logout',{},await token());} finally {saveSession(null);}}},
  async isAdmin() {return demo || await rpc('is_gip_admin');},
  async availability(date) {
    if(!demo) return rpc('gip_availability',{p_date:date});
    const rows=read();const busy=demoBusy(date);
    return slotsFor(date).map(starts_at=>({starts_at,available:!busy.includes(starts_at)&&!rows.some(r=>r.starts_at===starts_at&&!r.cancelled_at)}));
  },
  async list(date,admin=false) {
    if(!demo) return rpc('gip_bookings',{p_date:admin?date:null});
    return read().filter(r=>!r.cancelled_at&&(admin?r.starts_at.slice(0,10)===date:r.user_id===demoUser&&r.kind==='appointment')).sort((a,b)=>a.starts_at.localeCompare(b.starts_at));
  },
  async book(starts_at,name,department,topic,blocked=false) {
    if(!blocked) validateBooking(name,department,topic);
    if(!demo) return rpc('gip_book',{p_start:starts_at,p_name:name,p_department:department,p_topic:topic,p_blocked:blocked});
    const run=()=>{
      const rows=read();const date=starts_at.slice(0,10);
      if(!slotsFor(date).includes(starts_at)||demoBusy(date).includes(starts_at)||rows.some(r=>r.starts_at===starts_at&&!r.cancelled_at)) throw new Error('Это время уже занято. Обновите расписание.');
      if(!blocked&&rows.filter(r=>!r.cancelled_at&&r.kind==='appointment'&&r.starts_at>new Date().toISOString()).length>=5) throw new Error('Допускается не более пяти будущих записей.');
      const row={id:crypto.randomUUID(),ticket_no:'Д-'+String(Date.now()).slice(-6),starts_at,full_name:name,department,topic,user_id:demoUser,kind:blocked?'blocked':'appointment',cancelled_at:null};
      rows.push(row);write(rows);return row;
    };
    return navigator.locks? navigator.locks.request(storageKey,run):run();
  },
  async cancel(id) {
    if(!demo) return rpc('gip_cancel',{p_id:id});
    const rows=read();const row=rows.find(r=>r.id===id);if(row)row.cancelled_at=new Date().toISOString();write(rows);
  }
};

import {api,demo} from './api.js';
import {moscowDate,addDays,workday,dateLabel,timeLabel,escapeHtml as esc} from './core.js';
import {downloadTicket} from './pdf.js';
const $=s=>document.querySelector(s);
let date=moscowDate(),selected=null,slots=[],admin=false,view='booking',ticket=null,loadId=0;
if(!workday(date)) {while(!workday(date)) date=addDays(date,1);}
function message(text,error=false){const el=$('#message');el.textContent=text;el.className=error?'error':'';el.hidden=false;}
async function action(button,fn){if(button.disabled)return;button.disabled=true;const text=button.textContent;button.textContent='Подождите…';try{await fn();}catch(e){message(e.message||'Не удалось выполнить операцию.',true);}finally{button.disabled=false;button.textContent=text;}}
function titleFor(d){return dateLabel(d,{weekday:'long',day:'numeric',month:'long'});}
function showSelected(){
  $('#selected-slot').textContent=selected?`${dateLabel(date)} · ${timeLabel(selected)}–${timeLabel(new Date(Date.parse(selected)+1200000))} МСК`:'Выберите время в расписании';
  $('#book-button').disabled=!selected;
}
function renderDays(){
  let d=moscowDate();const days=[];
  while(days.length<7){if(workday(d))days.push(d);d=addDays(d,1);}
  if(!days.includes(date)) {days.splice(6,1,date);days.sort();}
  $('#days').innerHTML=days.map(d=>`<button class="day ${d===date?'active':''}" data-date="${d}" aria-pressed="${d===date}"><span>${dateLabel(d,{weekday:'short'})}</span><strong>${Number(d.slice(-2))}</strong><span>${dateLabel(d,{month:'short'})}</span></button>`).join('');
}
async function loadSlots(){
  const id=++loadId;selected=null;showSelected();$('#date').value=date;renderDays();$('#date-title').textContent=titleFor(date);$('#slots').textContent='Загрузка расписания…';
  try{
    const result=await api.availability(date);if(id!==loadId)return;slots=result;
    if(!slots.length){$('#slots').innerHTML='<div class="empty">На эту дату нет доступных интервалов.<br>Выберите другой рабочий день.</div>';return;}
    const group=(name,rows)=>rows.length?`<p class="slot-group-label">${name}</p><div class="slot-grid">${rows.map(s=>`<button class="slot" data-slot="${esc(s.starts_at)}" ${s.available?'':'disabled'} aria-label="${timeLabel(s.starts_at)}, ${s.available?'свободно':'занято'}" aria-pressed="false">${timeLabel(s.starts_at)}</button>`).join('')}</div>`:'';
    $('#slots').innerHTML=group('До обеда',slots.filter(s=>timeLabel(s.starts_at)<'13:00'))+group('После обеда',slots.filter(s=>timeLabel(s.starts_at)>='14:00'));
  }catch(e){if(id===loadId){$('#slots').innerHTML='<div class="empty">Не удалось загрузить расписание. <button class="text-button" id="retry-slots">Повторить</button></div>';message(e.message,true);}}
}
function ticketDetails(t){return `<dl><dt>Номер талона</dt><dd>${esc(t.ticket_no)}</dd><dt>Дата и время, МСК</dt><dd>${esc(dateLabel(moscowDate(new Date(t.starts_at))))} · ${timeLabel(t.starts_at)}–${timeLabel(new Date(Date.parse(t.starts_at)+1200000))}</dd><dt>Сотрудник</dt><dd>${esc(t.full_name)}</dd><dt>Подразделение</dt><dd>${esc(t.department)}</dd><dt>Тема обращения</dt><dd>${esc(t.topic)}</dd><dt>ГИП</dt><dd>Демьянов Илья Сергеевич</dd></dl>`;}
async function renderList(isAdmin=false){
  const target=$(isAdmin?'#admin-list':'#my-list');target.textContent='Загрузка…';
  const day=$('#admin-date').value;
  try{
    const rows=await api.list(day,isAdmin);
    target.innerHTML=rows.length?rows.map(r=>`<article class="ticket-row"><div><span class="ticket-number">${r.kind==='blocked'?'ЗАКРЫТЫЙ ИНТЕРВАЛ':`ТАЛОН ${esc(r.ticket_no)}`}${r.cancelled_at?' · ОТМЕНЁН':''}</span><h2>${esc(dateLabel(moscowDate(new Date(r.starts_at))))} · ${timeLabel(r.starts_at)} МСК</h2><p>${esc(r.full_name)}${r.department?' · '+esc(r.department):''}</p><p>${esc(r.topic)}</p></div><div class="row-actions">${r.kind==='appointment'&&!r.cancelled_at?`<button class="secondary" data-pdf="${r.id}">Скачать PDF</button>`:''}${!r.cancelled_at&&new Date(r.starts_at)>new Date()?`<button class="text-button" data-cancel="${r.id}">${r.kind==='blocked'?'Открыть интервал':'Отменить запись'}</button>`:''}</div></article>`).join(''):`<div class="empty">${isAdmin?'На выбранную дату записей нет.':'У вас пока нет талонов. Выберите время в разделе «Запись на приём».'}</div>`;
    target._rows=rows;
    if(isAdmin){const times=await api.availability(day);$('#block-slot').innerHTML=times.filter(s=>s.available).map(s=>`<option value="${esc(s.starts_at)}">${timeLabel(s.starts_at)}</option>`).join('');$('#block-button').disabled=!times.some(s=>s.available);}
  }catch(e){target.innerHTML='<div class="empty">Данные недоступны. Повторите попытку.</div>';message(e.message,true);}
}
async function switchView(next){
  if(next==='admin'&&!admin)return;view=next;
  for(const v of ['booking','mine','admin'])$(`#${v}-view`).hidden=v!==view;
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  const titles={booking:['Запись на приём','Выберите удобное время для обсуждения рабочего вопроса.'],mine:['Мои талоны','Сохраните талон в PDF или отмените запись при изменении планов.'],admin:['Расписание ГИП','Управление приёмом сотрудников и доступным временем.']};
  $('#page-title').textContent=titles[view][0];$('#page-description').textContent=titles[view][1];
  if(view==='booking')await loadSlots();else await renderList(view==='admin');
}
async function init(){
  $('#mode-banner').hidden=!demo;$('#account-label').textContent=api.user()?.email||'Вход для сотрудников';
  const logged=!!api.user();$('#login-view').hidden=logged;$('#workspace').hidden=!logged;$('#logout').hidden=demo||!logged;
  if(!logged)return;
  try{admin=await api.isAdmin();$('#admin-nav').hidden=!admin;await switchView(view);}catch(e){message(e.message,true);}
}
for(const el of [$('#date'),$('#admin-date')]){el.min=moscowDate();el.max=addDays(moscowDate(),30);el.value=date;}
$('#days').addEventListener('click',e=>{const b=e.target.closest('[data-date]');if(b){date=b.dataset.date;loadSlots();}});
$('#date').addEventListener('change',()=>{const d=$('#date').value;if(d&&d>=$('#date').min&&d<=$('#date').max){date=d;loadSlots();}});
$('#slots').addEventListener('click',e=>{
  if(e.target.id==='retry-slots'){loadSlots();return;}
  const b=e.target.closest('[data-slot]');if(!b||b.disabled)return;selected=b.dataset.slot;
  document.querySelectorAll('.slot').forEach(s=>{s.classList.toggle('selected',s===b);s.setAttribute('aria-pressed',String(s===b));});showSelected();
});
document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
$('#login-form').addEventListener('submit',e=>{e.preventDefault();action(e.submitter,async()=>{const f=new FormData(e.target);await api.login(f.get('email').trim(),f.get('password'));await init();});});
$('#logout').addEventListener('click',()=>action($('#logout'),async()=>{try{await api.logout();}finally{admin=false;$('#admin-nav').hidden=true;view='booking';await init();}}));
$('#booking-form').addEventListener('submit',e=>{e.preventDefault();if(!selected)return;action(e.submitter,async()=>{
  const f=new FormData(e.target);const start=selected;
  try{ticket=await api.book(start,f.get('full_name').trim(),f.get('department').trim(),f.get('topic').trim());}
  catch(err){await loadSlots();throw err;}
  $('#ticket-details').innerHTML=ticketDetails(ticket);$('#ticket-dialog').showModal();await loadSlots();
}).finally(showSelected);});
$('#close-dialog').addEventListener('click',()=>$('#ticket-dialog').close());
$('#download-ticket').addEventListener('click',()=>action($('#download-ticket'),()=>downloadTicket(ticket,demo)));
$('#refresh-mine').addEventListener('click',()=>renderList());
$('#admin-date').addEventListener('change',()=>{if($('#admin-date').value)renderList(true);});
for(const target of [$('#my-list'),$('#admin-list')])target.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;const row=target._rows?.find(r=>r.id===(b.dataset.pdf||b.dataset.cancel));if(!row)return;
  if(b.dataset.pdf)action(b,()=>downloadTicket(row,demo));
  if(b.dataset.cancel&&confirm('Отменить запись и освободить выбранное время?'))action(b,async()=>{await api.cancel(row.id);await renderList(view==='admin');message('Запись отменена. Время снова доступно.');});
});
$('#block-button').addEventListener('click',()=>action($('#block-button'),async()=>{const start=$('#block-slot').value;if(!start)return;await api.book(start,'','','Недоступно: '+($('#block-reason').value.trim().slice(0,480)||'Рабочее мероприятие'),true);$('#block-reason').value='';await renderList(true);message('Интервал закрыт для записи.');}));
// Проверка доступности при возврате на вкладку исключает выбор устаревшего интервала.
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&api.user()&&view==='booking')loadSlots();});
init();

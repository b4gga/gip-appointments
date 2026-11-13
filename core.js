export const TZ = 'Europe/Moscow';
export function moscowDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone: TZ, year:'numeric', month:'2-digit', day:'2-digit'}).formatToParts(now);
  const get = k => parts.find(p => p.type === k).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function addDays(date, n) { return new Date(Date.parse(date+'T12:00:00Z') + n*86400000).toISOString().slice(0,10); }
export function workday(date) { return ![0,6].includes(new Date(date+'T12:00:00Z').getUTCDay()); }
export function dateLabel(date, options = {day:'numeric',month:'long'}) { return new Intl.DateTimeFormat('ru-RU', options).format(new Date(date+'T12:00:00Z')); }
export function timeLabel(iso) { return new Intl.DateTimeFormat('ru-RU',{timeZone:TZ,hour:'2-digit',minute:'2-digit'}).format(new Date(iso)); }
export function slotsFor(date, now = new Date()) {
  if (!workday(date) || date < moscowDate(now) || date > addDays(moscowDate(now), 30)) return [];
  const slots=[];
  for (let m=540;m<1080;m+=20) {
    if (m>=780 && m<840) continue;
    const t = `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
    const iso=new Date(`${date}T${t}:00+03:00`).toISOString();
    if (new Date(iso)>now) slots.push(iso);
  }
  return slots;
}
export function validateBooking(name, department, topic) {
  if (name.trim().length<5 || name.trim().length>120) throw new Error('Укажите ФИО: от 5 до 120 символов.');
  if (!department.trim() || department.trim().length>120) throw new Error('Укажите подразделение: до 120 символов.');
  if (topic.trim().length<3 || topic.trim().length>500) throw new Error('Укажите тему обращения: от 3 до 500 символов.');
}
export function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

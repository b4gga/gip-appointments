import {dateLabel,timeLabel,moscowDate} from './core.js';
let fontBytes;
function wrap(text,font,size,width) {
  const lines=[];
  for(const para of String(text).split(/\r?\n/)) {
    let line='';
    for(const char of para) {
      if(font.widthOfTextAtSize(line+char,size)>width){lines.push(line);line='';}
      line+=char;
    }
    lines.push(line);
  }
  return lines;
}
export async function makeTicketPdf(ticket, demo=false) {
  if(!window.PDFLib || !window.fontkit) throw new Error('Не удалось загрузить модуль PDF. Обновите страницу.');
  const {PDFDocument,rgb}=window.PDFLib;
  const doc=await PDFDocument.create();doc.registerFontkit(window.fontkit);
  if(!fontBytes) {
    const r=await fetch(new URL('./NotoSans-Regular.ttf',import.meta.url));
    if(!r.ok) throw new Error('Не удалось загрузить шрифт для PDF.');
    fontBytes=await r.arrayBuffer();
  }
  const font=await doc.embedFont(fontBytes,{subset:true});
  doc.setTitle('Талон на приём к ГИП '+ticket.ticket_no);doc.setAuthor('АО «Россети НТЦ»');
  let page=doc.addPage([595.28,841.89]);const blue=rgb(.09,.32,.65),ink=rgb(.13,.21,.32),muted=rgb(.42,.48,.57);
  const draw=(text,x,y,size=11,color=ink)=>page.drawText(text,{x,y,size,font,color});
  page.drawRectangle({x:0,y:806,width:595.28,height:36,color:blue});
  draw('АО «РОССЕТИ НТЦ»',42,775,14,blue);
  draw('Департамент реализации проектов',42,751,10,muted);
  draw(demo?'ДЕМОНСТРАЦИОННЫЙ ТАЛОН':'ТАЛОН НА ПРИЁМ К ГИП',42,699,21);
  draw('Номер: '+ticket.ticket_no,42,671,12,blue);
  page.drawLine({start:{x:42,y:648},end:{x:553,y:648},thickness:1,color:rgb(.85,.89,.94)});
  let y=620;
  const field=(label,value)=>{
    if(y<160){page=doc.addPage([595.28,841.89]);y=775;draw('ТАЛОН '+ticket.ticket_no+' · ПРОДОЛЖЕНИЕ',42,y,12,blue);y-=40;}
    draw(label,42,y,9,muted);y-=22;
    for(const line of wrap(value,font,12,500)){
      if(y<125){page=doc.addPage([595.28,841.89]);y=775;draw('ТАЛОН '+ticket.ticket_no+' · ПРОДОЛЖЕНИЕ',42,y,12,blue);y-=40;}
      draw(line,42,y,12);y-=19;
    }
    y-=17;
  };
  field('ДАТА И ВРЕМЯ',`${dateLabel(moscowDate(new Date(ticket.starts_at)),{day:'numeric',month:'long',year:'numeric'})}, ${timeLabel(ticket.starts_at)}–${timeLabel(new Date(Date.parse(ticket.starts_at)+1200000))} (МСК)`);
  field('ГЛАВНЫЙ ИНЖЕНЕР ПРОЕКТА','Демьянов Илья Сергеевич');
  field('СОТРУДНИК',ticket.full_name);
  field('ПОДРАЗДЕЛЕНИЕ',ticket.department);
  field('ТЕМА ОБРАЩЕНИЯ',ticket.topic.replace(/[\r\n\t]+/g,' '));
  for(const p of doc.getPages()) {
  page=p;
  page.drawLine({start:{x:42,y:99},end:{x:553,y:99},thickness:1,color:rgb(.85,.89,.94)});
  draw(demo?'Учебный пример. Реальный приём не забронирован.':'При изменении планов отмените запись в разделе «Мои талоны».',42,77,9,muted);
  draw('Время московское. Продолжительность приёма: 20 минут.',42,59,9,muted);
  draw('Актуальность записи проверяется в электронной приёмной.',42,41,9,muted);
  }
  return doc.save();
}
export async function downloadTicket(ticket,demo=false) {
  const bytes=await makeTicketPdf(ticket,demo);
  const url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'}));
  const a=document.createElement('a');a.href=url;a.download=`talon-${ticket.ticket_no}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}

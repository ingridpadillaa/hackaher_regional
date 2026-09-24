const csrf = () => document.querySelector('meta[name="csrf-token"]').content;
async function api(url, data) {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-CSRF-Token': csrf()
        },
        body: JSON.stringify(data)
    });
    if (!response.ok) throw new Error('No pudimos completar la acción. Recarga e intenta de nuevo.');
    return response.json();
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
document.querySelectorAll('[data-prompt]').forEach(button => button.addEventListener('click', () => {
    document.getElementById('chat-input').value = button.dataset.prompt;
    document.getElementById('chat-form').requestSubmit();
}));
const chatKey='summa-jami-'+(document.body.dataset.user||'');
let history=[];
try{history=JSON.parse(sessionStorage.getItem(chatKey)||'[]');}catch{}
function renderChat(){const out=document.getElementById('chat-output');if(!out)return;out.replaceChildren();for(const line of history.slice(-20)){const p=document.createElement('p');p.textContent=line.text;out.append(p);for(const action of line.actions||[]){if(!['/','/movimientos','/mandado','/movimientos/reportes','/perfil/personalizacion','/perfil/personalizacion/pagos','/calendario'].includes(action.ruta))continue;const link=document.createElement('a');link.href=action.ruta;link.textContent=action.label;link.className='button secondary';out.append(link);}}}
renderChat();
document.getElementById('chat-form')?.addEventListener('submit',async event=>{event.preventDefault();const input=document.getElementById('chat-input');const message=input.value;history.push({text:'Tú: '+message});input.value='';renderChat();try{const response=await api('/copiloto/chat',{message});history.push({text:'Jami: '+response.answer,actions:response.actions||[]});history=history.slice(-20);sessionStorage.setItem(chatKey,JSON.stringify(history));}catch(error){history.push({text:error.message});}renderChat();});
document.querySelector('form[action="/auth/logout"]')?.addEventListener('submit',()=>sessionStorage.removeItem(chatKey));

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
document.getElementById('chat-form')?.addEventListener('submit', async event => {
    event.preventDefault();
    const out = document.getElementById('chat-output');
    out.textContent = 'Revisando tus números…';
    try {
        out.textContent = (await api('/copiloto/chat', {
            message: document.getElementById('chat-input').value
        })).answer;
    } catch (error) {
        out.textContent = error.message;
    }
});

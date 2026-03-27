// --- CONFIGURAÇÃO DA API ---
const API_URL = 'http://localhost:8000/api'; 

// --- SISTEMA DE DADOS ---
async function carregarItens() {
    try {
        const response = await fetch(`${API_URL}/itens`); // URL Limpa
        if (!response.ok) throw new Error(`Erro HTTP: ${response.status}`);

        const data = await response.json();
        itensCadastrados = data || [];
        
        renderizarCards();
        if (typeof initMapaPrincipal === "function") initMapaPrincipal();
    } catch (err) {
        console.error("Erro ao carregar itens:", err);
    }
}

async function salvarPost() {
    if (!currentUser) return abrirModalAuth();
    
    const titulo = document.getElementById('tituloItem').value;
    const localRaw = document.getElementById('latLogItem').value;
    const categoria = document.getElementById('categoriaItem').value;
    const pergunta = document.getElementById('perguntaSeguranca').value;
    const fotoPreview = document.getElementById('preview').src; 

    if (!titulo || !localRaw || categoria === "Outros") {
        return alert("Preencha todos os campos corretamente!");
    }

    const coords = JSON.parse(localRaw);
    
    const payload = {
        titulo: titulo,
        categoria: categoria,
        pergunta: pergunta,
        lat: coords.lat,
        lng: coords.lng,
        foto: fotoPreview.includes('base64') ? fotoPreview : null, // Envia a imagem
        user_id: currentUser.id, 
        usuario_nome: currentUser.user_metadata.full_name || "Usuário",
        owner_email: currentUser.email
    };

    try {
        const response = await fetch(`${API_URL}/itens`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.detail || "Erro ao salvar.");
        }

        const novoItem = await response.json();
        itensCadastrados.unshift(novoItem);
        renderizarCards();
        fecharModalPost();
        alert("Publicado com sucesso!");

    } catch (err) { 
        alert(err.message); 
    }
}

async function aceitarPedido(chatId) {
    try {
        const response = await fetch(`${API_URL}/chats/aceitar/${chatId}`, { 
            method: 'POST' 
        });
        if (response.ok) {
            alert("Chat liberado! Use o ícone de mensagens.");
            if (typeof atualizarStatusChats === "function") atualizarStatusChats();
            fecharModalPedidos();
        }
    } catch (err) { console.error(err); }
}

async function enviarMensagemReal(chatId) {
    const input = document.getElementById('msgInput');
    const texto = input.value.trim();
    if (!texto) return;

    const payload = { 
        chat_id: parseInt(chatId), 
        sender_id: currentUser.id, 
        texto: texto 
    };
    
    try {
        await fetch(`${API_URL}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        input.value = '';
        carregarMensagens(chatId); // Refresh local
    } catch (err) { console.error("Erro ao enviar:", err); }
}
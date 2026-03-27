// ==========================================
// script.js (Trechos refatorados para a nova API)
// ==========================================

// --- CONFIGURAÇÃO DA API ---
const API_URL = 'http://localhost:8000/api'; // URL do seu servidor FastAPI

// --- SISTEMA DE DADOS (Fetch API + Async/Await) ---
async function carregarItens() {
    try {
        const response = await fetch(`${API_URL}/itens`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
            throw new Error(`Erro HTTP: ${response.status}`);
        }

        const data = await response.json();
        itensCadastrados = data || [];
        
        renderizarCards();
        initMapaPrincipal();
    } catch (err) {
        console.error("Erro ao carregar itens da API:", err);
        const grid = document.getElementById('itemGrid');
        if(grid) {
            grid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: red; padding: 40px;">Erro ao conectar com o servidor da API.</p>`;
        }
    }
}

async function salvarPost() {
    // 1. Validação de Autenticação no Front
    if (!currentUser) return abrirModalAuth();
    
    // 2. Coleta de Dados do Formulário
    const titulo = document.getElementById('tituloItem').value;
    const localRaw = document.getElementById('latLogItem').value;
    const categoria = document.getElementById('categoriaItem').value;
    const pergunta = document.getElementById('perguntaSeguranca').value;

    // 3. Validação de Campos
    if (!titulo || !localRaw || categoria === "Outros") {
        return alert("Preencha todos os campos corretamente, incluindo a categoria e a localização!");
    }

    const coords = JSON.parse(localRaw);
    
    // 4. Montagem do Payload (JSON)
    const payload = {
        titulo: titulo,
        categoria: categoria,
        pergunta: pergunta,
        lat: coords.lat,
        lng: coords.lng,
        user_id: currentUser.id, 
        usuario_nome: currentUser.user_metadata.full_name
    };

    try {
        // 5. Envio Assíncrono para o Back-end
        const response = await fetch(`${API_URL}/itens`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.detail || "Erro ao salvar item no servidor.");
        }

        const novoItem = await response.json();
        
        // 6. Atualização Dinâmica (Sem recarregar a página)
        itensCadastrados.unshift(novoItem);
        renderizarCards();
        atualizarMarkersMapa();
        
        fecharModalPost();
        alert("Item publicado com sucesso!");

    } catch (err) { 
        alert(err.message); 
    }
}
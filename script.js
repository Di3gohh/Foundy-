// --- CONFIGURAÇÃO SUPABASE ---
const SUPABASE_URL = 'https://ndlpzprccxjpuxqtzrxl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_94q7-RW5thyf7kBRUHDxBw_0bPPvRkX'; 
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- ESTADO GLOBAL ---
let itensCadastrados = [];
let currentUser = null;
let currentItem = null;
let categoriaAtiva = "Todos";
let termoBusca = "";
let mapaPrincipal, mapaPost, markerPost;
let isLoginMode = false;
let canalChat = null;

// --- INICIALIZAÇÃO ---
window.addEventListener('DOMContentLoaded', async () => {
    const { data: { user } } = await supabaseClient.auth.getUser();
    currentUser = user;
    
    await carregarItens();
    atualizarUI();
    if (currentUser) {
        calcularKarma();
        checarMeusPedidos(); // Verifica se há solicitações para o dono ao carregar
    }
});

// --- SISTEMA DE DADOS ---
async function carregarItens() {
    try {
        const { data, error } = await supabaseClient
            .from('itens')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        itensCadastrados = data || [];
        renderizarCards();
        initMapaPrincipal();
    } catch (err) {
        console.error("Erro ao carregar itens:", err);
    }
}

function renderizarCards() {
    const grid = document.getElementById('itemGrid');
    const itens = itensFiltrados();
    
    if (itens.length === 0) {
        grid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">Nenhum item encontrado.</p>`;
        return;
    }

    grid.innerHTML = itens.map(i => `
        <div class="card">
            <img src="${i.foto || 'https://via.placeholder.com/400x250?text=Sem+Foto'}" loading="lazy" alt="${i.titulo}">
            <div class="card-content">
                <small>${i.categoria}</small>
                <h3>${i.titulo}</h3>
                <button class="btn-save" onclick="abrirVerificacao(${i.id})">
                    ${currentUser && i.user_id === currentUser.id ? 'Ver Mensagens' : 'É meu! (Reivindicar)'}
                </button>
            </div>
        </div>
    `).join('');
}

// --- PESQUISA E FILTROS ---
function buscarItens() {
    termoBusca = document.getElementById('inputPesquisa').value.toLowerCase();
    renderizarCards();
}

function filtrarCategoria(cat) {
    categoriaAtiva = cat;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.innerText.includes(cat)) btn.classList.add('active');
    });
    renderizarCards();
}

function itensFiltrados() {
    return itensCadastrados.filter(i => {
        const matchCat = categoriaAtiva === "Todos" || i.categoria === categoriaAtiva;
        const matchBusca = i.titulo.toLowerCase().includes(termoBusca);
        return matchCat && matchBusca;
    });
}

// --- POSTAGEM DE ITEM ---
async function salvarPost() {
    if (!currentUser) return abrirModalAuth();
    
    const titulo = document.getElementById('tituloItem').value.trim();
    const localRaw = document.getElementById('latLogItem').value;
    const categoria = document.getElementById('categoriaItem').value;
    const pergunta = document.getElementById('perguntaSeguranca').value.trim();
    const fotoInput = document.getElementById('fotoItem'); 
    const file = fotoInput.files[0];

    if (!titulo || !localRaw || categoria === "Outros" || !pergunta || !file) {
        return alert("Preencha todos os campos e selecione uma foto.");
    }

    const btn = document.getElementById('btnPublish');
    btn.disabled = true;
    btn.innerText = "Publicando...";

    try {
        const urlDaFoto = await uploadFoto(file);
        const { error } = await supabaseClient.from('itens').insert([{
            titulo, 
            categoria, 
            foto: urlDaFoto,
            pergunta,
            lat: JSON.parse(localRaw).lat, 
            lng: JSON.parse(localRaw).lng,
            user_id: currentUser.id,
            owner_email: currentUser.email, // IMPORTANTE para o EmailJS
            usuario_nome: currentUser.user_metadata.full_name || "Usuário"
        }]);

        if (error) throw error;
        
        alert("Publicado! ✨");
        fecharModalPost();
        location.reload();
    } catch (err) { 
        alert("Erro: " + err.message); 
    } finally {
        btn.disabled = false;
        btn.innerText = "Publicar Agora";
    }
}

// --- CHAT E REIVINDICAÇÃO ---
function abrirVerificacao(id) {
    if (!currentUser) return abrirModalAuth();
    currentItem = itensCadastrados.find(i => i.id === id);
    
    // Se eu sou o dono, abro o chat direto
    if (currentItem.user_id === currentUser.id) {
        return abrirChatReal(id);
    }

    // Se não sou o dono, preciso responder a pergunta
    document.getElementById('perguntaExibida').innerText = currentItem.pergunta;
    document.getElementById('modalConvite').style.display = 'flex';
}

async function enviarPedidoChat() { 
    const resposta = document.getElementById('respostaConvite').value.trim();
    if (!resposta) return alert("Por favor, responda à pergunta.");
    
    const btn = document.querySelector('#modalConvite .btn-save');
    btn.disabled = true;

    try {
        // 1. Registra a solicitação
        const { error } = await supabaseClient.from('solicitações_chat').insert([{
            item_id: currentItem.id,
            requisitante_id: currentUser.id,
            dono_id: currentItem.user_id,
            resposta_seguranca: resposta,
            status: 'pendente'
        }]);

        if (error) throw error;

        // 2. Notifica o dono via EmailJS
        await emailjs.send("SEU_SERVICE_ID", "7kr10yr", {
            item_title: currentItem.titulo,
            user_name: currentUser.user_metadata.full_name,
            answer: resposta,
            owner_email: currentItem.owner_email
        });

        alert("Solicitação enviada! O dono foi avisado e o chat será liberado assim que ele aceitar.");
        fecharModalConvite();
    } catch (err) {
        alert("Erro ao solicitar: " + err.message);
    } finally {
        btn.disabled = false;
    }
}

// --- LÓGICA DO CHAT REALTIME ---
async function abrirChatReal(itemId) {
    document.getElementById('modalChat').style.display = 'flex';
    document.getElementById('chatPartner').innerText = currentItem.titulo;
    
    await carregarMensagens(itemId);

    if (canalChat) supabaseClient.removeChannel(canalChat);
    
    canalChat = supabaseClient.channel(`chat-${itemId}`)
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'messages', 
            filter: `item_id=eq.${itemId}` 
        }, payload => {
            adicionarMensagemUI(payload.new);
        }).subscribe();
}

async function enviarMensagemReal() {
    const input = document.getElementById('msgInput');
    const texto = input.value.trim();
    if (!texto) return;
    
    const msgParaEnviar = {
        content: texto,
        sender_id: currentUser.id,
        item_id: currentItem.id,
        receiver_id: currentItem.user_id === currentUser.id ? 'REQUISITANTE_ID_AQUI' : currentItem.user_id
    };

    input.value = ''; 
    await supabaseClient.from('messages').insert([msgParaEnviar]);
}

// --- AUXILIARES ---
async function uploadFoto(file) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const { data, error } = await supabaseClient.storage.from('fotos-itens').upload(fileName, file);
    if (error) throw error;
    const { data: { publicUrl } } = supabaseClient.storage.from('fotos-itens').getPublicUrl(fileName);
    return publicUrl;
}

function fecharChat() { 
    document.getElementById('modalChat').style.display = 'none'; 
    if (canalChat) supabaseClient.removeChannel(canalChat);
}
async function abrirModalPedidos() {
    document.getElementById('modalPedidos').style.display = 'flex';
    const { data } = await supabaseClient
        .from('solicitações_chat')
        .select('*, requisitante_id(full_name)')
        .eq('dono_id', currentUser.id)
        .eq('status', 'pendente');

    const lista = document.getElementById('listaPedidosPendentes');
    if (data && data.length > 0) {
        lista.innerHTML = data.map(p => `
            <div style="background:rgba(255,255,255,0.05); padding:15px; border-radius:10px; margin-bottom:10px;">
                <p><strong>${p.requisitante_id.full_name}</strong> quer um item.</p>
                <p style="font-style:italic; color:var(--primary);">" ${p.resposta_seguranca} "</p>
                <button class="btn-save" style="padding:5px 10px; font-size:0.8rem;" onclick="aceitarPedido('${p.id}')">Aceitar e Abrir Chat</button>
            </div>
        `).join('');
    }
}
async function aceitarPedido(pedidoId) {
    try {
        // 1. Atualiza o status da solicitação para 'aprovado' no Supabase
        const { error } = await supabaseClient
            .from('solicitações_chat')
            .update({ status: 'aprovado' })
            .eq('id', pedidoId);

        if (error) throw error;

        alert("Solicitação aceita! O chat agora está liberado para ambos.");
        
        // Fecha o modal de pedidos e recarrega a lista para sumir o que foi aceito
        document.getElementById('modalPedidos').style.display = 'none';
        
        // Opcional: Abrir o chat automaticamente após aceitar
        const pedido = await supabaseClient
            .from('solicitações_chat')
            .select('item_id')
            .eq('id', pedidoId)
            .single();
            
        if (pedido.data) {
            abrirChatReal(pedido.data.item_id);
        }

    } catch (err) {
        console.error("Erro ao aceitar pedido:", err);
        alert("Erro ao liberar o chat.");
    }
}
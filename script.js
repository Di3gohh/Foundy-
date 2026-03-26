// --- CONFIGURAÇÃO SUPABASE ---
const SUPABASE_URL = 'https://ndlpzprccxjpuxqtzrxl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_...'; // Certifique-se de usar sua chave real
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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
    // 1. Verificar sessão do usuário
    const { data: { user } } = await supabaseClient.auth.getUser();
    currentUser = user;
    
    // 2. Carregar dados iniciais
    await carregarItens();
    atualizarUI();
    if(currentUser) calcularKarma();
});

// --- SISTEMA DE DADOS ---
async function carregarItens() {
    const { data, error } = await supabaseClient
        .from('itens')
        .select('*')
        .order('created_at', { ascending: false });

    if (!error) {
        itensCadastrados = data;
        renderizarCards();
        initMapaPrincipal();
    } else {
        console.error("Erro ao carregar itens:", error);
    }
}

function renderizarCards() {
    const grid = document.getElementById('itemGrid');
    const itens = itensFiltrados();
    
    if(itens.length === 0) {
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
                    ${currentUser && i.user_id === currentUser.id ? 'Ver Conversas' : 'É meu! (Reivindicar)'}
                </button>
            </div>
        </div>
    `).join('');
}

// --- MAPAS (CORRIGIDOS) ---
function initMapaPrincipal() {
    if (!mapaPrincipal) {
        mapaPrincipal = L.map('mapaPrincipal').setView([-23.55, -46.63], 13);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap'
        }).addTo(mapaPrincipal);
    }
    
    // Limpa marcadores para não duplicar no filtro
    mapaPrincipal.eachLayer(l => { if (l instanceof L.Marker) mapaPrincipal.removeLayer(l); });
    
    const itens = itensFiltrados();
    itens.forEach(item => {
        if (item.lat && item.lng) {
            L.marker([item.lat, item.lng]).addTo(mapaPrincipal)
             .bindPopup(`
                <div style="text-align:center; font-family:'Plus Jakarta Sans';">
                    <b>${item.titulo}</b><br>
                    <small>${item.categoria}</small><br>
                    <button class="btn-save" style="padding: 5px 10px; font-size: 12px;" onclick="abrirVerificacao(${item.id})">Ver Item</button>
                </div>
             `);
        }
    });
}

function minhaLocalizacao() {
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(p => {
            const latlng = [p.coords.latitude, p.coords.longitude];
            mapaPrincipal.setView(latlng, 15);
        }, () => alert("Ative a localização no navegador."));
    }
}

// --- AUTENTICAÇÃO (UNIFICADA) ---
function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    document.getElementById('authTitle').innerText = isLoginMode ? "Entrar na Conta" : "Criar Conta Foundy";
    document.getElementById('btnAuthSubmit').innerText = isLoginMode ? "Entrar" : "Cadastrar";
    document.getElementById('toggleAuth').innerText = isLoginMode ? "Não tem conta? Cadastrar" : "Já tem conta? Entrar";
    document.getElementById('camposCadastroAdicionais').style.display = isLoginMode ? "none" : "block";
}

async function handleSignUp() {
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPass').value;
    const btn = document.getElementById('btnAuthSubmit');

    if (!email || !password) return alert("Preencha e-mail e senha.");
    
    btn.disabled = true;
    btn.innerText = "Processando...";

    try {
        if (isLoginMode) {
            const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw error;
            window.location.reload();
        } else {
            const fullName = document.getElementById('regNome').value;
            const cpf = document.getElementById('regCpf').value;
            if(!fullName || !cpf) throw new Error("Nome e CPF são obrigatórios.");

            const { error } = await supabaseClient.auth.signUp({
                email, password,
                options: { data: { full_name: fullName, cpf: cpf } }
            });
            if (error) throw error;
            alert("Sucesso! Verifique seu e-mail.");
            toggleAuthMode();
        }
    } catch (err) {
        alert(err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = isLoginMode ? "Entrar" : "Cadastrar";
    }
}

// --- CHAT EM TEMPO REAL (CORRIGIDO) ---
async function abrirChatReal(itemId, mensagemInicial = null) {
    if (!currentUser) return abrirModalAuth();
    currentItem = itensCadastrados.find(i => i.id === itemId);
    
    document.getElementById('modalChat').style.display = 'flex';
    document.getElementById('chatPartner').innerText = `Chat: ${currentItem.titulo}`;
    
    await carregarMensagens(itemId);

    if(mensagemInicial) {
        await enviarMensagemParaBanco(`🔑 **Resposta de Segurança:** ${mensagemInicial}`);
    }

    if (canalChat) supabaseClient.removeChannel(canalChat);
    canalChat = supabaseClient.channel(`chat-${itemId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `item_id=eq.${itemId}` }, payload => {
            adicionarMensagemUI(payload.new);
        }).subscribe();
}

async function carregarMensagens(itemId) {
    const { data: msgs } = await supabaseClient.from('messages').select('*').eq('item_id', itemId).order('created_at', { ascending: true });
    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = '';
    if(msgs) msgs.forEach(m => adicionarMensagemUI(m));
}

function adicionarMensagemUI(m) {
    const chatMessages = document.getElementById('chatMessages');
    const isMine = m.sender_id === currentUser.id;
    const div = document.createElement('div');
    div.className = `msg-bubble ${isMine ? 'msg-mine' : 'msg-other'}`;
    div.innerHTML = m.content.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>'); 
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

async function enviarMensagemReal() {
    const input = document.getElementById('msgInput');
    const texto = input.value.trim();
    if(!texto) return;
    input.value = '';
    await enviarMensagemParaBanco(texto);
}

async function enviarMensagemParaBanco(texto) {
    await supabaseClient.from('messages').insert([{
        content: texto,
        sender_id: currentUser.id,
        item_id: currentItem.id,
        receiver_id: currentItem.user_id
    }]);
}

// --- UTILITÁRIOS ---
function abrirModalPost() { 
    if(!currentUser) return abrirModalAuth();
    document.getElementById('modalPost').style.display = 'flex';
    setTimeout(() => {
        if(!mapaPost) {
            mapaPost = L.map('mapaPost').setView([-23.55, -46.63], 13);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(mapaPost);
            mapaPost.on('click', e => {
                if(markerPost) mapaPost.removeLayer(markerPost);
                markerPost = L.marker(e.latlng).addTo(mapaPost);
                document.getElementById('latLogItem').value = JSON.stringify(e.latlng);
            });
        } else {
            mapaPost.invalidateSize();
        }
    }, 300);
}

async function salvarPost() {
    const btn = document.querySelector('#modalPost .btn-save');
    const titulo = document.getElementById('tituloItem').value;
    const localRaw = document.getElementById('latLogItem').value;
    const categoria = document.getElementById('categoriaItem').value;
    const pergunta = document.getElementById('perguntaSeguranca').value;
    const foto = document.getElementById('preview').src;

    if (!titulo || !localRaw || !pergunta) return alert("Preencha todos os campos e marque o local no mapa.");

    btn.disabled = true;
    btn.innerText = "Publicando...";

    const local = JSON.parse(localRaw);
    const { error } = await supabaseClient.from('itens').insert([{
        titulo, categoria, foto, pergunta,
        lat: local.lat, lng: local.lng,
        user_id: currentUser.id,
        usuario_nome: currentUser.user_metadata.full_name || "Usuário"
    }]);

    if (!error) {
        alert("Publicado! +10 Karma ✨");
        window.location.reload();
    } else {
        alert(error.message);
        btn.disabled = false;
        btn.innerText = "Publicar Item";
    }
}

function filtrarCategoria(cat) {
    categoriaAtiva = cat;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.innerText.includes(cat));
    });
    renderizarCards();
    initMapaPrincipal();
}

function itensFiltrados() {
    return itensCadastrados.filter(i => {
        const matchCat = categoriaAtiva === "Todos" || i.categoria === categoriaAtiva;
        const matchBusca = i.titulo.toLowerCase().includes(termoBusca.toLowerCase());
        return matchCat && matchBusca;
    });
}

function buscarItens() {
    termoBusca = document.getElementById('inputPesquisa').value;
    renderizarCards();
    initMapaPrincipal();
}

function abrirVerificacao(id) {
    if (!currentUser) return abrirModalAuth();
    currentItem = itensCadastrados.find(i => i.id === id);
    if(currentItem.user_id === currentUser.id) return abrirChatReal(id);

    document.getElementById('perguntaExibida').innerText = currentItem.pergunta;
    document.getElementById('modalConvite').style.display = 'flex';
}

function enviarPedidoChat() { 
    const resp = document.getElementById('respostaConvite').value;
    if(!resp) return alert("Responda à pergunta.");
    fecharModalConvite();
    abrirChatReal(currentItem.id, resp); 
}

function analisarFoto(e) {
    const reader = new FileReader();
    reader.onload = () => {
        const p = document.getElementById('preview');
        p.src = reader.result; p.style.display = 'block';
        document.getElementById('uploadPlaceholder').style.display = 'none';
    };
    reader.readAsDataURL(e.target.files[0]);
}

function atualizarUI() {
    if(currentUser) {
        const nome = currentUser.user_metadata.full_name?.split(' ')[0] || "Usuário";
        document.getElementById('authArea').innerHTML = `<span>Olá, <b>${nome}</b></span> <button onclick="sair()" style="margin-left:10px; cursor:pointer; background:none; border:none; color:var(--text-muted);">Sair</button>`;
    }
}

function calcularKarma() {
    const meus = itensCadastrados.filter(i => i.user_id === currentUser.id);
    document.getElementById('valKarma').innerText = meus.length * 10;
    document.getElementById('karmaDisplay').style.display = 'block';
}

async function sair() { await supabaseClient.auth.signOut(); window.location.reload(); }
function fecharModalAuth() { document.getElementById('modalAuth').style.display = 'none'; }
function fecharModalPost() { document.getElementById('modalPost').style.display = 'none'; }
function fecharModalConvite() { document.getElementById('modalConvite').style.display = 'none'; }
function fecharChat() { document.getElementById('modalChat').style.display = 'none'; }
function abrirModalAuth() { document.getElementById('modalAuth').style.display = 'flex'; }
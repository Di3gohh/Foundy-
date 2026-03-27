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
    // 1. Tenta pegar o usuário logado
    const { data: { user } } = await supabaseClient.auth.getUser();
    currentUser = user;
    
    // 2. Carrega os dados
    await carregarItens();
    
    // 3. Atualiza a interface (Sino, Botões, Nome)
    atualizarUI();
    
    // 4. Se logado, checa notificações
    if (currentUser) {
        checarMeusPedidos();
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
        initMapaPrincipal(); // ESSENCIAL: Inicia o mapa após carregar os itens
    } catch (err) {
        console.error("Erro ao carregar itens:", err);
    }
}

function renderizarCards() {
    const grid = document.getElementById('itemGrid');
    if (!grid) return;
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

// --- MAPAS (CONSERTADO) ---
function initMapaPrincipal() {
    const mapDiv = document.getElementById('mapaPrincipal');
    if (!mapDiv || mapaPrincipal) return; // Não recria se já existir

    mapaPrincipal = L.map('mapaPrincipal').setView([-23.55, -46.63], 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CARTO'
    }).addTo(mapaPrincipal);

    atualizarMarkersMapa();
}

function atualizarMarkersMapa() {
    if (!mapaPrincipal) return;
    // Limpa markers antigos
    mapaPrincipal.eachLayer(l => { if (l instanceof L.Marker) mapaPrincipal.removeLayer(l); });

    itensFiltrados().forEach(item => {
        L.marker([item.lat, item.lng]).addTo(mapaPrincipal)
         .bindPopup(`<b>${item.titulo}</b><br><button onclick="abrirVerificacao(${item.id})" style="padding:5px; margin-top:5px; cursor:pointer">Ver detalhes</button>`);
    });
}

function minhaLocalizacao() {
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(p => {
            mapaPrincipal.setView([p.coords.latitude, p.coords.longitude], 15);
        }, () => alert("Ative a localização."));
    }
}

// --- AUTENTICAÇÃO (RESTURADO) ---
function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    document.getElementById('authTitle').innerText = isLoginMode ? "Entrar" : "Criar Conta";
    document.getElementById('camposCadastroAdicionais').style.display = isLoginMode ? "none" : "block";
    document.getElementById('btnAuthSubmit').innerText = isLoginMode ? "Entrar" : "Cadastrar";
}

async function handleSignUp() {
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPass').value;
    
    try {
        if (isLoginMode) {
            const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw error;
        } else {
            const { error } = await supabaseClient.auth.signUp({
                email, password,
                options: { data: { full_name: document.getElementById('regNome').value } }
            });
            if (error) throw error;
            alert("Verifique seu e-mail!");
        }
        window.location.reload();
    } catch (err) { alert(err.message); }
}

function atualizarUI() {
    const authArea = document.getElementById('authArea');
    const btnSino = document.getElementById('btnNotificacoes');

    if (currentUser) {
        authArea.innerHTML = `<span>Olá, ${currentUser.user_metadata.full_name?.split(' ')[0] || 'Usuário'}</span> <button onclick="supabaseClient.auth.signOut().then(() => location.reload())" class="btn-outline" style="padding:4px 10px; font-size:10px">Sair</button>`;
        if (btnSino) btnSino.style.display = 'flex';
    }
}

// --- NOTIFICAÇÕES E PEDIDOS ---
async function checarMeusPedidos() {
    const { data } = await supabaseClient
        .from('solicitações_chat')
        .select('id')
        .eq('dono_id', currentUser.id)
        .eq('status', 'pendente');

    const badge = document.getElementById('badgeNotificacao');
    if (data && data.length > 0) {
        badge.innerText = data.length;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
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
            <div>
                <p><strong>${p.requisitante_id?.full_name || 'Alguém'}</strong> respondeu:</p>
                <p class="quote-box">"${p.resposta_seguranca}"</p>
                <button class="btn-save" onclick="aceitarPedido('${p.id}')">Aceitar Resgate</button>
            </div>
        `).join('');
    } else {
        lista.innerHTML = '<p style="text-align:center; color:gray;">Nenhum pedido pendente.</p>';
    }
}

async function aceitarPedido(pedidoId) {
    await supabaseClient.from('solicitações_chat').update({ status: 'aprovado' }).eq('id', pedidoId);
    alert("Chat liberado!");
    location.reload();
}

// --- MODAIS ---
function abrirModalAuth() { document.getElementById('modalAuth').style.display = 'flex'; }
function fecharModalAuth() { document.getElementById('modalAuth').style.display = 'none'; }
function fecharModalConvite() { document.getElementById('modalConvite').style.display = 'none'; }
function fecharModalPost() { document.getElementById('modalPost').style.display = 'none'; }

function abrirModalPost() {
    if (!currentUser) return abrirModalAuth();
    document.getElementById('modalPost').style.display = 'flex';
    setTimeout(() => {
        if (!mapaPost) {
            mapaPost = L.map('mapaPost').setView([-23.55, -46.63], 13);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(mapaPost);
            mapaPost.on('click', e => {
                if (markerPost) mapaPost.removeLayer(markerPost);
                markerPost = L.marker(e.latlng).addTo(mapaPost);
                document.getElementById('latLogItem').value = JSON.stringify(e.latlng);
            });
        }
        mapaPost.invalidateSize();
    }, 300);
}

// --- FUNÇÕES DE AUXÍLIO (RESTURADO) ---
function analisarFoto(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const prev = document.getElementById('preview');
            prev.src = ev.target.result;
            prev.style.display = 'block';
            document.getElementById('uploadPlaceholder').style.display = 'none';
        }
        reader.readAsDataURL(file);
    }
}

function filtrarCategoria(cat) {
    categoriaAtiva = cat;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.innerText.includes(cat));
    });
    renderizarCards();
    atualizarMarkersMapa();
}

function buscarItens() {
    termoBusca = document.getElementById('inputPesquisa').value.toLowerCase();
    renderizarCards();
    atualizarMarkersMapa();
}

function itensFiltrados() {
    return itensCadastrados.filter(i => {
        const matchCat = categoriaAtiva === "Todos" || i.categoria === categoriaAtiva;
        const matchBusca = i.titulo.toLowerCase().includes(termoBusca);
        return matchCat && matchBusca;
    });
}
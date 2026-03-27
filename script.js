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
        initMapaPrincipal();
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

    grid.innerHTML = itens.map(i => {
        // Lógica inteligente do botão: Se for meu, ver mensagens. Se não, reivindicar.
        const textoBotao = (currentUser && i.user_id === currentUser.id) ? 'Ver Mensagens' : 'É meu! (Reivindicar)';
        
        return `
            <div class="card">
                <img src="${i.foto || 'https://via.placeholder.com/400x250?text=Sem+Foto'}" loading="lazy" alt="${i.titulo}">
                <div class="card-content">
                    <small>${i.categoria}</small>
                    <h3>${i.titulo}</h3>
                    <button class="btn-save" onclick="abrirVerificacao(${i.id})">${textoBotao}</button>
                </div>
            </div>
        `;
    }).join('');
}

// --- PESQUISA E FILTROS ---
function buscarItens() {
    termoBusca = document.getElementById('inputPesquisa').value.toLowerCase();
    renderizarCards();
    atualizarMarkersMapa();
}

function filtrarCategoria(cat) {
    categoriaAtiva = cat;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.innerText.includes(cat));
    });
    renderizarCards();
    atualizarMarkersMapa();
}

function itensFiltrados() {
    return itensCadastrados.filter(i => {
        const matchCat = categoriaAtiva === "Todos" || i.categoria === categoriaAtiva;
        const matchBusca = i.titulo.toLowerCase().includes(termoBusca) || i.categoria.toLowerCase().includes(termoBusca);
        return matchCat && matchBusca;
    });
}

// --- AUTENTICAÇÃO (COM VALIDAÇÕES DO ANTIGO) ---
function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    document.getElementById('authTitle').innerText = isLoginMode ? "Entrar na Conta" : "Criar Conta Foundy";
    document.getElementById('camposCadastroAdicionais').style.display = isLoginMode ? "none" : "block";
    document.getElementById('btnAuthSubmit').innerText = isLoginMode ? "Entrar" : "Cadastrar e Confirmar E-mail";
    document.getElementById('toggleAuth').innerText = isLoginMode ? "Não tem conta? Cadastre-se" : "Já tem conta? Entrar";
}

function verificarIdade() {
    const dataNasc = document.getElementById('regDataNasc').value;
    if (!dataNasc) return;
    const hoje = new Date();
    const nascimento = new Date(dataNasc);
    let idade = hoje.getFullYear() - nascimento.getFullYear();
    const m = hoje.getMonth() - nascimento.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < nascimento.getDate())) idade--;
    document.getElementById('authResponsavel').style.display = (idade < 18) ? "block" : "none";
}

async function handleSignUp() {
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPass').value;
    if (!email || !password) return alert("E-mail e senha são obrigatórios.");

    try {
        if (isLoginMode) {
            const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw error;
        } else {
            const fullName = document.getElementById('regNome').value.trim();
            const cpf = document.getElementById('regCpf').value.trim();
            if (!fullName || !cpf) throw new Error("Preencha Nome e CPF.");

            const { error } = await supabaseClient.auth.signUp({
                email, password,
                options: { 
                    data: { 
                        full_name: fullName, 
                        cpf: cpf,
                        phone: document.getElementById('regPhone').value,
                        data_nascimento: document.getElementById('regDataNasc').value
                    } 
                }
            });
            if (error) throw error;
            alert("Sucesso! Verifique seu e-mail.");
        }
        window.location.reload();
    } catch (err) { alert(err.message); }
}

function atualizarUI() {
    const authArea = document.getElementById('authArea');
    const btnSino = document.getElementById('btnNotificacoes');
    if (currentUser && authArea) {
        const nome = currentUser.user_metadata.full_name?.split(' ')[0] || "Usuário";
        authArea.innerHTML = `<span>Olá, <b style="color:var(--primary)">${nome}</b></span> <button onclick="sairConta()" class="btn-outline" style="padding:4px 8px; font-size:10px; margin-left:10px">Sair</button>`;
        if (btnSino) btnSino.style.display = 'flex';
    }
}

async function sairConta() {
    await supabaseClient.auth.signOut();
    window.location.reload();
}

function calcularKarma() {
    const meusItens = itensCadastrados.filter(i => i.user_id === currentUser?.id);
    const valKarma = document.getElementById('valKarma');
    if(valKarma) valKarma.innerText = meusItens.length * 10;
    document.getElementById('karmaDisplay').style.display = 'block';
}

// --- MAPAS ---
function initMapaPrincipal() {
    if (mapaPrincipal) return;
    mapaPrincipal = L.map('mapaPrincipal').setView([-23.55, -46.63], 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(mapaPrincipal);
    atualizarMarkersMapa();
}

function atualizarMarkersMapa() {
    if (!mapaPrincipal) return;
    mapaPrincipal.eachLayer(l => { if (l instanceof L.Marker) mapaPrincipal.removeLayer(l); });
    itensFiltrados().forEach(item => {
        L.marker([item.lat, item.lng]).addTo(mapaPrincipal)
         .bindPopup(`<b>${item.titulo}</b><br><button onclick="abrirVerificacao(${item.id})" style="cursor:pointer; margin-top:5px">Ver Detalhes</button>`);
    });
}

function minhaLocalizacao() {
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(p => {
            mapaPrincipal.setView([p.coords.latitude, p.coords.longitude], 15);
        }, () => alert("Ative a localização."));
    }
}

// --- POSTAGEM E UPLOAD ---
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

async function uploadFoto(file) {
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const { data, error } = await supabaseClient.storage.from('fotos-itens').upload(fileName, file);
    if (error) return null;
    const { data: { publicUrl } } = supabaseClient.storage.from('fotos-itens').getPublicUrl(fileName);
    return publicUrl;
}

async function salvarPost() {
    if (!currentUser) return abrirModalAuth();
    const titulo = document.getElementById('tituloItem').value;
    const localRaw = document.getElementById('latLogItem').value;
    const file = document.getElementById('fotoItem').files[0];

    if (!titulo || !localRaw || !file) return alert("Preencha tudo!");

    try {
        const url = await uploadFoto(file);
        const { error } = await supabaseClient.from('itens').insert([{
            titulo, foto: url, categoria: document.getElementById('categoriaItem').value,
            pergunta: document.getElementById('perguntaSeguranca').value,
            lat: JSON.parse(localRaw).lat, lng: JSON.parse(localRaw).lng,
            user_id: currentUser.id, usuario_nome: currentUser.user_metadata.full_name
        }]);
        if (error) throw error;
        location.reload();
    } catch (err) { alert(err.message); }
}

// --- NOTIFICAÇÕES E CHAT ---
async function checarMeusPedidos() {
    const { data } = await supabaseClient.from('solicitações_chat').select('id').eq('dono_id', currentUser.id).eq('status', 'pendente');
    const badge = document.getElementById('badgeNotificacao');
    if (data?.length > 0) {
        badge.innerText = data.length;
        badge.style.display = 'flex';
    }
}

function abrirVerificacao(id) {
    if (!currentUser) return abrirModalAuth();
    currentItem = itensCadastrados.find(i => i.id === id);
    if (currentItem.user_id === currentUser.id) return abrirChatReal(id);

    document.getElementById('perguntaExibida').innerText = currentItem.pergunta;
    document.getElementById('modalConvite').style.display = 'flex';
}

async function enviarPedidoChat() {
    const resposta = document.getElementById('respostaConvite').value;
    const { error } = await supabaseClient.from('solicitações_chat').insert([{
        item_id: currentItem.id, requisitante_id: currentUser.id,
        dono_id: currentItem.user_id, resposta_seguranca: resposta, status: 'pendente'
    }]);
    if (error) alert(error.message);
    else {
        alert("Resposta enviada! Aguarde o dono aceitar.");
        fecharModalConvite();
    }
}

async function abrirModalPedidos() {
    document.getElementById('modalPedidos').style.display = 'flex';
    const { data } = await supabaseClient.from('solicitações_chat').select('*, requisitante_id(full_name)').eq('dono_id', currentUser.id).eq('status', 'pendente');
    const lista = document.getElementById('listaPedidosPendentes');
    lista.innerHTML = (data?.length > 0) ? data.map(p => `
        <div style="margin-bottom:10px; padding:10px; background:rgba(255,255,255,0.05); border-radius:8px;">
            <p><b>${p.requisitante_id?.full_name || 'Alguém'}</b> respondeu:</p>
            <p>"${p.resposta_seguranca}"</p>
            <button class="btn-save" onclick="aceitarPedido('${p.id}')">Aceitar</button>
        </div>
    `).join('') : '<p>Nada por aqui.</p>';
}

async function aceitarPedido(id) {
    await supabaseClient.from('solicitações_chat').update({ status: 'aprovado' }).eq('id', id);
    alert("Aceito! Chat liberado.");
    location.reload();
}

// --- MODAIS ---
function abrirModalAuth() { document.getElementById('modalAuth').style.display = 'flex'; }
function fecharModalAuth() { document.getElementById('modalAuth').style.display = 'none'; }
function fecharModalConvite() { document.getElementById('modalConvite').style.display = 'none'; }
function fecharModalPost() {
    document.getElementById('modalPost').style.display = 'none';
}

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
    }, 400);
}
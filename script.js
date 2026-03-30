// --- CONFIGURAÇÃO ---
const API_URL = 'http://127.0.0.1:8000/api';
const SUPABASE_URL = 'https://ndlpzprccxjpuxqtzrxl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_94q7-RW5thyf7kBRUHDxBw_0bPPvRkX'; 
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- ESTADO GLOBAL ---
let itensCadastrados = [];
let currentUser = null;
let currentItem = null;
let categoriaAtiva = "Todos";
let termoBusca = "";
let mapaPrincipal = null;
let mapaPost = null;
let markerPost = null;
let isLoginMode = false;

// --- INICIALIZAÇÃO ---
window.addEventListener('DOMContentLoaded', async () => {
    // Tenta recuperar sessão existente
    const { data: { session } } = await supabaseClient.auth.getSession();
    currentUser = session ? session.user : null;
    
    await carregarItens();
    atualizarUI();
    
    if (currentUser) {
        calcularKarma();
        checkNotifications();
        // Polling para notificações a cada 15 segundos
        setInterval(checkNotifications, 15000);
    }
});

// --- SISTEMA DE DADOS (API PYTHON) ---
async function carregarItens() {
    try {
        const response = await fetch(`${API_URL}/itens`);
        if (!response.ok) throw new Error("Erro ao buscar itens da API");
        
        itensCadastrados = await response.json();
        renderizarCards();
        
        // Timeout para garantir que o DOM renderizou a div antes do mapa
        setTimeout(() => {
            initMapaPrincipal();
        }, 300);
        
    } catch (err) {
        console.error("Erro ao carregar itens:", err);
        // Tenta iniciar o mapa vazio para não quebrar a UI
        initMapaPrincipal();
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
        const isOwner = currentUser && i.user_id === currentUser.id;
        const textoBotao = isOwner ? 'Ver Mensagens' : 'É meu! (Reivindicar)';
        
        return `
            <div class="card">
                <div class="card-image-container">
                    <img src="${i.foto || 'https://via.placeholder.com/400x250?text=Sem+Foto'}" loading="lazy" alt="${i.titulo}">
                </div>
                <div class="card-content">
                    <small class="category-tag">${i.categoria}</small>
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
        const text = btn.innerText || btn.textContent;
        btn.classList.toggle('active', text.includes(cat));
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

// --- AUTENTICAÇÃO (SUPABASE) ---
function abrirModalAuth() {
    document.getElementById('modalAuth').style.display = 'flex';
}

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
        const nome = currentUser.user_metadata?.full_name?.split(' ')[0] || "Usuário";
        authArea.innerHTML = `<span>Olá, <b style="color:var(--primary)">${nome}</b></span> <button onclick="sairConta()" class="btn-outline" style="padding:4px 8px; font-size:10px; margin-left:10px">Sair</button>`;
        if (btnSino) btnSino.parentElement.style.display = 'block';
    }
}

async function sairConta() {
    await supabaseClient.auth.signOut();
    window.location.reload();
}

function calcularKarma() {
    if (!currentUser) return;
    const meusItens = itensCadastrados.filter(i => i.user_id === currentUser.id);
    const valKarmaDisplay = document.getElementById('valKarma');
    if(valKarmaDisplay) valKarmaDisplay.innerText = meusItens.length * 10;
    document.getElementById('karmaDisplay').style.display = 'block';
}

// --- MAPAS (LEAFLET) ---
function initMapaPrincipal() {
    if (mapaPrincipal) return;

    const container = document.getElementById('mapaPrincipal');
    if (!container) return;

    mapaPrincipal = L.map('mapaPrincipal').setView([-23.55, -46.63], 13);
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(mapaPrincipal);

    setTimeout(() => {
        mapaPrincipal.invalidateSize();
    }, 500);

    atualizarMarkersMapa();
}

function atualizarMarkersMapa() {
    if (!mapaPrincipal) return;
    
    mapaPrincipal.eachLayer(l => { 
        if (l instanceof L.Marker) mapaPrincipal.removeLayer(l); 
    });
    
    itensFiltrados().forEach(item => {
        L.marker([item.lat, item.lng]).addTo(mapaPrincipal)
         .bindPopup(`<b>${item.titulo}</b><br><button onclick="abrirVerificacao(${item.id})" style="cursor:pointer; margin-top:5px; background:var(--primary); color:white; border:none; border-radius:4px; padding:2px 8px;">Ver Detalhes</button>`);
    });
}

function minhaLocalizacao() {
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(p => {
            const pos = [p.coords.latitude, p.coords.longitude];
            mapaPrincipal.setView(pos, 15);
            L.circle(pos, {radius: 200, color: '#4F46E5'}).addTo(mapaPrincipal);
        }, () => alert("Por favor, ative a localização no navegador."));
    }
}

// --- POSTAGEM ---
function abrirModalPost() {
    if (!currentUser) return abrirModalAuth();
    document.getElementById('modalPost').style.display = 'flex';
    
    setTimeout(() => {
        if (!mapaPost) {
            mapaPost = L.map('mapaPost').setView([-23.55, -46.63], 13);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(mapaPost);
            
            mapaPost.on('click', (e) => {
                if (markerPost) mapaPost.removeLayer(markerPost);
                markerPost = L.marker(e.latlng).addTo(mapaPost);
                document.getElementById('latLogItem').value = JSON.stringify(e.latlng);
            });
        }
        mapaPost.invalidateSize();
    }, 300);
}

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

async function salvarPost() {
    if (!currentUser) return abrirModalAuth();
    
    const titulo = document.getElementById('tituloItem').value;
    const categoria = document.getElementById('categoriaItem').value;
    const pergunta = document.getElementById('perguntaSeguranca').value;
    const localRaw = document.getElementById('latLogItem').value;
    const previewImg = document.getElementById('preview').src;

    if (!titulo || !localRaw || !previewImg || categoria === "Outros" || !pergunta) {
        return alert("Preencha todos os campos, incluindo a pergunta de segurança e o local no mapa!");
    }

    const coords = JSON.parse(localRaw);
    const payload = {
        titulo,
        categoria,
        pergunta,
        foto: previewImg, 
        lat: coords.lat,
        lng: coords.lng,
        user_id: currentUser.id,
        usuario_nome: currentUser.user_metadata.full_name || "Usuário Foundy"
    };

    try {
        const btn = document.getElementById('btnPublish');
        btn.disabled = true;
        btn.innerText = "Publicando...";

        const response = await fetch(`${API_URL}/itens`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || "Erro ao salvar no servidor.");
        }
        
        alert("Item publicado com sucesso!");
        location.reload();
    } catch (err) { 
        alert("Erro: " + err.message); 
        const btn = document.getElementById('btnPublish');
        btn.disabled = false;
        btn.innerText = "Publicar Agora";
    }
}

// --- NOTIFICAÇÕES (API PYTHON) ---
async function checkNotifications() {
    if (!currentUser) return;
    try {
        const res = await fetch(`${API_URL}/notifications/${currentUser.id}`);
        if (!res.ok) return;
        const data = await res.json();
        
        const badge = document.getElementById('badgeNotificacao');
        const dropdown = document.getElementById('notifDropdown');
        
        if (data && data.length > 0) {
            badge.innerText = data.length;
            badge.style.display = 'inline-block';
            
            dropdown.innerHTML = data.map(n => `
                <div class="notif-item" style="padding:10px; border-bottom:1px solid #eee;">
                    <p style="font-size:0.9rem;"><b>${n.sender_name}</b> quer falar sobre um item.</p>
                    <p style="font-size:0.8rem; color:gray; font-style:italic">"${n.message}"</p>
                    <div style="display:flex; gap:5px; margin-top:5px;">
                        <button class="btn-save" style="padding:4px 8px; font-size:11px" onclick="responderNotificacao(${n.id}, 'accepted')">Aceitar</button>
                        <button class="btn-outline" style="padding:4px 8px; font-size:11px" onclick="responderNotificacao(${n.id}, 'rejected')">Recusar</button>
                    </div>
                </div>
            `).join('');
        } else {
            badge.style.display = 'none';
            dropdown.innerHTML = '<p style="padding:10px; color:gray; text-align:center;">Sem notificações</p>';
        }
    } catch (err) {
        console.error("Erro ao checar notificações", err);
    }
}

async function responderNotificacao(id, acao) {
    try {
        await fetch(`${API_URL}/notifications/respond`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ notification_id: id, action: acao })
        });
        checkNotifications();
    } catch (err) {
        alert("Erro ao responder solicitação.");
    }
}

function toggleNotif() {
    const drop = document.getElementById('notifDropdown');
    drop.style.display = (drop.style.display === 'block') ? 'none' : 'block';
}

// --- MODAIS E CONTROLES ---

function abrirVerificacao(id) {
    if (!currentUser) return abrirModalAuth();
    
    currentItem = itensCadastrados.find(i => i.id === id);
    
    if (!currentItem) return;

    if (currentItem.user_id === currentUser.id) {
        alert("Este item foi postado por você. Verifique suas notificações no sininho para responder interessados.");
        return;
    }

    const campoPergunta = document.getElementById('perguntaExibida');
    if (campoPergunta) campoPergunta.innerText = currentItem.pergunta;
    
    document.getElementById('modalConvite').style.display = 'flex';
}

async function enviarPedidoChat() {
    const campoResposta = document.getElementById('respostaSeguranca');
    const respostaTexto = campoResposta?.value.trim();
    
    if (!respostaTexto) {
        alert("Por favor, descreva o item ou responda à pergunta para continuar.");
        return;
    }

    if (!currentItem) {
        alert("Erro: Item não selecionado. Tente novamente.");
        return;
    }

    const payload = {
        item_id: currentItem.id,
        owner_id: currentItem.user_id,
        requester_id: currentUser.id,
        requester_name: currentUser.user_metadata.full_name || "Usuário Interessado",
        answer: respostaTexto
    };

    try {
        const btn = document.querySelector('#modalConvite .btn-save');
        btn.disabled = true;
        btn.innerText = "Enviando...";

        const response = await fetch(`${API_URL}/notifications`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || "Erro ao enviar pedido.");
        }

        alert("Solicitação enviada com sucesso! O dono do item analisará sua resposta.");
        campoResposta.value = "";
        fecharModalConvite();
        
    } catch (err) {
        console.error("Erro na solicitação:", err);
        alert("Falha ao enviar: " + err.message);
    } finally {
        const btn = document.querySelector('#modalConvite .btn-save');
        if (btn) {
            btn.disabled = false;
            btn.innerText = "Enviar Resposta";
        }
    }
}

// Funções de fechamento
function fecharModalAuth() { document.getElementById('modalAuth').style.display = 'none'; }
function fecharModalConvite() { document.getElementById('modalConvite').style.display = 'none'; }
function fecharModalPost() { document.getElementById('modalPost').style.display = 'none'; }
function fecharModal(id) { document.getElementById(id).style.display = 'none'; }
function fecharChat() { document.getElementById('modalChat').style.display = 'none'; }
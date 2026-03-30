// --- CONFIGURAÇÃO ---
const API_URL = 'http://127.0.0.1:8000/api'; // Altere para sua URL de produção quando necessário

// --- ESTADO GLOBAL (Sem Supabase) ---
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
    // Recupera usuário do banco local do navegador
    const userLogado = localStorage.getItem('foundy_user');
    if (userLogado) {
        currentUser = JSON.parse(userLogado);
    }
    
    await carregarItens();
    atualizarUI();
    
    if (currentUser) {
        calcularKarma();
        checkNotifications();
        setInterval(checkNotifications, 15000);
    }
});

// --- SISTEMA DE DADOS (API PYTHON + SQLITE) ---
async function carregarItens() {
    try {
        const response = await fetch(`${API_URL}/itens`);
        if (!response.ok) throw new Error("Erro ao buscar itens");
        
        itensCadastrados = await response.json();
        renderizarCards();
        
        setTimeout(() => { initMapaPrincipal(); }, 300);
    } catch (err) {
        console.error("Erro:", err);
        initMapaPrincipal();
    }
}

function renderizarCards() {
    const grid = document.getElementById('itemGrid');
    if (!grid) return;
    const itens = itensFiltrados();
    
    if (itens.length === 0) {
        grid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: gray; padding: 40px;">Nenhum item encontrado.</p>`;
        return;
    }

    grid.innerHTML = itens.map(i => {
        const isOwner = currentUser && i.user_id === currentUser.id;
        const textoBotao = isOwner ? 'Ver Detalhes' : 'É meu! (Reivindicar)';
        
        return `
            <div class="card">
                <div class="card-image-container">
                    <img src="${i.foto || 'https://via.placeholder.com/400x250'}" alt="${i.titulo}">
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

// --- AUTENTICAÇÃO E VERIFICAÇÃO POR E-MAIL ---
async function handleSignUp() {
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPass').value;
    const btn = document.getElementById('btnAuthSubmit');

    if (!email || !password) return alert("Preencha e-mail e senha.");

    try {
        if (isLoginMode) {
            // LOGIN NO SQLITE
            btn.innerText = "Entrando...";
            const res = await fetch(`${API_URL}/usuarios/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, senha: password })
            });

            if (!res.ok) throw new Error("E-mail ou senha incorretos.");
            
            const userData = await res.json();
            localStorage.setItem('foundy_user', JSON.stringify({
                id: userData.id,
                user_metadata: { full_name: userData.nome }
            }));
            window.location.reload();

        } else {
            // CADASTRO COM CÓDIGO DE VERIFICAÇÃO
            const nome = document.getElementById('regNome').value.trim();
            const cpf = document.getElementById('regCpf').value.trim();
            const phone = document.getElementById('regPhone').value;
            const dataNasc = document.getElementById('regDataNasc').value;

            if (!nome || !cpf) throw new Error("Nome e CPF são obrigatórios.");

            btn.disabled = true;
            btn.innerText = "Enviando código...";

            // 1. Gerar Código
            const codigoVerificacao = Math.floor(100000 + Math.random() * 900000).toString();

            // 2. Enviar via EmailJS (Substitua pelos seus IDs)
            await emailjs.send("service_id", "template_id", {
                to_name: nome,
                to_email: email,
                codigo: codigoVerificacao
            });

            // 3. Validar Código
            const inputCodigo = prompt(`Enviamos um código para ${email}. Digite-o abaixo:`);

            if (inputCodigo === codigoVerificacao) {
                // 4. Salvar no SQLite
                const res = await fetch(`${API_URL}/usuarios/registrar`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        nome, email, senha: password, cpf, telefone: phone, data_nascimento: dataNasc
                    })
                });

                if (!res.ok) throw new Error("Erro ao salvar usuário.");

                alert("Conta verificada com sucesso! Agora faça login.");
                toggleAuthMode();
            } else {
                alert("Código incorreto. Tente novamente.");
            }
        }
    } catch (err) {
        alert(err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = isLoginMode ? "Entrar" : "Confirmar";
    }
}

// --- UTILITÁRIOS DE UI ---
function atualizarUI() {
    const authArea = document.getElementById('authArea');
    if (currentUser && authArea) {
        const nome = currentUser.user_metadata.full_name.split(' ')[0];
        authArea.innerHTML = `<span>Olá, <b>${nome}</b></span> <button onclick="sairConta()" class="btn-outline" style="padding:4px; font-size:10px">Sair</button>`;
        document.getElementById('karmaDisplay').style.display = 'block';
    }
}

async function sairConta() {
    localStorage.removeItem('foundy_user');
    window.location.reload();
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
        const matchBusca = i.titulo.toLowerCase().includes(termoBusca);
        return matchCat && matchBusca;
    });
}

// --- MAPAS (LEAFLET) ---
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
         .bindPopup(`<b>${item.titulo}</b><br><button onclick="abrirVerificacao(${item.id})">Ver</button>`);
    });
}

// --- POSTAGEM ---
async function salvarPost() {
    if (!currentUser) return abrirModalAuth();
    
    const titulo = document.getElementById('tituloItem').value;
    const localRaw = document.getElementById('latLogItem').value;
    const previewImg = document.getElementById('preview').src;

    if (!titulo || !localRaw || !previewImg) return alert("Preencha todos os campos e o local!");

    const coords = JSON.parse(localRaw);
    const payload = {
        titulo, 
        categoria: document.getElementById('categoriaItem').value,
        pergunta: document.getElementById('perguntaSeguranca').value,
        foto: previewImg,
        lat: coords.lat, 
        lng: coords.lng,
        user_id: currentUser.id,
        usuario_nome: currentUser.user_metadata.full_name
    };

    try {
        const res = await fetch(`${API_URL}/itens`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) { alert("Postado!"); location.reload(); }
    } catch (err) { alert("Erro ao postar."); }
}

// Funções de Modal (Permanecem as mesmas para abrir/fechar)
function abrirModalAuth() { document.getElementById('modalAuth').style.display = 'flex'; }
function fecharModalAuth() { document.getElementById('modalAuth').style.display = 'none'; }
function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    document.getElementById('authTitle').innerText = isLoginMode ? "Entrar" : "Criar Conta";
    document.getElementById('camposCadastroAdicionais').style.display = isLoginMode ? "none" : "block";
}
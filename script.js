const API_URL = 'http://127.0.0.1:8000/api';
let currentUser = null;
let itensCadastrados = [];
let isLoginMode = false;

// Variáveis para os Mapas
let mapPrincipal, mapPost, markerPost;

window.addEventListener('DOMContentLoaded', async () => {
    const userLogado = localStorage.getItem('foundy_user');
    if (userLogado) {
        currentUser = JSON.parse(userLogado);
        atualizarInterfaceUsuario();
    }
    
    await carregarItens();
    inicializarMapas();
});

// --- CONFIGURAÇÃO DOS MAPAS (Leaflet) ---
function inicializarMapas() {
    // Mapa da página principal
    mapPrincipal = L.map('mapaPrincipal').setView([-23.5505, -46.6333], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(mapPrincipal);

    // Mapa dentro do modal de postagem
    mapPost = L.map('mapaPost').setView([-23.5505, -46.6333], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapPost);

    // Marcador arrastável para o usuário indicar o local exato
    markerPost = L.marker([-23.5505, -46.6333], { draggable: true }).addTo(mapPost);
    
    markerPost.on('dragend', function(e) {
        const posicionamento = markerPost.getLatLng();
        document.getElementById('latLogItem').value = `${posicionamento.lat},${posicionamento.lng}`;
    });
}

// --- CAPTURA DE GPS DO NAVEGADOR ---
function minhaLocalizacao() {
    if (!navigator.geolocation) {
        return alert("Seu navegador não suporta geolocalização.");
    }

    navigator.geolocation.getCurrentPosition((position) => {
        const { latitude, longitude } = position.coords;
        
        // Centraliza os mapas na posição do usuário
        mapPrincipal.setView([latitude, longitude], 16);
        mapPost.setView([latitude, longitude], 16);
        markerPost.setLatLng([latitude, longitude]);
        
        // Salva no input oculto para enviar ao banco
        document.getElementById('latLogItem').value = `${latitude},${longitude}`;
        
        console.log("Localização capturada: ", latitude, longitude);
    }, () => {
        alert("Não foi possível obter sua localização. Verifique as permissões.");
    });
}

// --- CONVERSÃO DE IMAGEM PARA BASE64 ---
function analisarFoto(event) {
    const arquivo = event.target.files[0];
    const preview = document.getElementById('preview');
    const placeholder = document.getElementById('uploadPlaceholder');

    if (arquivo) {
        const reader = new FileReader();

        reader.onload = function(e) {
            // O e.target.result contém a string Base64 da imagem
            preview.src = e.target.result;
            preview.style.display = "block";
            placeholder.style.display = "none";
        };

        reader.readAsDataURL(arquivo);
    }
}

// --- FUNÇÃO PARA PUBLICAR ITEM ---
async function salvarPost() {
    if (!currentUser) return alert("Faça login para publicar.");

    const titulo = document.getElementById('tituloItem').value;
    const categoria = document.getElementById('categoriaItem').value;
    const coords = document.getElementById('latLogItem').value.split(',');
    const pergunta = document.getElementById('perguntaSeguranca').value;
    const fotoBase64 = document.getElementById('preview').src;

    if (!titulo || !fotoBase64 || coords.length < 2) {
        return alert("Preencha o título, tire uma foto e marque o local no mapa!");
    }

    const payload = {
        titulo: titulo,
        categoria: categoria,
        lat: parseFloat(coords[0]),
        lng: parseFloat(coords[1]),
        pergunta: pergunta,
        foto: fotoBase64,
        user_id: currentUser.id,
        usuario_nome: currentUser.user_metadata.full_name
    };

    try {
        const res = await fetch(`${API_URL}/itens`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            alert("Item publicado com sucesso!");
            location.reload();
        }
    } catch (err) {
        alert("Erro ao conectar com o servidor.");
    }
}

// --- FLUXO DE LOGIN / CADASTRO ---
function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    const title = document.getElementById('authTitle');
    const camposExtras = document.getElementById('camposCadastroAdicionais');
    const btn = document.getElementById('btnAuthSubmit');
    const toggleLink = document.getElementById('toggleAuth');

    if (isLoginMode) {
        title.innerText = "Entrar no Foundy";
        camposExtras.style.display = "none";
        btn.innerText = "Entrar";
        toggleLink.innerText = "Não tem conta? Cadastre-se";
    } else {
        title.innerText = "Criar Conta Foundy";
        camposExtras.style.display = "block";
        btn.innerText = "Confirmar Cadastro";
        toggleLink.innerText = "Já tem conta? Entrar";
    }
}

async function handleSignUp() {
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPass').value;
    const btn = document.getElementById('btnAuthSubmit');

    if (!email || !password) return alert("Preencha os campos.");

    try {
        if (isLoginMode) {
            // Lógica de Login
            btn.innerText = "Autenticando...";
            const res = await fetch(`${API_URL}/usuarios/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email, senha: password })
            });

            if (!res.ok) throw new Error("E-mail ou senha incorretos.");
            
            const userData = await res.json();
            localStorage.setItem('foundy_user', JSON.stringify({
                id: userData.id,
                user_metadata: { full_name: userData.nome }
            }));
            window.location.reload();

        } else {
            // Lógica de Cadastro (conforme seu código original com EmailJS)
            const nome = document.getElementById('regNome').value.trim();
            const cpf = document.getElementById('regCpf').value.trim();
            const phone = document.getElementById('regPhone').value;
            const dataNasc = document.getElementById('regDataNasc').value;

            btn.innerText = "Validando...";
            
            // Aqui você manteria sua lógica de EmailJS e código de verificação...
            // Após verificado, envia para /api/usuarios/registrar
            const res = await fetch(`${API_URL}/usuarios/registrar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nome: nome, email: email, cpf: cpf,
                    data_nascimento: dataNasc, senha: password, telefone: phone
                })
            });

            if (res.ok) {
                alert("Cadastro realizado! Agora faça login.");
                toggleAuthMode();
            }
        }
    } catch (err) {
        alert(err.message);
    }
}

// Funções Auxiliares de Modal
function abrirModalAuth() { document.getElementById('modalAuth').style.display = 'flex'; }
function fecharModalAuth() { document.getElementById('modalAuth').style.display = 'none'; }
function abrirModalPost() { 
    document.getElementById('modalPost').style.display = 'flex'; 
    setTimeout(() => mapPost.invalidateSize(), 200); // Recalcula o mapa quando o modal abre
}
function fecharModalPost() { document.getElementById('modalPost').style.display = 'none'; }

async function carregarItens() {
    try {
        const response = await fetch(`${API_URL}/itens`);
        itensCadastrados = await response.json();
        renderizarItens(itensCadastrados);
    } catch (err) { console.error("Erro ao carregar itens:", err); }
}

function renderizarItens(itens) {
    const grid = document.getElementById('itemGrid');
    grid.innerHTML = itens.map(item => `
        <div class="card">
            <div class="card-image-container">
                <img src="${item.foto}" alt="${item.titulo}">
            </div>
            <div class="card-content">
                <h3>${item.titulo}</h3>
                <p>Postado por: ${item.usuario_nome}</p>
                <button class="btn-post" style="width:100%; margin-top:10px">Ver Detalhes</button>
            </div>
        </div>
    `).join('');
}
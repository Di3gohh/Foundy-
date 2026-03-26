// --- CONFIGURAÇÃO SUPABASE ---
const SUPABASE_URL = 'https://ndlpzprccxjpuxqtzrxl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_94q7-RW5thyf7kBRUHDxBw_0bPPvRkX';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- VARIÁVEIS GLOBAIS ---
let itensCadastrados = [];
let currentUser = JSON.parse(localStorage.getItem('foundyUser')) || null;
let meuKarma = parseInt(localStorage.getItem('foundyKarma')) || 0;
let categoriaAtiva = "Todos";
let mapaPrincipal, mapaPost, markerPost;

// --- INICIALIZAÇÃO ---
window.addEventListener('DOMContentLoaded', () => {
    carregarItens();
    atualizarUI();
});

// --- SISTEMA DE DADOS ---
async function carregarItens() {
    const { data, error } = await supabaseClient
        .from('itens')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Erro ao buscar dados:', error);
    } else {
        itensCadastrados = data;
        renderizarCards();
        initMapaPrincipal();
    }
}

async function salvarPost() {
    const titulo = document.getElementById('tituloItem').value;
    const localRaw = document.getElementById('latLogItem').value;
    const categoria = document.getElementById('categoriaItem').value;
    const pergunta = document.getElementById('perguntaSeguranca').value;
    const foto = document.getElementById('preview').src;

    if (!titulo || !localRaw || categoria === "Outros") {
        return alert("Preencha o título, categoria e marque o local no mapa!");
    }

    try {
        const local = JSON.parse(localRaw);
        const novoItem = {
            titulo,
            categoria,
            foto,
            pergunta,
            lat: local.lat,
            lng: local.lng,
            usuario_nome: currentUser ? currentUser.nome : "Anônimo"
        };

        const { error } = await supabaseClient.from('itens').insert([novoItem]);
        if (error) throw error;

        alert("Publicado com sucesso! ✨");
        fecharModalPost();
        carregarItens();
    } catch (err) {
        alert("Erro ao salvar: " + err.message);
    }
}

async function excluirPost(id) {
    if(!confirm("Deseja apagar este item permanentemente?")) return;
    const { error } = await supabaseClient.from('itens').delete().eq('id', id);
    if (error) alert("Erro ao excluir."); else carregarItens();
}

// --- AUTENTICAÇÃO ---
function abrirModalAuth() { document.getElementById('modalAuth').style.display = 'flex'; }
function fecharModalAuth() { document.getElementById('modalAuth').style.display = 'none'; }

function cadastrarOuLogar() {
    const nome = document.getElementById('nomeUser').value;
    const email = document.getElementById('emailUser').value;
    if(!nome || !email.includes('@')) return alert("Dados inválidos!");
    
    currentUser = { nome, email };
    localStorage.setItem('foundyUser', JSON.stringify(currentUser));
    atualizarUI();
    fecharModalAuth();
}

function atualizarUI() {
    const authArea = document.getElementById('authArea');
    if(currentUser && authArea) {
        authArea.innerHTML = `<span style="color:var(--primary); font-weight:bold;">Olá, ${currentUser.nome.split(' ')[0]}</span>`;
    }
    document.getElementById('valKarma').innerText = meuKarma;
}

// --- MAPAS ---
function initMapaPrincipal() {
    if (!mapaPrincipal) {
        mapaPrincipal = L.map('mapaPrincipal').setView([-23.55, -46.63], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapaPrincipal);
    }
    mapaPrincipal.eachLayer(l => { if (l instanceof L.Marker) mapaPrincipal.removeLayer(l); });
    
    itensCadastrados.forEach(item => {
        if(categoriaAtiva === "Todos" || item.categoria === categoriaAtiva) {
            L.marker([item.lat, item.lng]).addTo(mapaPrincipal)
             .bindPopup(`<b>${item.titulo}</b><br><button onclick="abrirVerificacao(${item.id})" style="cursor:pointer; border:none; background:var(--primary); color:white; padding:5px; border-radius:5px; margin-top:5px;">Resgatar</button>`);
        }
    });
}

function minhaLocalizacao() {
    navigator.geolocation.getCurrentPosition(p => {
        const latlng = [p.coords.latitude, p.coords.longitude];
        mapaPrincipal.setView(latlng, 15);
        L.marker(latlng).addTo(mapaPrincipal).bindPopup("Você está aqui!").openPopup();
    });
}

function abrirModalPost() {
    if(!currentUser) return abrirModalAuth();
    document.getElementById('modalPost').style.display = 'flex';
    setTimeout(() => {
        if(!mapaPost) {
            mapaPost = L.map('mapaPost').setView([-23.55, -46.63], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(mapaPost);
            mapaPost.on('click', e => {
                if(markerPost) mapaPost.removeLayer(markerPost);
                markerPost = L.marker(e.latlng).addTo(mapaPost);
                document.getElementById('latLogItem').value = JSON.stringify(e.latlng);
            });
        }
        mapaPost.invalidateSize();
    }, 400);
}

// --- HELPERS ---
function analisarFoto(e) {
    const reader = new FileReader();
    reader.onload = () => {
        const preview = document.getElementById('preview');
        preview.src = reader.result;
        preview.style.display = 'block';
        document.getElementById('uploadPlaceholder').style.display = 'none';
    };
    reader.readAsDataURL(e.target.files[0]);
}

function filtrarCategoria(cat) {
    categoriaAtiva = cat;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.toggle('active', b.innerText.includes(cat)));
    renderizarCards();
    initMapaPrincipal();
}

function renderizarCards() {
    const grid = document.getElementById('itemGrid');
    grid.innerHTML = itensCadastrados
        .filter(i => categoriaAtiva === "Todos" || i.categoria === categoriaAtiva)
        .map(i => `
            <div class="card">
                <img src="${i.foto || 'https://via.placeholder.com/400x250'}">
                <div class="card-content">
                    <small style="color:var(--primary)">${i.categoria}</small>
                    <h3>${i.titulo}</h3>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <button class="btn-save" style="width:auto; padding:8px 15px;" onclick="abrirVerificacao(${i.id})">Resgatar</button>
                        <button onclick="excluirPost(${i.id})" style="background:none; border:none; cursor:pointer; font-size:1.2rem;">🗑️</button>
                    </div>
                </div>
            </div>
        `).join('');
}

function abrirVerificacao(id) {
    const item = itensCadastrados.find(i => i.id === id);
    document.getElementById('perguntaExibida').innerText = item.pergunta || "Como é o item?";
    document.getElementById('modalConvite').style.display = 'flex';
}

function enviarPedidoChat() { alert("Pedido enviado!"); fecharModalConvite(); }
function fecharModalPost() { document.getElementById('modalPost').style.display = 'none'; }
function fecharModalConvite() { document.getElementById('modalConvite').style.display = 'none'; }
function fecharModalAuth() { document.getElementById('modalAuth').style.display = 'none'; }
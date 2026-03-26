// --- CONFIGURAÇÃO SUPABASE ---
const SUPABASE_URL = 'https://ndlpzprccxjpuxqtzrxl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_94q7-RW5thyf7kBRUHDxBw_0bPPvRkX';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- VARIÁVEIS GLOBAIS ---
let itensCadastrados = [];
let currentUser = null;
let currentItem = null; // Item selecionado para chat
let categoriaAtiva = "Todos";
let mapaPrincipal, mapaPost, markerPost;
let isLoginMode = false;

// --- INICIALIZAÇÃO ---
window.addEventListener('DOMContentLoaded', async () => {
    const { data } = await supabaseClient.auth.getUser();
    currentUser = data?.user;
    
    carregarItens();
    atualizarUI();
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
    }
}

async function salvarPost() {
    if(!currentUser) return abrirModalAuth();
    
    const titulo = document.getElementById('tituloItem').value;
    const localRaw = document.getElementById('latLogItem').value;
    const categoria = document.getElementById('categoriaItem').value;
    const pergunta = document.getElementById('perguntaSeguranca').value;
    const foto = document.getElementById('preview').src;

    if (!titulo || !localRaw || categoria === "Outros") return alert("Preencha todos os campos!");

    try {
        const local = JSON.parse(localRaw);
        const { error } = await supabaseClient.from('itens').insert([{
            titulo, categoria, foto, pergunta,
            lat: local.lat, lng: local.lng,
            user_id: currentUser.id,
            usuario_nome: currentUser.user_metadata.full_name || "Usuário"
        }]);

        if (error) throw error;
        alert("Publicado com sucesso! ✨");
        fecharModalPost();
        carregarItens();
    } catch (err) { alert(err.message); }
}

// --- AUTENTICAÇÃO REAL ---
function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    document.getElementById('authTitle').innerText = isLoginMode ? "Entrar" : "Criar Conta Real";
    document.getElementById('regNome').style.display = isLoginMode ? "none" : "block";
    document.getElementById('regPhone').style.display = isLoginMode ? "none" : "block";
    document.getElementById('toggleAuth').innerText = isLoginMode ? "Não tem conta? Cadastrar" : "Já tem conta? Entrar";
}

async function handleSignUp() {
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPass').value;
    
    if (isLoginMode) {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) return alert(error.message);
        window.location.reload();
    } else {
        const fullName = document.getElementById('regNome').value;
        const phone = document.getElementById('regPhone').value;
        const { error } = await supabaseClient.auth.signUp({
            email, password,
            options: { data: { full_name: fullName, phone: phone } }
        });
        if (error) return alert(error.message);
        alert("Verifique seu e-mail para confirmar!");
    }
}

function atualizarUI() {
    const authArea = document.getElementById('authArea');
    if(currentUser) {
        authArea.innerHTML = `<span style="color:var(--primary); font-weight:bold;">Olá, ${currentUser.user_metadata.full_name?.split(' ')[0]}</span>`;
    }
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
             .bindPopup(`<b>${item.titulo}</b><br><button onclick="abrirVerificacao(${item.id})">Resgatar</button>`);
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

// --- CHAT REALTIME ---
let canalChat = null;

async function abrirChatReal(itemId) {
    if (!currentUser) return abrirModalAuth();
    currentItem = itensCadastrados.find(i => i.id === itemId);
    document.getElementById('modalChat').style.display = 'flex';
    document.getElementById('chatPartner').innerText = `Falar com: ${currentItem.usuario_nome}`;
    
    const { data: msgs } = await supabaseClient
        .from('messages')
        .select('*')
        .eq('item_id', itemId);

    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = msgs ? msgs.map(m => `<div><b>${m.sender_id === currentUser.id ? 'Você' : 'Achador'}:</b> ${m.content}</div>`).join('') : '';

    if (canalChat) supabaseClient.removeChannel(canalChat);
    canalChat = supabaseClient.channel(`chat-${itemId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => {
            chatMessages.innerHTML += `<div><b>Novo:</b> ${payload.new.content}</div>`;
        }).subscribe();
}

async function enviarMensagemReal() {
    const input = document.getElementById('msgInput');
    if(!input.value) return;
    
    await supabaseClient.from('messages').insert([{
        content: input.value,
        sender_id: currentUser.id,
        item_id: currentItem.id,
        receiver_id: currentItem.user_id
    }]);
    input.value = '';
}

// --- AUXILIARES MODAIS ---
function abrirModalAuth() { document.getElementById('modalAuth').style.display = 'flex'; }
function fecharModalAuth() { document.getElementById('modalAuth').style.display = 'none'; }
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
    }, 400);
}
function fecharModalPost() { document.getElementById('modalPost').style.display = 'none'; }
function abrirVerificacao(id) {
    currentItem = itensCadastrados.find(i => i.id === id);
    document.getElementById('perguntaExibida').innerText = currentItem.pergunta || "Como é o item?";
    document.getElementById('modalConvite').style.display = 'flex';
}
function fecharModalConvite() { document.getElementById('modalConvite').style.display = 'none'; }
function fecharChat() { document.getElementById('modalChat').style.display = 'none'; }
function enviarPedidoChat() { abrirChatReal(currentItem.id); fecharModalConvite(); }

function filtrarCategoria(cat) {
    categoriaAtiva = cat;
    renderizarCards();
    initMapaPrincipal();
}

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

function renderizarCards() {
    const grid = document.getElementById('itemGrid');
    grid.innerHTML = itensCadastrados
        .filter(i => categoriaAtiva === "Todos" || i.categoria === categoriaAtiva)
        .map(i => `
            <div class="card">
                <img src="${i.foto || 'https://via.placeholder.com/400x250'}">
                <div class="card-content">
                    <small>${i.categoria}</small>
                    <h3>${i.titulo}</h3>
                    <button class="btn-save" onclick="abrirVerificacao(${i.id})">Resgatar</button>
                </div>
            </div>
        `).join('');
}
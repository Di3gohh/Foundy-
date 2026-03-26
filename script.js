// --- CONFIGURAÇÃO SUPABASE ---
const SUPABASE_URL = 'https://ndlpzprccxjpuxqtzrxl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_94q7-RW5thyf7kBRUHDxBw_0bPPvRkX'; 
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- VARIÁVEIS GLOBAIS ---
let itensCadastrados = [];
let currentUser = null;
let currentItem = null;
let categoriaAtiva = "Todos";
let termoBusca = "";
let mapaPrincipal, mapaPost, markerPost;
let isLoginMode = true; // Começa como 'Entrar'
let canalChat = null;
let currentPhone = ""; // Armazena o telefone durante o processo de token

// --- INICIALIZAÇÃO ---
window.addEventListener('DOMContentLoaded', async () => {
    const { data } = await supabaseClient.auth.getUser();
    currentUser = data?.user;
    
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

async function salvarPost() {
    if(!currentUser) return abrirModalAuth();
    
    const titulo = document.getElementById('tituloItem').value;
    const localRaw = document.getElementById('latLogItem').value;
    const categoria = document.getElementById('categoriaItem').value;
    const pergunta = document.getElementById('perguntaSeguranca').value;
    const foto = document.getElementById('preview').src;

    if (!titulo || !localRaw || categoria === "Outros" || !pergunta) {
        return alert("Por favor, preencha todos os campos obrigatórios.");
    }

    try {
        const btn = document.querySelector('#modalPost .btn-save');
        btn.innerText = "Publicando...";
        btn.disabled = true;

        const local = JSON.parse(localRaw);
        const { error } = await supabaseClient.from('itens').insert([{
            titulo, categoria, foto, pergunta,
            lat: local.lat, lng: local.lng,
            user_id: currentUser.id,
            usuario_nome: currentUser.user_metadata.full_name || "Usuário"
        }]);

        if (error) throw error;
        alert("Item publicado com sucesso! Você ganhou +10 de Karma ✨");
        calcularKarma();
        fecharModalPost();
        
        document.getElementById('tituloItem').value = '';
        document.getElementById('perguntaSeguranca').value = '';
        document.getElementById('preview').style.display = 'none';
        document.getElementById('uploadPlaceholder').style.display = 'block';
        
        await carregarItens();
    } catch (err) { 
        alert(err.message); 
    } finally {
        const btn = document.querySelector('#modalPost .btn-save');
        btn.innerText = "Publicar Item & Ganhar Karma ✨";
        btn.disabled = false;
    }
}

// --- PESQUISA E FILTROS ---
function buscarItens() {
    termoBusca = document.getElementById('inputPesquisa').value.toLowerCase();
    renderizarCards();
    initMapaPrincipal();
}

function filtrarCategoria(cat) {
    categoriaAtiva = cat;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
        if(btn.innerText.includes(cat)) btn.classList.add('active');
    });
    renderizarCards();
    initMapaPrincipal();
}

function itensFiltrados() {
    return itensCadastrados.filter(i => {
        const matchCategoria = categoriaAtiva === "Todos" || i.categoria === categoriaAtiva;
        const matchBusca = i.titulo.toLowerCase().includes(termoBusca) || i.categoria.toLowerCase().includes(termoBusca);
        return matchCategoria && matchBusca;
    });
}

// --- AUTENTICAÇÃO POR TOKEN (SMS/OTP) ---

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    document.getElementById('authTitle').innerText = isLoginMode ? "Entrar na Conta" : "Criar Conta Foundy";
    document.getElementById('authName').style.display = isLoginMode ? "none" : "block";
    document.getElementById('toggleAuth').innerText = isLoginMode ? "Novo por aqui? Criar conta" : "Já tem conta? Entrar";
}

async function enviarToken() {
    const phone = document.getElementById('authPhone').value.trim();
    const name = document.getElementById('authName').value.trim();
    const btn = document.getElementById('btnSendToken');

    if (!phone.startsWith('+')) {
        return alert("Use o formato internacional: +55 (DDD) Número. Ex: +5511999999999");
    }

    if (!isLoginMode && !name) {
        return alert("Por favor, digite seu nome para o cadastro.");
    }

    try {
        btn.innerText = "Enviando...";
        btn.disabled = true;
        currentPhone = phone;

        const { error } = await supabaseClient.auth.signInWithOtp({
            phone: phone,
            options: {
                data: { full_name: name } // Armazena o nome se for novo usuário
            }
        });

        if (error) throw error;

        // Troca os formulários dentro do modal
        document.getElementById('stepRequest').style.display = 'none';
        document.getElementById('stepVerify').style.display = 'block';
        
    } catch (err) {
        alert("Erro: " + err.message);
    } finally {
        btn.innerText = "Enviar Código por SMS";
        btn.disabled = false;
    }
}

async function verificarToken() {
    const token = document.getElementById('authToken').value.trim();
    const btn = document.getElementById('btnVerifyToken');

    if (token.length < 6) return alert("Digite o código de 6 dígitos.");

    try {
        btn.innerText = "Verificando...";
        btn.disabled = true;

        const { error } = await supabaseClient.auth.verifyOtp({
            phone: currentPhone,
            token: token,
            type: 'sms'
        });

        if (error) throw error;

        alert("Login realizado com sucesso!");
        window.location.reload();
        
    } catch (err) {
        alert("Token inválido ou expirado.");
    } finally {
        btn.innerText = "Verificar e Entrar";
        btn.disabled = false;
    }
}

function voltarStepAuth() {
    document.getElementById('stepRequest').style.display = 'block';
    document.getElementById('stepVerify').style.display = 'none';
}

function calcularKarma() {
    const meusItens = itensCadastrados.filter(i => i.user_id === currentUser.id);
    const karma = meusItens.length * 10;
    document.getElementById('valKarma').innerText = karma;
    document.getElementById('karmaDisplay').style.display = 'block';
}

function atualizarUI() {
    const authArea = document.getElementById('authArea');
    if(currentUser) {
        const nome = currentUser.user_metadata.full_name || "Usuário";
        authArea.innerHTML = `<span>Olá, <b style="color:var(--primary);">${nome.split(' ')[0]}</b></span> <button onclick="sairConta()" style="background:none; border:none; color:var(--text-muted); cursor:pointer; margin-left:10px;">Sair</button>`;
    }
}

async function sairConta() {
    await supabaseClient.auth.signOut();
    window.location.reload();
}

// --- MAPAS, CHAT E AUXILIARES (Mantidos do código anterior) ---

function initMapaPrincipal() {
    if (!mapaPrincipal) {
        mapaPrincipal = L.map('mapaPrincipal').setView([-23.55, -46.63], 13);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(mapaPrincipal);
    }
    mapaPrincipal.eachLayer(l => { if (l instanceof L.Marker) mapaPrincipal.removeLayer(l); });
    const itens = itensFiltrados();
    itens.forEach(item => {
        L.marker([item.lat, item.lng]).addTo(mapaPrincipal)
         .bindPopup(`<b>${item.titulo}</b><br><button onclick="abrirVerificacao(${item.id})">Reivindicar</button>`);
    });
}

function minhaLocalizacao() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(p => {
            mapaPrincipal.setView([p.coords.latitude, p.coords.longitude], 15);
        });
    }
}

async function abrirChatReal(itemId, mensagemInicial = null) {
    if (!currentUser) return abrirModalAuth();
    currentItem = itensCadastrados.find(i => i.id === itemId);
    document.getElementById('modalChat').style.display = 'flex';
    document.getElementById('chatPartner').innerText = `Negociação: ${currentItem.titulo}`;
    await carregarMensagens(itemId);

    if(mensagemInicial) {
        await supabaseClient.from('messages').insert([{
            content: `🔑 **Resposta de Segurança:** ${mensagemInicial}`,
            sender_id: currentUser.id,
            item_id: currentItem.id,
            receiver_id: currentItem.user_id
        }]);
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
    if(!input.value.trim()) return;
    const texto = input.value;
    input.value = '';
    await supabaseClient.from('messages').insert([{
        content: texto, sender_id: currentUser.id, item_id: currentItem.id, receiver_id: currentItem.user_id
    }]);
}

function abrirModalAuth() { document.getElementById('modalAuth').style.display = 'flex'; }
function fecharModalAuth() { document.getElementById('modalAuth').style.display = 'none'; }

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
        }
    }, 400);
}

function fecharModalPost() { document.getElementById('modalPost').style.display = 'none'; }

function abrirVerificacao(id) {
    if (!currentUser) return abrirModalAuth();
    currentItem = itensCadastrados.find(i => i.id === id);
    document.getElementById('perguntaExibida').innerText = currentItem.pergunta;
    document.getElementById('modalConvite').style.display = 'flex';
}

function fecharModalConvite() { document.getElementById('modalConvite').style.display = 'none'; }
function fecharChat() { document.getElementById('modalChat').style.display = 'none'; }

function enviarPedidoChat() { 
    const resposta = document.getElementById('respostaConvite').value;
    if(!resposta.trim()) return alert("Responda a pergunta.");
    fecharModalConvite();
    abrirChatReal(currentItem.id, resposta); 
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
    const itens = itensFiltrados();
    grid.innerHTML = itens.map(i => `
        <div class="card">
            <img src="${i.foto || ''}">
            <div class="card-content">
                <small>${i.categoria}</small>
                <h3>${i.titulo}</h3>
                <button class="btn-save" onclick="abrirVerificacao(${i.id})">Resgatar</button>
            </div>
        </div>
    `).join('');
}
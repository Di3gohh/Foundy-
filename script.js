// --- CONFIGURAÇÃO SUPABASE ---
const SUPABASE_URL = 'https://ndlpzprccxjpuxqtzrxl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_...'; // Use sua chave real aqui
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let itensCadastrados = [];
let currentUser = null;
let currentItem = null;
let categoriaAtiva = "Todos";
let termoBusca = "";
let mapaPrincipal, mapaPost, markerPost;
let isLoginMode = false; // Começa como cadastro por padrão no seu HTML antigo

window.addEventListener('DOMContentLoaded', async () => {
    // Verificar sessão
    const { data: { user } } = await supabaseClient.auth.getUser();
    currentUser = user;
    
    await carregarItens();
    atualizarUI();
    if(currentUser) calcularKarma();
});

async function carregarItens() {
    const { data, error } = await supabaseClient.from('itens').select('*').order('created_at', { ascending: false });
    if (!error) {
        itensCadastrados = data;
        renderizarCards();
        initMapaPrincipal();
    }
}

function renderizarCards() {
    const grid = document.getElementById('itemGrid');
    const itens = itensFiltrados();
    grid.innerHTML = itens.length ? "" : `<p style="grid-column:1/-1; text-align:center;">Nenhum item encontrado.</p>`;
    
    itens.forEach(item => {
        grid.innerHTML += `
            <div class="card">
                <img src="${item.foto || 'https://via.placeholder.com/300'}" alt="${item.titulo}">
                <div class="card-content">
                    <small>${item.categoria}</small>
                    <h3>${item.titulo}</h3>
                    <button class="btn-save" onclick="abrirVerificacao(${item.id})">Reivindicar</button>
                </div>
            </div>`;
    });
}

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    document.getElementById('authTitle').innerText = isLoginMode ? "Entrar na Conta" : "Criar Conta Foundy";
    document.getElementById('camposCadastroAdicionais').style.display = isLoginMode ? "none" : "block";
    document.getElementById('btnAuthSubmit').innerText = isLoginMode ? "Entrar" : "Cadastrar";
    document.getElementById('toggleAuth').innerText = isLoginMode ? "Não tem conta? Cadastrar" : "Já tem conta? Entrar";
}

async function handleSignUp() {
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPass').value;

    if (isLoginMode) {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) return alert("Erro: " + error.message);
        window.location.reload();
    } else {
        const fullName = document.getElementById('regNome').value;
        const cpf = document.getElementById('regCpf').value;
        if(!fullName || !cpf) return alert("Preencha nome e CPF.");

        const { error } = await supabaseClient.auth.signUp({
            email, password,
            options: { data: { full_name: fullName, cpf: cpf } }
        });
        if (error) return alert(error.message);
        alert("Sucesso! Verifique seu e-mail.");
    }
}

// Funções de Mapa e Modais seguem a lógica que você criou, 
// apenas certifique-se de que os IDs batem com o novo HTML.

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
        // Desativar botão para evitar duplo clique
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
        calcularKarma(); // Atualiza o karma imediatamente
        fecharModalPost();
        
        // Limpar formulário
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
    initMapaPrincipal(); // Re-renderiza o mapa baseado na busca
}

function filtrarCategoria(cat) {
    categoriaAtiva = cat;
    // Atualiza visual dos botões
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

// --- AUTENTICAÇÃO E VALIDAÇÕES ---
function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    document.getElementById('authTitle').innerText = isLoginMode ? "Entrar na Conta" : "Criar Conta Foundy";
    document.getElementById('camposCadastroAdicionais').style.display = isLoginMode ? "none" : "block";
    document.getElementById('regNome').style.display = isLoginMode ? "none" : "block";
    document.getElementById('toggleAuth').innerText = isLoginMode ? "Não tem conta? Cadastrar" : "Já tem conta? Entrar";
}

function verificarIdade() {
    const dataNasc = document.getElementById('regDataNasc').value;
    if(!dataNasc) return;
    
    const hoje = new Date();
    const nascimento = new Date(dataNasc);
    let idade = hoje.getFullYear() - nascimento.getFullYear();
    const m = hoje.getMonth() - nascimento.getMonth();
    if (m < 0 || (m === 0 && hoje.getDate() < nascimento.getDate())) {
        idade--;
    }
    
    const divResp = document.getElementById('authResponsavel');
    if(idade < 18) {
        divResp.style.display = "block";
    } else {
        divResp.style.display = "none";
        document.getElementById('checkResponsavel').checked = false;
    }
}

async function handleSignUp() {
    const email = document.getElementById('regEmail').value;
    const password = document.getElementById('regPass').value;
    
    if (isLoginMode) {
        const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
        if (error) return alert("Erro ao entrar: " + error.message);
        window.location.reload();
    } else {
        const fullName = document.getElementById('regNome').value;
        const phone = document.getElementById('regPhone').value;
        const cpf = document.getElementById('regCpf').value;
        const dataNasc = document.getElementById('regDataNasc').value;
        
        // Validação de Menores
        const divRespVisivel = document.getElementById('authResponsavel').style.display === 'block';
        const checkboxResponsavel = document.getElementById('checkResponsavel').checked;
        if (divRespVisivel && !checkboxResponsavel) {
            return alert("Como você é menor de idade, precisamos da confirmação de que possui autorização do seu responsável.");
        }

        if(!fullName || !email || !password || !cpf) return alert("Preencha os campos obrigatórios.");

        const { error } = await supabaseClient.auth.signUp({
            email, password,
            options: { 
                data: { 
                    full_name: fullName, 
                    phone: phone,
                    cpf: cpf, // Num cenário real, deve ser criptografado ou regido por RLS estrito
                    data_nascimento: dataNasc
                } 
            }
        });
        if (error) return alert(error.message);
        alert("Conta criada! Verifique seu e-mail para confirmar ou faça login.");
        toggleAuthMode();
    }
}

function calcularKarma() {
    // Karma = (Itens postados pelo usuário) * 10
    const meusItens = itensCadastrados.filter(i => i.user_id === currentUser.id);
    const karma = meusItens.length * 10;
    document.getElementById('valKarma').innerText = karma;
    document.getElementById('karmaDisplay').style.display = 'block';
}

function atualizarUI() {
    const authArea = document.getElementById('authArea');
    if(currentUser) {
        const primeiroNome = currentUser.user_metadata.full_name?.split(' ')[0] || "Usuário";
        authArea.innerHTML = `<span style="font-weight:600;">Olá, <span style="color:var(--primary);">${primeiroNome}</span></span> <button onclick="sairConta()" style="background:none; border:none; color:var(--text-muted); cursor:pointer; margin-left:10px; font-size: 0.8rem;">Sair</button>`;
    }
}

async function sairConta() {
    await supabaseClient.auth.signOut();
    window.location.reload();
}

// --- MAPAS ---
function initMapaPrincipal() {
    if (!mapaPrincipal) {
        mapaPrincipal = L.map('mapaPrincipal').setView([-23.55, -46.63], 13);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap &copy; CARTO'
        }).addTo(mapaPrincipal);
    }
    
    // Limpar marcadores antigos
    mapaPrincipal.eachLayer(l => { if (l instanceof L.Marker) mapaPrincipal.removeLayer(l); });
    
    const itens = itensFiltrados();
    itens.forEach(item => {
        L.marker([item.lat, item.lng]).addTo(mapaPrincipal)
         .bindPopup(`
            <div style="text-align:center;">
                <b style="font-family:'Plus Jakarta Sans';">${item.titulo}</b><br>
                <small style="color:gray;">${item.categoria}</small><br>
                <button style="background:#2dd4bf; border:none; padding:5px 10px; border-radius:5px; color:#0b0f1a; font-weight:bold; margin-top:8px; cursor:pointer;" onclick="abrirVerificacao(${item.id})">Reivindicar Item</button>
            </div>
         `);
    });
}

function minhaLocalizacao() {
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(p => {
            const latlng = [p.coords.latitude, p.coords.longitude];
            mapaPrincipal.setView(latlng, 15);
        }, () => alert("Ative a localização no seu navegador."));
    }
}

// --- CHAT E RESGATE ---
async function abrirChatReal(itemId, mensagemInicial = null) {
    if (!currentUser) return abrirModalAuth();
    currentItem = itensCadastrados.find(i => i.id === itemId);
    
    document.getElementById('modalChat').style.display = 'flex';
    document.getElementById('chatPartner').innerText = `Negociação: ${currentItem.titulo}`;
    
    await carregarMensagens(itemId);

    // Se houver mensagem inicial (resposta de segurança), enviar automaticamente
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
    const { data: msgs } = await supabaseClient
        .from('messages')
        .select('*')
        .eq('item_id', itemId)
        .order('created_at', { ascending: true });

    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = '';
    if(msgs) msgs.forEach(m => adicionarMensagemUI(m));
}

function adicionarMensagemUI(m) {
    const chatMessages = document.getElementById('chatMessages');
    const isMine = m.sender_id === currentUser.id;
    const classe = isMine ? 'msg-mine' : 'msg-other';
    
    const div = document.createElement('div');
    div.className = `msg-bubble ${classe}`;
    // Substitui quebras de linha e trata markdown básico para a resposta de segurança
    div.innerHTML = m.content.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>'); 
    
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight; // Rola para o final
}

async function enviarMensagemReal() {
    const input = document.getElementById('msgInput');
    if(!input.value.trim()) return;
    
    const texto = input.value;
    input.value = ''; // Limpa rápido para UX
    
    await supabaseClient.from('messages').insert([{
        content: texto,
        sender_id: currentUser.id,
        item_id: currentItem.id,
        receiver_id: currentItem.user_id
    }]);
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
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(mapaPost);
            
            // Tenta pegar a localização do usuário para o mapa de postagem
            if ("geolocation" in navigator) {
                navigator.geolocation.getCurrentPosition(p => {
                    const latlng = [p.coords.latitude, p.coords.longitude];
                    mapaPost.setView(latlng, 16);
                    setMarkerPost(latlng);
                });
            }

            mapaPost.on('click', e => setMarkerPost(e.latlng));
        } else {
            mapaPost.invalidateSize();
        }
    }, 400);
}

function setMarkerPost(latlng) {
    if(markerPost) mapaPost.removeLayer(markerPost);
    markerPost = L.marker(latlng).addTo(mapaPost);
    document.getElementById('latLogItem').value = JSON.stringify(latlng);
}

function fecharModalPost() { document.getElementById('modalPost').style.display = 'none'; }

function abrirVerificacao(id) {
    if (!currentUser) return abrirModalAuth();
    currentItem = itensCadastrados.find(i => i.id === id);
    
    // Se o usuário clicou no próprio item, abre o chat direto
    if(currentItem.user_id === currentUser.id) {
        return abrirChatReal(id);
    }

    document.getElementById('perguntaExibida').innerText = currentItem.pergunta || "Descreva detalhes específicos sobre este item.";
    document.getElementById('respostaConvite').value = '';
    document.getElementById('modalConvite').style.display = 'flex';
}

function fecharModalConvite() { document.getElementById('modalConvite').style.display = 'none'; }
function fecharChat() { 
    document.getElementById('modalChat').style.display = 'none'; 
    if (canalChat) supabaseClient.removeChannel(canalChat);
}

function enviarPedidoChat() { 
    const resposta = document.getElementById('respostaConvite').value;
    if(!resposta.trim()) return alert("Por favor, responda à pergunta para provar que o item é seu.");
    
    fecharModalConvite();
    abrirChatReal(currentItem.id, resposta); 
}

function analisarFoto(e) {
    const file = e.target.files[0];
    if(!file) return;
    
    const reader = new FileReader();
    reader.onload = () => {
        const preview = document.getElementById('preview');
        preview.src = reader.result;
        preview.style.display = 'block';
        document.getElementById('uploadPlaceholder').style.display = 'none';
    };
    reader.readAsDataURL(file);
}

function renderizarCards() {
    const grid = document.getElementById('itemGrid');
    const itens = itensFiltrados();
    
    if(itens.length === 0) {
        grid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">Nenhum item encontrado nesta categoria.</p>`;
        return;
    }

    grid.innerHTML = itens.map(i => `
        <div class="card">
            <img src="${i.foto || 'https://via.placeholder.com/400x250?text=Sem+Foto'}" loading="lazy" alt="Foto de ${i.titulo}">
            <div class="card-content">
                <small>${i.categoria}</small>
                <h3>${i.titulo}</h3>
                <button class="btn-save" onclick="abrirVerificacao(${i.id})">É meu! (Reivindicar)</button>
            </div>
        </div>
    `).join('');
}
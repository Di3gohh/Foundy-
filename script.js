// --- CONFIGURAÇÃO SUPABASE ---
const SUPABASE_URL = 'https://ndlpzprccxjpuxqtzrxl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_94q7-RW5thyf7kBRUHDxBw_0bPPvRkX'; 

// Inicialização correta do cliente
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
    // Busca o usuário logado na sessão
    const { data: { user } } = await supabaseClient.auth.getUser();
    currentUser = user;
    
    await carregarItens();
    atualizarUI();
    if (currentUser) calcularKarma();
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
    const itens = itensFiltrados();
    
    if (itens.length === 0) {
        grid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;">Nenhum item encontrado nesta busca.</p>`;
        return;
    }

    grid.innerHTML = itens.map(i => `
        <div class="card">
            <img src="${i.foto || 'https://via.placeholder.com/400x250?text=Sem+Foto'}" loading="lazy" alt="${i.titulo}">
            <div class="card-content">
                <small>${i.categoria}</small>
                <h3>${i.titulo}</h3>
                <button class="btn-save" onclick="abrirVerificacao(${i.id})">É meu! (Reivindicar)</button>
            </div>
        </div>
    `).join('');
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
        if (btn.innerText.includes(cat)) btn.classList.add('active');
    });
    renderizarCards();
    initMapaPrincipal();
}

function itensFiltrados() {
    return itensCadastrados.filter(i => {
        const matchCat = categoriaAtiva === "Todos" || i.categoria === categoriaAtiva;
        const matchBusca = i.titulo.toLowerCase().includes(termoBusca) || i.categoria.toLowerCase().includes(termoBusca);
        return matchCat && matchBusca;
    });
}

// --- AUTENTICAÇÃO E VALIDAÇÕES ---
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
    
    const divResp = document.getElementById('authResponsavel');
    divResp.style.display = (idade < 18) ? "block" : "none";
}

async function handleSignUp() {
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPass').value;
    
    if (!email || !password) return alert("E-mail e senha são obrigatórios.");

    const btn = document.getElementById('btnAuthSubmit');
    const originalText = btn.innerText;

    try {
        btn.innerText = "Processando...";
        btn.disabled = true;

        if (isLoginMode) {
            const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
            if (error) throw error;
            window.location.reload();
        } else {
            const fullName = document.getElementById('regNome').value.trim();
            const cpf = document.getElementById('regCpf').value.trim();
            const phone = document.getElementById('regPhone').value.trim();
            const dataNasc = document.getElementById('regDataNasc').value;
            
            if (!fullName || !cpf) throw new Error("Preencha Nome e CPF.");

            const respVisivel = document.getElementById('authResponsavel').style.display === 'block';
            if (respVisivel && !document.getElementById('checkResponsavel').checked) {
                throw new Error("Menores de idade precisam confirmar a autorização do responsável.");
            }

            const { error } = await supabaseClient.auth.signUp({
                email, password,
                options: { 
                    data: { 
                        full_name: fullName, 
                        cpf: cpf, 
                        phone: phone, 
                        data_nascimento: dataNasc 
                    } 
                }
            });
            if (error) throw error;
            
            alert("Sucesso! Verifique seu e-mail para confirmar a conta.");
            fecharModalAuth();
        }
    } catch (err) {
        alert("Erro: " + err.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

function atualizarUI() {
    const authArea = document.getElementById('authArea');
    if (currentUser && authArea) {
        const primeiroNome = currentUser.user_metadata.full_name?.split(' ')[0] || "Usuário";
        authArea.innerHTML = `
            <span style="font-weight:600;">Olá, <span style="color:var(--primary);">${primeiroNome}</span></span> 
            <button class="btn-outline" onclick="sairConta()" style="padding: 5px 10px; font-size: 0.8rem; margin-left: 10px; border-radius: 6px; border: 1px solid var(--border); background: transparent; color: white; cursor: pointer;">Sair</button>
        `;
    }
}

function calcularKarma() {
    const meusItens = itensCadastrados.filter(i => i.user_id === currentUser.id);
    const karma = meusItens.length * 10;
    const valKarma = document.getElementById('valKarma');
    const karmaDisplay = document.getElementById('karmaDisplay');
    
    if(valKarma) valKarma.innerText = karma;
    if(karmaDisplay) karmaDisplay.style.display = 'block';
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
            attribution: '&copy; CARTO'
        }).addTo(mapaPrincipal);
    }
    
    mapaPrincipal.eachLayer(l => { if (l instanceof L.Marker) mapaPrincipal.removeLayer(l); });
    
    itensFiltrados().forEach(item => {
        L.marker([item.lat, item.lng]).addTo(mapaPrincipal)
         .bindPopup(`
            <div style="text-align:center; font-family: sans-serif;">
                <b style="font-size: 1.1rem; color: #0b0f1a;">${item.titulo}</b><br>
                <small style="color:gray;">${item.categoria}</small><br>
                <button class="btn-save" style="margin-top:10px; width: 100%; padding: 5px;" onclick="abrirVerificacao(${item.id})">Reivindicar</button>
            </div>
         `);
    });
}

function minhaLocalizacao() {
    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(p => {
            mapaPrincipal.setView([p.coords.latitude, p.coords.longitude], 15);
        }, () => alert("Ative a permissão de localização no navegador."));
    }
}

// --- POSTAGEM DE ITEM ---
function analisarFoto(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        const preview = document.getElementById('preview');
        preview.src = reader.result;
        preview.style.display = 'block';
        document.getElementById('uploadPlaceholder').style.display = 'none';
    };
    reader.readAsDataURL(file);
}

// --- FUNÇÃO DE UPLOAD PARA O STORAGE ---
async function uploadFoto(file) {
    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `${fileName}`;

        const { data, error } = await supabaseClient.storage
            .from('fotos-itens')
            .upload(filePath, file);

        if (error) throw error;

        const { data: { publicUrl } } = supabaseClient.storage
            .from('fotos-itens')
            .getPublicUrl(filePath);

        return publicUrl;
    } catch (err) {
        console.error("Erro no upload:", err);
        return null;
    }
}

async function salvarPost() {
    if (!currentUser) return abrirModalAuth();
    
    const titulo = document.getElementById('tituloItem').value.trim();
    const localRaw = document.getElementById('latLogItem').value;
    const categoria = document.getElementById('categoriaItem').value;
    const pergunta = document.getElementById('perguntaSeguranca').value.trim();
    const fotoInput = document.getElementById('fotoItem'); 
    const file = fotoInput.files[0];

    if (!titulo || !localRaw || categoria === "Outros" || !pergunta || !file) {
        return alert("Preencha todos os campos e selecione uma foto.");
    }

    const btn = document.getElementById('btnPublish') || document.querySelector('.btn-save');
    const originalText = btn.innerText;

    try {
        btn.innerText = "Enviando imagem...";
        btn.disabled = true;

        const urlDaFoto = await uploadFoto(file);
        if (!urlDaFoto) throw new Error("Falha ao processar imagem.");

        btn.innerText = "Publicando item...";

        const { error } = await supabaseClient.from('itens').insert([{
            titulo, 
            categoria, 
            foto: urlDaFoto,
            pergunta,
            lat: JSON.parse(localRaw).lat, 
            lng: JSON.parse(localRaw).lng,
            user_id: currentUser.id,
            usuario_nome: currentUser.user_metadata.full_name || "Usuário"
        }]);

        if (error) throw error;
        
        alert("Item publicado com sucesso! ✨");
        fecharModalPost();
        await carregarItens();
        calcularKarma();

    } catch (err) { 
        alert("Erro: " + err.message); 
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

// --- CHAT E REIVINDICAÇÃO ---
function abrirVerificacao(id) {
    if (!currentUser) return abrirModalAuth();
    currentItem = itensCadastrados.find(i => i.id === id);
    
    if (currentItem.user_id === currentUser.id) return abrirChatReal(id);

    document.getElementById('perguntaExibida').innerText = currentItem.pergunta;
    document.getElementById('respostaConvite').value = '';
    document.getElementById('modalConvite').style.display = 'flex';
}

function enviarPedidoChat() { 
    const resposta = document.getElementById('respostaConvite').value.trim();
    if (!resposta) return alert("Por favor, responda à pergunta.");
    
    fecharModalConvite();
    abrirChatReal(currentItem.id, resposta); 
}

async function abrirChatReal(itemId, mensagemInicial = null) {
    document.getElementById('modalChat').style.display = 'flex';
    document.getElementById('chatPartner').innerText = currentItem.titulo;
    
    await carregarMensagens(itemId);

    if (mensagemInicial) {
        await supabaseClient.from('messages').insert([{
            content: `🔑 Resposta de Segurança: ${mensagemInicial}`,
            sender_id: currentUser.id,
            item_id: currentItem.id,
            receiver_id: currentItem.user_id
        }]);
    }

    if (canalChat) supabaseClient.removeChannel(canalChat);
    canalChat = supabaseClient.channel(`chat-${itemId}`)
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'messages', 
            filter: `item_id=eq.${itemId}` 
        }, payload => {
            adicionarMensagemUI(payload.new);
        }).subscribe();
}

async function carregarMensagens(itemId) {
    const { data: msgs } = await supabaseClient
        .from('messages')
        .select('*')
        .eq('item_id', itemId)
        .order('created_at', { ascending: true });
        
    const chatContainer = document.getElementById('chatMessages');
    if(chatContainer) {
        chatContainer.innerHTML = '';
        if (msgs) msgs.forEach(m => adicionarMensagemUI(m));
    }
}

function adicionarMensagemUI(m) {
    const chatBox = document.getElementById('chatMessages');
    if(!chatBox) return;

    const isMine = m.sender_id === currentUser.id;
    const msgDiv = document.createElement('div');
    
    msgDiv.style.alignSelf = isMine ? 'flex-end' : 'flex-start';
    msgDiv.style.background = isMine ? 'var(--primary)' : 'rgba(255,255,255,0.1)';
    msgDiv.style.color = isMine ? '#0b0f1a' : 'white';
    msgDiv.style.padding = '8px 12px';
    msgDiv.style.borderRadius = '12px';
    msgDiv.style.maxWidth = '80%';
    msgDiv.style.marginBottom = '8px';
    msgDiv.innerText = m.content;
    
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

async function enviarMensagemReal() {
    const input = document.getElementById('msgInput');
    const texto = input.value.trim();
    if (!texto) return;
    
    input.value = ''; 
    await supabaseClient.from('messages').insert([{
        content: texto,
        sender_id: currentUser.id,
        item_id: currentItem.id,
        receiver_id: currentItem.user_id
    }]);
}

// --- FUNÇÕES DE MODAIS ---
function abrirModalAuth() { document.getElementById('modalAuth').style.display = 'flex'; }
function fecharModalAuth() { document.getElementById('modalAuth').style.display = 'none'; }
function fecharModalConvite() { document.getElementById('modalConvite').style.display = 'none'; }
function fecharChat() { 
    document.getElementById('modalChat').style.display = 'none'; 
    if (canalChat) supabaseClient.removeChannel(canalChat);
}

function abrirModalPost() { 
    if (!currentUser) return abrirModalAuth();
    document.getElementById('modalPost').style.display = 'flex';
    
    setTimeout(() => {
        if (!mapaPost) {
            mapaPost = L.map('mapaPost').setView([-23.55, -46.63], 13);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png').addTo(mapaPost);
            mapaPost.on('click', e => setMarkerPost(e.latlng));
        } else {
            mapaPost.invalidateSize();
        }
    }, 250);
}

function setMarkerPost(latlng) {
    if (markerPost) mapaPost.removeLayer(markerPost);
    markerPost = L.marker(latlng).addTo(mapaPost);
    document.getElementById('latLogItem').value = JSON.stringify(latlng);
}

function fecharModalPost() { document.getElementById('modalPost').style.display = 'none'; }
async function enviarPedidoChat() { 
    const resposta = document.getElementById('respostaConvite').value.trim();
    if (!resposta) return alert("Por favor, responda à pergunta.");
    
    try {
        // 1. Salva a "ficha" de solicitação no banco
        const { error } = await supabaseClient.from('solicitações_chat').insert([{
            item_id: currentItem.id,
            requisitante_id: currentUser.id,
            dono_id: currentItem.user_id,
            resposta_seguranca: resposta,
            status: 'pendente' // Começa esperando o dono aceitar
        }]);

        if (error) throw error;

        // 2. Toca a campainha (Envia o e-mail pelo EmailJS)
        emailjs.send("service_id", "template_id", {
            item_title: currentItem.titulo,
            user_name: currentUser.user_metadata.full_name,
            answer: resposta,
            owner_email: currentItem.owner_email // O dono precisa ter e-mail na tabela itens
        });

        alert("Pedido enviado! Aguarde o dono aceitar para liberar o chat.");
        fecharModalConvite();
    } catch (err) {
        alert("Erro: " + err.message);
    }
}
async function checarMeusPedidos() {
    const { data, error } = await supabaseClient
        .from('solicitações_chat')
        .select('*, requisitante_id(full_name)') // Pega o nome de quem quer o item
        .eq('dono_id', currentUser.id)
        .eq('status', 'pendente');

    if (data && data.length > 0) {
        // Mostra pro dono: "Fulano respondeu: X. [Aceitar] [Recusar]"
        console.log("Você tem novos pedidos!", data);
    }
}
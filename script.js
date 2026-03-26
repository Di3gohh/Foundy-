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

// --- VARIÁVEIS GLOBAIS ---
// ... (mantenha as outras)
let currentEmail = ""; // Mudamos de currentPhone para currentEmail

// --- AUTENTICAÇÃO POR TOKEN (E-MAIL / OTP) ---

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    document.getElementById('authTitle').innerText = isLoginMode ? "Entrar na Conta" : "Criar Conta Foundy";
    // Mostra o campo de nome apenas se for cadastro
    document.getElementById('authName').style.display = isLoginMode ? "none" : "block";
    document.getElementById('toggleAuth').innerText = isLoginMode ? "Novo por aqui? Criar conta" : "Já tem conta? Entrar";
}

async function enviarToken() {
    const email = document.getElementById('authEmail').value.trim(); // Mudamos o ID do input
    const name = document.getElementById('authName').value.trim();
    const btn = document.getElementById('btnSendToken');

    if (!email.includes('@')) {
        return alert("Por favor, insira um e-mail válido.");
    }

    if (!isLoginMode && !name) {
        return alert("Por favor, digite seu nome para o cadastro.");
    }

    try {
        btn.innerText = "Enviando e-mail...";
        btn.disabled = true;
        currentEmail = email;

        // O Supabase enviará um código para o E-MAIL
        const { error } = await supabaseClient.auth.signInWithOtp({
            email: email,
            options: {
                // Se for um novo usuário, salva o nome no metadata
                data: { full_name: name },
                // Garante que o usuário não precise clicar num link, mas sim digitar o código
                shouldCreateUser: true 
            }
        });

        if (error) throw error;

        // Troca os formulários dentro do modal para o campo de código
        document.getElementById('stepRequest').style.display = 'none';
        document.getElementById('stepVerify').style.display = 'block';
        alert("Código enviado! Verifique sua caixa de entrada (e o spam).");
        
    } catch (err) {
        alert("Erro: " + err.message);
    } finally {
        btn.innerText = "Receber Código por E-mail";
        btn.disabled = false;
    }
}

async function verificarToken() {
    const token = document.getElementById('authToken').value.trim();
    const btn = document.getElementById('btnVerifyToken');

    if (token.length < 6) return alert("Digite o código de 6 dígitos enviado ao seu e-mail.");

    try {
        btn.innerText = "Verificando...";
        btn.disabled = true;

        const { data, error } = await supabaseClient.auth.verifyOtp({
            email: currentEmail,
            token: token,
            type: 'email' // Mudamos de 'sms' para 'email'
        });

        if (error) throw error;

        alert("Login realizado com sucesso!");
        window.location.reload();
        
    } catch (err) {
        alert("Código inválido ou expirado. Verifique o e-mail novamente.");
    } finally {
        btn.innerText = "Verificar e Entrar";
        btn.disabled = false;
    }
}

// --- CHAT E RESGATE (VERSÃO OTIMIZADA) ---

async function abrirChatReal(itemId, respostaSeguranca = null) {
    if (!currentUser) return abrirModalAuth();
    
    currentItem = itensCadastrados.find(i => i.id === itemId);
    if (!currentItem) return;

    // Exibe o modal e limpa o campo de input
    document.getElementById('modalChat').style.display = 'flex';
    document.getElementById('chatPartner').innerText = `Negociação: ${currentItem.titulo}`;
    document.getElementById('msgInput').value = '';
    
    // 1. Carregar histórico existente
    await carregarMensagens(itemId);

    // 2. Se o usuário acabou de responder a pergunta de segurança, envia como a primeira mensagem
    if (respostaSeguranca) {
        const msgTexto = `🔑 **RESPOSTA DE SEGURANÇA:** ${respostaSeguranca}`;
        await enviarMensagemAoBanco(itemId, msgTexto);
    }

    // 3. Configurar o canal de Tempo Real (Realtime)
    if (canalChat) supabaseClient.removeChannel(canalChat);
    
    canalChat = supabaseClient.channel(`chat-${itemId}`)
        .on('postgres_changes', { 
            event: 'INSERT', 
            schema: 'public', 
            table: 'messages', 
            filter: `item_id=eq.${itemId}` 
        }, payload => {
            // Só adiciona na tela se a mensagem for nova e pertencer a este chat
            adicionarMensagemUI(payload.new);
        })
        .subscribe();
}

async function carregarMensagens(itemId) {
    const { data: msgs, error } = await supabaseClient
        .from('messages')
        .select('*')
        .eq('item_id', itemId)
        .order('created_at', { ascending: true });

    if (error) {
        console.error("Erro ao carregar chat:", error);
        return;
    }

    const chatMessages = document.getElementById('chatMessages');
    chatMessages.innerHTML = ''; // Limpa a tela antes de carregar o histórico
    
    if (msgs) {
        msgs.forEach(m => adicionarMensagemUI(m));
    }
}

async function enviarMensagemReal() {
    const input = document.getElementById('msgInput');
    const texto = input.value.trim();
    
    if (!texto || !currentItem) return;

    input.value = ''; // Limpa o campo imediatamente para melhor UX
    await enviarMensagemAoBanco(currentItem.id, texto);
}

// Função auxiliar para inserir no banco
async function enviarMensagemAoBanco(itemId, texto) {
    const { error } = await supabaseClient.from('messages').insert([{
        content: texto,
        sender_id: currentUser.id,
        item_id: itemId,
        receiver_id: currentItem.user_id // O dono do item
    }]);

    if (error) {
        console.error("Erro ao enviar mensagem:", error);
        alert("Não foi possível enviar a mensagem.");
    }
}

function adicionarMensagemUI(m) {
    const chatMessages = document.getElementById('chatMessages');
    
    // Evita duplicados (checa se a mensagem já está na tela pelo ID do banco)
    if (document.getElementById(`msg-${m.id}`)) return;

    const isMine = m.sender_id === currentUser.id;
    const div = document.createElement('div');
    div.id = `msg-${m.id}`; // Define ID para evitar duplicatas
    div.className = `msg-bubble ${isMine ? 'msg-mine' : 'msg-other'}`;
    
    // Formata o texto (suporta o negrito da resposta de segurança)
    div.innerHTML = m.content.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>'); 
    
    chatMessages.appendChild(div);
    
    // Rola para o final da conversa
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function fecharChat() { 
    document.getElementById('modalChat').style.display = 'none'; 
    if (canalChat) {
        supabaseClient.removeChannel(canalChat);
        canalChat = null;
    }
}
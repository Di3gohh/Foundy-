let mapaPrincipal, mapaPost, markerPost;
let itensCadastrados = JSON.parse(localStorage.getItem('itensFoundy')) || [];
let categoriaAtiva = "Todos";
let currentUser = JSON.parse(localStorage.getItem('foundyUser')) || null;
let meuKarma = parseInt(localStorage.getItem('foundyKarma')) || 0;

window.addEventListener('DOMContentLoaded', () => {
    initMapaPrincipal();
    renderizarCards();
    atualizarUI();
});

// --- AUTENTICAÇÃO ---
function abrirModalAuth() { document.getElementById('modalAuth').style.display = 'flex'; }
function fecharModalAuth() { document.getElementById('modalAuth').style.display = 'none'; }

function cadastrarOuLogar() {
    const nome = document.getElementById('nomeUser').value;
    const email = document.getElementById('emailUser').value;
    if(!nome || !email) return alert("Preencha os campos!");
    currentUser = { nome, email };
    localStorage.setItem('foundyUser', JSON.stringify(currentUser));
    atualizarUI();
    fecharModalAuth();
}

function atualizarUI() {
    if(currentUser) {
        document.getElementById('authArea').innerHTML = `Olá, <b>${currentUser.nome.split(' ')[0]}</b>`;
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
            L.marker([item.localizacao.lat, item.localizacao.lng]).addTo(mapaPrincipal)
             .bindPopup(`<b>${item.titulo}</b><br><button onclick="abrirVerificacao(${item.id})">Resgatar</button>`);
        }
    });
}

function minhaLocalizacao() {
    navigator.geolocation.getCurrentPosition(p => {
        const latlng = [p.coords.latitude, p.coords.longitude];
        mapaPrincipal.setView(latlng, 15);
        L.circle(latlng, { radius: 200, color: '#2dd4bf' }).addTo(mapaPrincipal);
    });
}

// --- POSTAGEM ---
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

function analisarFoto(e) {
    const reader = new FileReader();
    reader.onload = () => {
        document.getElementById('preview').src = reader.result;
        document.getElementById('preview').style.display = 'block';
        document.getElementById('uploadPlaceholder').style.display = 'none';
        document.getElementById('focoInteligente').innerHTML = '<span class="tag-ai">Objeto Identificado</span>';
    };
    reader.readAsDataURL(e.target.files[0]);
}

function salvarPost() {
    const titulo = document.getElementById('tituloItem').value;
    const local = document.getElementById('latLogItem').value;
    if(!titulo || !local) return alert("Preencha tudo!");

    const novo = {
        id: Date.now(),
        titulo,
        categoria: document.getElementById('categoriaItem').value,
        localizacao: JSON.parse(local),
        pergunta: document.getElementById('perguntaSeguranca').value,
        foto: document.getElementById('preview').src
    };

    itensCadastrados.unshift(novo);
    localStorage.setItem('itensFoundy', JSON.stringify(itensCadastrados));
    meuKarma += 10;
    localStorage.setItem('foundyKarma', meuKarma);
    location.reload();
}

// --- CONVITE E CHAT ---
let itemAlvo = null;
function abrirVerificacao(id) {
    itemAlvo = itensCadastrados.find(i => i.id === id);
    document.getElementById('perguntaExibida').innerText = itemAlvo.pergunta || "Como é o item?";
    document.getElementById('modalConvite').style.display = 'flex';
}

function enviarPedidoChat() {
    alert("Convite enviado! O achador aceitou (Simulação).");
    fecharModalConvite();
    abrirChat();
}

function abrirChat() {
    document.getElementById('modalChat').style.display = 'flex';
    document.getElementById('chatMessages').innerHTML = '<div class="msg other">Olá! Vi sua resposta. Vamos combinar?</div>';
}

function enviarMensagem() {
    const val = document.getElementById('msgInput').value;
    if(!val) return;
    document.getElementById('chatMessages').innerHTML += `<div class="msg self">${val}</div>`;
    document.getElementById('msgInput').value = "";
}

// --- HELPERS ---
function fecharModalPost() { document.getElementById('modalPost').style.display = 'none'; }
function fecharModalConvite() { document.getElementById('modalConvite').style.display = 'none'; }
function fecharChat() { document.getElementById('modalChat').style.display = 'none'; }

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
                <img src="${i.foto || 'https://via.placeholder.com/300'}">
                <div class="card-content">
                    <small style="color:var(--primary)">${i.categoria}</small>
                    <h3>${i.titulo}</h3>
                    <button class="btn-save" style="margin-top:10px" onclick="abrirVerificacao(${i.id})">Resgatar</button>
                </div>
            </div>
        `).join('');
}
const API_URL = 'http://127.0.0.1:8000/api';
let currentUser = null;
let itensCadastrados = [];

window.addEventListener('DOMContentLoaded', async () => {
    const userLogado = localStorage.getItem('foundy_user');
    if (userLogado) {
        currentUser = JSON.parse(userLogado);
    }
    await carregarItens();
});

async function carregarItens() {
    try {
        const response = await fetch(`${API_URL}/itens`);
        if (!response.ok) throw new Error("Erro ao carregar");
        itensCadastrados = await response.json();
    } catch (err) {
        console.error(err);
    }
}

// --- FLUXO DE CADASTRO COM CÓDIGO ---
async function handleSignUp() {
    const email = document.getElementById('regEmail').value.trim();
    const password = document.getElementById('regPass').value;
    const btn = document.getElementById('btnAuthSubmit');

    if (!email || !password) return alert("Preencha e-mail e senha.");

    try {
        if (isLoginMode) {
            // LOGIN
            btn.innerText = "Entrando...";
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
            // CADASTRO
            const nome = document.getElementById('regNome').value.trim();
            const cpf = document.getElementById('regCpf').value.trim();
            const phone = document.getElementById('regPhone').value;
            const dataNasc = document.getElementById('regDataNasc').value; // YYYY-MM-DD

            if (!nome || !cpf || !dataNasc || !phone) {
                throw new Error("Por favor, preencha todos os campos obrigatórios.");
            }

            btn.disabled = true;
            btn.innerText = "Enviando código...";

            // 1. Gera código de verificação
            const codigoVerificacao = Math.floor(100000 + Math.random() * 900000).toString();

            // 2. Dispara e-mail (Substitua pelos seus IDs do EmailJS)
            await emailjs.send("SEU_SERVICE_ID", "SEU_TEMPLATE_ID", {
                to_name: nome,
                to_email: email,
                codigo: codigoVerificacao
            });

            // 3. Validação do código digitado
            const inputCodigo = prompt(`Enviamos um código para ${email}. Digite-o aqui:`);

            if (inputCodigo === codigoVerificacao) {
                // 4. Envia para o banco SQLite via Python
                const res = await fetch(`${API_URL}/usuarios/registrar`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        nome: nome,
                        email: email,
                        cpf: cpf,
                        data_nascimento: dataNasc,
                        senha: password,
                        telefone: phone
                    })
                });

                if (!res.ok) throw new Error("Erro ao criar conta no servidor.");

                alert("Conta verificada e salva com sucesso!");
                toggleAuthMode();
            } else {
                alert("Código inválido. Tente novamente.");
            }
        }
    } catch (err) {
        alert(err.message);
    } finally {
        btn.disabled = false;
        btn.innerText = isLoginMode ? "Entrar" : "Confirmar";
    }
}
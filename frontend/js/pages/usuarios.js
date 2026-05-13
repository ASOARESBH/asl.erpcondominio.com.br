/**
 * Controlador da página de Usuários
 * v3.1 — Suporte a sessao_inativa (nunca expira)
 */

const state = {
    apiBase: '/api/',
    dom: {},
    usuarioEditando: null
};

export function init() {
    console.log('[Usuarios] Inicializando...');
    bindDOM();
    bindEvents();
    carregarUsuarios();
}

export function destroy() {
    console.log('[Usuarios] Destruindo...');
}

function bindDOM() {
    state.dom = {
        alertContainer:  document.getElementById('alertContainer'),
        formUsuario:     document.getElementById('formUsuario'),
        btnLimpar:       document.getElementById('btnLimpar'),
        loading:         document.getElementById('loading'),
        tabelaUsuarios:  document.getElementById('tabelaUsuarios'),
        formTitle:       document.getElementById('formTitle'),
        btnSalvarTexto:  document.getElementById('btnSalvarTexto'),
        // Form fields
        usuarioId:       document.getElementById('usuarioId'),
        nome:            document.getElementById('nome'),
        email:           document.getElementById('email'),
        senha:           document.getElementById('senha'),
        funcao:          document.getElementById('funcao'),
        departamento:    document.getElementById('departamento'),
        permissao:       document.getElementById('permissao'),
        sessao_inativa:  document.getElementById('sessao_inativa')
    };
}

function bindEvents() {
    if (state.dom.formUsuario) {
        state.dom.formUsuario.addEventListener('submit', salvarUsuario);
    }
    if (state.dom.btnLimpar) {
        state.dom.btnLimpar.addEventListener('click', limparFormulario);
    }
    if (state.dom.tabelaUsuarios) {
        state.dom.tabelaUsuarios.addEventListener('click', (e) => {
            const btnEdit   = e.target.closest('.btn-edit');
            const btnDelete = e.target.closest('.btn-delete');
            if (btnEdit)   editarUsuario(btnEdit.dataset.id);
            else if (btnDelete) excluirUsuario(btnDelete.dataset.id, btnDelete.dataset.nome);
        });
    }
}

function mostrarAlerta(mensagem, tipo = 'success') {
    if (!state.dom.alertContainer) return;
    const color       = tipo === 'error' ? '#fee2e2' : '#dcfce7';
    const textColor   = tipo === 'error' ? '#b91c1c' : '#166534';
    const borderColor = tipo === 'error' ? '#f87171' : '#22c55e';
    const icon        = tipo === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle';
    state.dom.alertContainer.innerHTML = `
        <div style="background:${color};color:${textColor};border:1px solid ${borderColor};padding:1rem;border-radius:8px;margin-bottom:1.5rem;font-weight:500;display:flex;align-items:center;gap:0.75rem;">
            <i class="fas ${icon}"></i> ${mensagem}
        </div>`;
    setTimeout(() => { if (state.dom.alertContainer) state.dom.alertContainer.innerHTML = ''; }, 5000);
}

function carregarUsuarios() {
    if (state.dom.loading) state.dom.loading.style.display = 'block';
    fetch(`${state.apiBase}api_usuarios.php`)
        .then(r => r.json())
        .then(data => {
            if (state.dom.loading) state.dom.loading.style.display = 'none';
            if (data.sucesso) renderizarTabela(data.dados);
            else mostrarAlerta('Erro ao carregar usuários: ' + data.mensagem, 'error');
        })
        .catch(err => {
            if (state.dom.loading) state.dom.loading.style.display = 'none';
            console.error('[Usuarios] Erro ao carregar:', err);
            mostrarAlerta('Erro ao carregar usuários', 'error');
        });
}

function renderizarTabela(usuarios) {
    if (!state.dom.tabelaUsuarios) return;
    if (!usuarios || usuarios.length === 0) {
        state.dom.tabelaUsuarios.innerHTML = '<tr><td colspan="9" style="text-align:center;">Nenhum usuário cadastrado</td></tr>';
        return;
    }
    state.dom.tabelaUsuarios.innerHTML = usuarios.map(u => {
        const inativa    = u.sessao_inativa == 1;
        const badgeSessao = inativa
            ? `<span title="Sessão Inativa: nunca expira" style="
                display:inline-flex;align-items:center;gap:4px;
                background:linear-gradient(135deg,#16a34a,#15803d);
                color:#fff;padding:3px 10px;border-radius:20px;
                font-size:0.75rem;font-weight:600;white-space:nowrap;">
                <i class="fas fa-infinity"></i> Inativa</span>`
            : `<span title="Sessão normal: expira em 60 min" style="
                display:inline-flex;align-items:center;gap:4px;
                background:linear-gradient(135deg,#64748b,#475569);
                color:#fff;padding:3px 10px;border-radius:20px;
                font-size:0.75rem;font-weight:600;white-space:nowrap;">
                <i class="fas fa-clock"></i> 60 min</span>`;
        return `
        <tr>
            <td>${u.id}</td>
            <td>${u.nome}</td>
            <td>${u.email}</td>
            <td>${u.funcao}</td>
            <td>${u.departamento || '-'}</td>
            <td><span class="badge badge-${getBadgePermissao(u.permissao)}">${getTextoPermissao(u.permissao)}</span></td>
            <td><span class="badge badge-${u.ativo == 1 ? 'success' : 'danger'}">${u.ativo == 1 ? 'Ativo' : 'Inativo'}</span></td>
            <td style="text-align:center;">${badgeSessao}</td>
            <td>
                <button class="btn-edit" data-id="${u.id}" style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:0.4rem 0.8rem;font-size:0.9rem;color:white;border:none;border-radius:4px;cursor:pointer;margin-right:4px;">
                    <i class="fas fa-edit"></i> Editar
                </button>
                ${u.id != 1 ? `<button class="btn-delete" data-id="${u.id}" data-nome="${u.nome}" style="background:linear-gradient(135deg,#ef4444,#dc2626);padding:0.4rem 0.8rem;font-size:0.9rem;color:white;border:none;border-radius:4px;cursor:pointer;">
                    <i class="fas fa-trash"></i> Excluir
                </button>` : ''}
            </td>
        </tr>`;
    }).join('');
}

function getBadgePermissao(permissao) {
    return { admin: 'danger', gerente: 'warning', operador: 'primary', visualizador: 'success' }[permissao] || 'primary';
}

function getTextoPermissao(permissao) {
    return { admin: 'Administrador', gerente: 'Gerente', operador: 'Operador', visualizador: 'Visualizador' }[permissao] || permissao;
}

function salvarUsuario(e) {
    e.preventDefault();
    const dados = {
        nome:          state.dom.nome.value,
        email:         state.dom.email.value,
        senha:         state.dom.senha.value,
        funcao:        state.dom.funcao.value,
        departamento:  state.dom.departamento.value,
        permissao:     state.dom.permissao.value,
        sessao_inativa: state.dom.sessao_inativa && state.dom.sessao_inativa.checked ? 1 : 0,
        ativo: 1
    };
    const metodo = state.usuarioEditando ? 'PUT' : 'POST';
    if (state.usuarioEditando) {
        dados.id = state.usuarioEditando;
        if (dados.senha === '********') delete dados.senha;
    }
    fetch(`${state.apiBase}api_usuarios.php`, {
        method:  metodo,
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(dados)
    })
        .then(r => r.json())
        .then(data => {
            if (data.sucesso) {
                mostrarAlerta(data.mensagem, 'success');
                limparFormulario();
                carregarUsuarios();
            } else {
                mostrarAlerta(data.mensagem, 'error');
            }
        })
        .catch(err => {
            console.error('[Usuarios] Erro ao salvar:', err);
            mostrarAlerta('Erro ao salvar usuário', 'error');
        });
}

function editarUsuario(id) {
    fetch(`${state.apiBase}api_usuarios.php?id=${id}`)
        .then(r => r.json())
        .then(data => {
            if (data.sucesso) {
                const u = data.dados;
                state.dom.usuarioId.value    = u.id;
                state.dom.nome.value         = u.nome;
                state.dom.email.value        = u.email;
                state.dom.senha.value        = '********';
                state.dom.funcao.value       = u.funcao;
                state.dom.departamento.value = u.departamento || '';
                state.dom.permissao.value    = u.permissao;
                if (state.dom.sessao_inativa) {
                    state.dom.sessao_inativa.checked = u.sessao_inativa == 1;
                }
                state.usuarioEditando = id;
                if (state.dom.formTitle)      state.dom.formTitle.textContent     = 'Editar Usuário';
                if (state.dom.btnSalvarTexto) state.dom.btnSalvarTexto.textContent = 'Atualizar Usuário';
                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                mostrarAlerta('Erro ao carregar usuário', 'error');
            }
        });
}

function excluirUsuario(id, nome) {
    if (!confirm(`Deseja realmente excluir o usuário "${nome}"?`)) return;
    fetch(`${state.apiBase}api_usuarios.php`, {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ id })
    })
        .then(r => r.json())
        .then(data => {
            if (data.sucesso) { mostrarAlerta(data.mensagem, 'success'); carregarUsuarios(); }
            else mostrarAlerta(data.mensagem, 'error');
        })
        .catch(err => {
            console.error('[Usuarios] Erro ao excluir:', err);
            mostrarAlerta('Erro ao excluir usuário', 'error');
        });
}

function limparFormulario() {
    if (state.dom.formUsuario)    state.dom.formUsuario.reset();
    if (state.dom.usuarioId)      state.dom.usuarioId.value = '';
    if (state.dom.sessao_inativa) state.dom.sessao_inativa.checked = false;
    state.usuarioEditando = null;
    if (state.dom.formTitle)      state.dom.formTitle.textContent     = 'Novo Usuário';
    if (state.dom.btnSalvarTexto) state.dom.btnSalvarTexto.textContent = 'Salvar Usuário';
}

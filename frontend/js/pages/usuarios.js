/**
 * Controlador da página de Usuários
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
    // Limpeza de estado e callbacks globais, se aplicável
}

function bindDOM() {
    state.dom = {
        alertContainer: document.getElementById('alertContainer'),
        formUsuario: document.getElementById('formUsuario'),
        btnLimpar: document.getElementById('btnLimpar'),

        loading: document.getElementById('loading'),
        tabelaUsuarios: document.getElementById('tabelaUsuarios'),

        formTitle: document.getElementById('formTitle'),
        btnSalvarTexto: document.getElementById('btnSalvarTexto'),

        // Form fields
        usuarioId: document.getElementById('usuarioId'),
        nome: document.getElementById('nome'),
        email: document.getElementById('email'),
        senha: document.getElementById('senha'),
        funcao: document.getElementById('funcao'),
        departamento: document.getElementById('departamento'),
        permissao: document.getElementById('permissao')
    };
}

function bindEvents() {
    if (state.dom.formUsuario) {
        state.dom.formUsuario.addEventListener('submit', salvarUsuario);
    }

    if (state.dom.btnLimpar) {
        state.dom.btnLimpar.addEventListener('click', limparFormulario);
    }

    // Usar event delegation para botões dinâmicos na tabela
    if (state.dom.tabelaUsuarios) {
        state.dom.tabelaUsuarios.addEventListener('click', (e) => {
            const btnEdit = e.target.closest('.btn-edit');
            const btnDelete = e.target.closest('.btn-delete');

            if (btnEdit) {
                const id = btnEdit.dataset.id;
                editarUsuario(id);
            } else if (btnDelete) {
                const id = btnDelete.dataset.id;
                const nome = btnDelete.dataset.nome;
                excluirUsuario(id, nome);
            }
        });
    }
}

function mostrarAlerta(mensagem, tipo = 'success') {
    if (!state.dom.alertContainer) return;

    let color = tipo === 'error' ? '#fee2e2' : '#dcfce7';
    let textColor = tipo === 'error' ? '#b91c1c' : '#166534';
    let borderColor = tipo === 'error' ? '#f87171' : '#22c55e';
    let icon = tipo === 'error' ? 'fa-exclamation-circle' : 'fa-check-circle';

    state.dom.alertContainer.innerHTML = `
        <div style="background: ${color}; color: ${textColor}; border: 1px solid ${borderColor}; padding: 1rem; border-radius: 8px; margin-bottom: 1.5rem; font-weight: 500; display: flex; align-items: center; gap: 0.75rem;">
            <i class="fas ${icon}"></i> ${mensagem}
        </div>`;

    setTimeout(() => {
        if (state.dom.alertContainer) state.dom.alertContainer.innerHTML = '';
    }, 5000);
}

function carregarUsuarios() {
    if (state.dom.loading) state.dom.loading.style.display = 'block';

    fetch(`${state.apiBase}api_usuarios.php`)
        .then(r => r.json())
        .then(data => {
            if (state.dom.loading) state.dom.loading.style.display = 'none';
            if (data.sucesso) {
                renderizarTabela(data.dados);
            } else {
                mostrarAlerta('Erro ao carregar usuários: ' + data.mensagem, 'error');
            }
        })
        .catch(err => {
            if (state.dom.loading) state.dom.loading.style.display = 'none';
            console.error('[Usuarios] Erro ao carregar usuários:', err);
            mostrarAlerta('Erro ao carregar usuários', 'error');
        });
}

function renderizarTabela(usuarios) {
    if (!state.dom.tabelaUsuarios) return;

    if (!usuarios || usuarios.length === 0) {
        state.dom.tabelaUsuarios.innerHTML = '<tr><td colspan="8" style="text-align: center;">Nenhum usuário cadastrado</td></tr>';
        return;
    }

    state.dom.tabelaUsuarios.innerHTML = usuarios.map(u => `
        <tr>
            <td>${u.id}</td>
            <td>${u.nome}</td>
            <td>${u.email}</td>
            <td>${u.funcao}</td>
            <td>${u.departamento || '-'}</td>
            <td><span class="badge badge-${getBadgePermissao(u.permissao)}">${getTextoPermissao(u.permissao)}</span></td>
            <td><span class="badge badge-${u.ativo == 1 ? 'success' : 'danger'}">${u.ativo == 1 ? 'Ativo' : 'Inativo'}</span></td>
            <td>
                <button class="btn-edit" data-id="${u.id}" style="background: linear-gradient(135deg, #f59e0b, #d97706); padding: 0.4rem 0.8rem; font-size: 0.9rem; color: white; border: none; border-radius: 4px; cursor: pointer; margin-right: 4px;"><i class="fas fa-edit"></i> Editar</button>
                ${u.id != 1 ? `<button class="btn-delete" data-id="${u.id}" data-nome="${u.nome}" style="background: linear-gradient(135deg, #ef4444, #dc2626); padding: 0.4rem 0.8rem; font-size: 0.9rem; color: white; border: none; border-radius: 4px; cursor: pointer;"><i class="fas fa-trash"></i> Excluir</button>` : ''}
            </td>
        </tr>
    `).join('');
}

function getBadgePermissao(permissao) {
    const badges = {
        'admin': 'danger',
        'gerente': 'warning',
        'operador': 'primary',
        'visualizador': 'success'
    };
    return badges[permissao] || 'primary';
}

function getTextoPermissao(permissao) {
    const textos = {
        'admin': 'Administrador',
        'gerente': 'Gerente',
        'operador': 'Operador',
        'visualizador': 'Visualizador'
    };
    return textos[permissao] || permissao;
}

function salvarUsuario(e) {
    e.preventDefault();

    const dados = {
        nome: state.dom.nome.value,
        email: state.dom.email.value,
        senha: state.dom.senha.value,
        funcao: state.dom.funcao.value,
        departamento: state.dom.departamento.value,
        permissao: state.dom.permissao.value,
        ativo: 1
    };

    const metodo = state.usuarioEditando ? 'PUT' : 'POST';
    if (state.usuarioEditando) {
        dados.id = state.usuarioEditando;
        if (dados.senha === '********') {
            delete dados.senha;
        }
    }

    fetch(`${state.apiBase}api_usuarios.php`, {
        method: metodo,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados)
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
                state.dom.usuarioId.value = u.id;
                state.dom.nome.value = u.nome;
                state.dom.email.value = u.email;
                state.dom.senha.value = '********';
                state.dom.funcao.value = u.funcao;
                state.dom.departamento.value = u.departamento || '';
                state.dom.permissao.value = u.permissao;

                state.usuarioEditando = id;
                if (state.dom.formTitle) state.dom.formTitle.textContent = 'Editar Usuário';
                if (state.dom.btnSalvarTexto) state.dom.btnSalvarTexto.textContent = 'Atualizar Usuário';

                window.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                mostrarAlerta('Erro ao carregar usuário', 'error');
            }
        });
}

function excluirUsuario(id, nome) {
    if (!confirm(`Deseja realmente excluir o usuário "${nome}"?`)) {
        return;
    }

    fetch(`${state.apiBase}api_usuarios.php`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id })
    })
        .then(r => r.json())
        .then(data => {
            if (data.sucesso) {
                mostrarAlerta(data.mensagem, 'success');
                carregarUsuarios();
            } else {
                mostrarAlerta(data.mensagem, 'error');
            }
        })
        .catch(err => {
            console.error('[Usuarios] Erro ao excluir:', err);
            mostrarAlerta('Erro ao excluir usuário', 'error');
        });
}

function limparFormulario() {
    if (state.dom.formUsuario) state.dom.formUsuario.reset();
    if (state.dom.usuarioId) state.dom.usuarioId.value = '';

    state.usuarioEditando = null;

    if (state.dom.formTitle) state.dom.formTitle.textContent = 'Novo Usuário';
    if (state.dom.btnSalvarTexto) state.dom.btnSalvarTexto.textContent = 'Salvar Usuário';
}

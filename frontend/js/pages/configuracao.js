/**
 * configuracao.js — Módulo de Configurações do Sistema v2.0
 * Padrão: ES6 Module, init/destroy, listeners gerenciados, URLs absolutas, XSS escape
 *
 * APIs utilizadas:
 *   GET/POST/PUT/DELETE /api/api_usuarios.php
 *     → Requer permissão 'admin' (verificarPermissao no backend)
 *     → GET           → lista todos os usuários
 *     → GET ?id=X     → busca usuário específico
 *     → POST          → cria usuário  { nome, email, senha, funcao, departamento, permissao, ativo }
 *     → PUT           → atualiza      { id, nome, email, funcao, departamento, permissao, ativo, senha? }
 *     → DELETE        → exclui        { id }  (body JSON)
 *
 *   GET  /api/api_usuario_logado.php
 *     → Retorna { sucesso, logado, usuario: { id, nome, email, funcao, departamento, permissao },
 *                 sessao: { tempo_decorrido, tempo_restante, tempo_decorrido_formatado,
 *                           tempo_restante_formatado, percentual_usado, ip_address, data_login } }
 *
 *   POST /api/api_usuario_logado.php?acao=renovar
 *     → Renova o timestamp da sessão
 *
 *   POST /api/api_usuario_logado.php?acao=logout
 *     → Encerra a sessão
 *
 * Nota: Alteração de senha do próprio perfil usa PUT /api/api_usuarios.php com o id do usuário logado.
 */
'use strict';

const _API_USR = window.location.origin + '/api/api_usuarios.php';
const _API_LOG = window.location.origin + '/api/api_usuario_logado.php';

let _state = {
    usuarios: [],
    editandoId: null,
    usuarioLogado: null,
    sessao: null,
    isAdmin: false,
};

let _listeners = [];
let _sessaoTimer = null;

// ============================================================
// CICLO DE VIDA
// ============================================================

export function init() {
    console.log('[Configuracao] Inicializando módulo v2.0...');
    _setupTabs();
    _setupFormUsuario();
    _setupFormSenha();
    _setupBtnRenovarSessao();
    _carregarPerfilLogado();
    console.log('[Configuracao] Módulo pronto.');
}

export function destroy() {
    console.log('[Configuracao] Destruindo módulo...');
    _listeners.forEach(({ el, ev, fn }) => el.removeEventListener(ev, fn));
    _listeners = [];
    if (_sessaoTimer) {
        clearInterval(_sessaoTimer);
        _sessaoTimer = null;
    }
    _state = {
        usuarios: [],
        editandoId: null,
        usuarioLogado: null,
        sessao: null,
        isAdmin: false,
    };
    console.log('[Configuracao] Módulo destruído.');
}

// ============================================================
// UTILITÁRIOS
// ============================================================

/**
 * Wrapper de fetch com credentials e tratamento de erro centralizado.
 */
async function _fetch(url, opts = {}) {
    const defaults = { credentials: 'include' };
    const res = await fetch(url, Object.assign({}, defaults, opts));
    if (res.status === 401) {
        console.warn('[Configuracao] Sessão expirada — redirecionando para login.');
        window.location.href = '/login.html';
        throw new Error('Sessão expirada');
    }
    if (res.status === 403) {
        throw new Error('Permissão negada. Apenas administradores podem realizar esta operação.');
    }
    return res.json();
}

/**
 * Escapa HTML para prevenir XSS.
 */
function _esc(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Define o texto de um elemento de forma segura.
 */
function _setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val ?? '';
}

/**
 * Adiciona listener gerenciado (removido no destroy).
 */
function _on(el, ev, fn) {
    if (!el) return;
    el.addEventListener(ev, fn);
    _listeners.push({ el, ev, fn });
}

/**
 * Exibe toast de feedback ao usuário.
 */
function _toast(msg, tipo = 'success') {
    const cores = { success: '#166534', error: '#991b1b', warning: '#92400e', info: '#1e40af' };
    const fundos = { success: '#dcfce7', error: '#fef2f2', warning: '#fffbeb', info: '#dbeafe' };
    const icones = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };

    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed; bottom: 24px; right: 24px; z-index: 9999;
        background: ${fundos[tipo]}; color: ${cores[tipo]};
        border: 1px solid ${cores[tipo]}33; border-radius: 10px;
        padding: 12px 20px; font-size: 0.9rem; font-weight: 500;
        display: flex; align-items: center; gap: 8px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.12);
        animation: slideInRight 0.3s ease;
        max-width: 380px;
    `;
    toast.innerHTML = `<i class="fas ${icones[tipo]}"></i><span>${_esc(msg)}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
}

// ============================================================
// TABS
// ============================================================

function _setupTabs() {
    const botoes = document.querySelectorAll('.tab-btn-cfg');
    botoes.forEach(btn => {
        _on(btn, 'click', () => {
            const tab = btn.dataset.tab;
            botoes.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab-content-cfg').forEach(c => c.classList.remove('active'));
            const el = document.getElementById(`tab-${tab}`);
            if (el) el.classList.add('active');

            // Carrega dados da aba ao abrir
            if (tab === 'usuarios' && _state.isAdmin) {
                _carregarUsuarios();
            }
            if (tab === 'meu-perfil') {
                _carregarPerfilLogado();
            }
        });
    });
}

// ============================================================
// PERFIL DO USUÁRIO LOGADO
// ============================================================

async function _carregarPerfilLogado() {
    try {
        console.log('[Configuracao] Carregando perfil do usuário logado...');
        const data = await _fetch(_API_LOG);

        if (!data.sucesso || !data.logado) {
            console.warn('[Configuracao] Usuário não autenticado.');
            window.location.href = '/login.html';
            return;
        }

        const u = data.usuario;
        const s = data.sessao;

        _state.usuarioLogado = u;
        _state.sessao = s;
        _state.isAdmin = (u.permissao === 'admin');

        // Preencher perfil
        const inicial = (u.nome || 'U').charAt(0).toUpperCase();
        _setText('cfgPerfilAvatar', inicial);
        _setText('cfgPerfilNome', u.nome || '--');
        _setText('cfgPerfilEmail', u.email || '--');
        _setText('cfgPerfilFuncao', u.funcao || '--');
        _setText('cfgPerfilDepartamento', u.departamento || '--');
        _setText('cfgPerfilPermissao', _labelPermissao(u.permissao));

        // Preencher sessão
        _atualizarExibicaoSessao(s);

        // Iniciar timer de atualização da sessão
        if (_sessaoTimer) clearInterval(_sessaoTimer);
        _sessaoTimer = setInterval(_atualizarTimerSessao, 1000);

        // Controle de visibilidade da aba Usuários
        if (_state.isAdmin) {
            _carregarUsuarios();
        } else {
            const aviso = document.getElementById('cfgAvisoPermissao');
            if (aviso) aviso.style.display = 'flex';
            const tabela = document.getElementById('cfgTabelaUsuarios');
            if (tabela) tabela.style.display = 'none';
            const btnNovo = document.getElementById('btnNovoUsuario');
            if (btnNovo) btnNovo.style.display = 'none';
        }

        console.log('[Configuracao] Perfil carregado:', u.nome, '| Admin:', _state.isAdmin);
    } catch (e) {
        console.error('[Configuracao] Erro ao carregar perfil:', e);
        _toast('Erro ao carregar dados do perfil.', 'error');
    }
}

function _labelPermissao(perm) {
    const labels = { admin: 'Administrador', gerente: 'Gerente', operador: 'Operador' };
    return labels[perm] || perm || '--';
}

function _atualizarExibicaoSessao(s) {
    if (!s) return;
    _setText('cfgSessaoDecorrido', s.tempo_decorrido_formatado || '--');
    _setText('cfgSessaoRestante', s.tempo_restante_formatado || '--');
    _setText('cfgSessaoIP', s.ip_address || '--');

    // Formatar data de login
    if (s.data_login) {
        try {
            const d = new Date(s.data_login);
            _setText('cfgSessaoLogin', d.toLocaleString('pt-BR'));
        } catch {
            _setText('cfgSessaoLogin', s.data_login);
        }
    }

    // Barra de progresso
    const bar = document.getElementById('cfgSessaoProgressBar');
    if (bar) {
        const pct = Math.min(100, Math.max(0, s.percentual_usado || 0));
        bar.style.width = pct + '%';
        // Muda cor conforme uso
        if (pct > 80) bar.style.background = 'linear-gradient(90deg, #dc2626, #ef4444)';
        else if (pct > 60) bar.style.background = 'linear-gradient(90deg, #f59e0b, #fbbf24)';
        else bar.style.background = 'linear-gradient(90deg, #4f46e5, #7c3aed)';
    }
}

function _atualizarTimerSessao() {
    if (!_state.sessao) return;
    // Decrementa 1 segundo localmente (sem nova requisição)
    _state.sessao.tempo_decorrido = (_state.sessao.tempo_decorrido || 0) + 1;
    _state.sessao.tempo_restante = Math.max(0, (_state.sessao.tempo_restante || 0) - 1);

    const fmt = (s) => {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    };

    _setText('cfgSessaoDecorrido', fmt(_state.sessao.tempo_decorrido));
    _setText('cfgSessaoRestante', fmt(_state.sessao.tempo_restante));

    const total = 7200;
    const pct = Math.min(100, (_state.sessao.tempo_decorrido / total) * 100);
    _state.sessao.percentual_usado = pct;
    const bar = document.getElementById('cfgSessaoProgressBar');
    if (bar) {
        bar.style.width = pct + '%';
        if (pct > 80) bar.style.background = 'linear-gradient(90deg, #dc2626, #ef4444)';
        else if (pct > 60) bar.style.background = 'linear-gradient(90deg, #f59e0b, #fbbf24)';
        else bar.style.background = 'linear-gradient(90deg, #4f46e5, #7c3aed)';
    }

    // Aviso quando restar menos de 5 minutos
    if (_state.sessao.tempo_restante === 300) {
        _toast('Sua sessão expira em 5 minutos. Clique em "Renovar Sessão" para continuar.', 'warning');
    }
}

function _setupBtnRenovarSessao() {
    const btn = document.getElementById('btnRenovarSessao');
    _on(btn, 'click', async () => {
        try {
            const data = await _fetch(_API_LOG + '?acao=renovar', { method: 'POST' });
            if (data.sucesso) {
                _state.sessao.tempo_decorrido = 0;
                _state.sessao.tempo_restante = 7200;
                _state.sessao.percentual_usado = 0;
                _toast('Sessão renovada com sucesso!', 'success');
            } else {
                _toast(data.mensagem || 'Erro ao renovar sessão.', 'error');
            }
        } catch (e) {
            _toast('Erro ao renovar sessão: ' + e.message, 'error');
        }
    });
}

// ============================================================
// GERENCIAMENTO DE USUÁRIOS (apenas admin)
// ============================================================

async function _carregarUsuarios() {
    try {
        console.log('[Configuracao] Carregando lista de usuários...');
        const data = await _fetch(_API_USR);

        if (!data.sucesso) {
            _toast(data.mensagem || 'Erro ao carregar usuários.', 'error');
            return;
        }

        _state.usuarios = data.dados || [];
        _setText('cfgTotalUsuarios', _state.usuarios.length);
        _renderTabelaUsuarios();
        console.log('[Configuracao] Usuários carregados:', _state.usuarios.length);
    } catch (e) {
        console.error('[Configuracao] Erro ao carregar usuários:', e);
        if (e.message.includes('Permissão negada')) {
            const aviso = document.getElementById('cfgAvisoPermissao');
            if (aviso) aviso.style.display = 'flex';
            const tabela = document.getElementById('cfgTabelaUsuarios');
            if (tabela) tabela.style.display = 'none';
        } else {
            _toast('Erro ao carregar usuários: ' + e.message, 'error');
        }
    }
}

function _renderTabelaUsuarios() {
    const tbody = document.getElementById('cfgListaUsuarios');
    if (!tbody) return;

    if (_state.usuarios.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-state-cfg">
            <i class="fas fa-users"></i> Nenhum usuário cadastrado.
        </td></tr>`;
        return;
    }

    tbody.innerHTML = _state.usuarios.map(u => `
        <tr>
            <td><strong>${_esc(u.nome)}</strong></td>
            <td>${_esc(u.email)}</td>
            <td>${_esc(u.funcao)}</td>
            <td>${_esc(u.departamento || '--')}</td>
            <td><span class="badge-perm-cfg badge-perm-${_esc(u.permissao)}-cfg">${_esc(_labelPermissao(u.permissao))}</span></td>
            <td><span class="badge-status-cfg ${u.ativo == 1 ? 'badge-ativo-cfg' : 'badge-inativo-cfg'}">${u.ativo == 1 ? 'Ativo' : 'Inativo'}</span></td>
            <td>${_esc(u.data_criacao || '--')}</td>
            <td>
                <div class="td-actions-cfg">
                    <button class="btn-cfg btn-sm-cfg btn-secondary-cfg" onclick="ConfiguracaoPage.editarUsuario(${u.id})" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    ${u.id != 1 ? `<button class="btn-cfg btn-sm-cfg btn-danger-cfg" onclick="ConfiguracaoPage.excluirUsuario(${u.id}, '${_esc(u.nome)}')" title="Excluir">
                        <i class="fas fa-trash"></i>
                    </button>` : ''}
                </div>
            </td>
        </tr>
    `).join('');
}

// ============================================================
// FORMULÁRIO DE USUÁRIO (Modal)
// ============================================================

function _setupFormUsuario() {
    const btnNovo = document.getElementById('btnNovoUsuario');
    const btnFechar = document.getElementById('btnFecharModalUsuario');
    const btnCancelar = document.getElementById('btnCancelarUsuario');
    const btnSalvar = document.getElementById('btnSalvarUsuario');
    const overlay = document.getElementById('modalUsuarioOverlay');

    _on(btnNovo, 'click', () => _abrirModalUsuario());
    _on(btnFechar, 'click', () => _fecharModalUsuario());
    _on(btnCancelar, 'click', () => _fecharModalUsuario());
    _on(overlay, 'click', () => _fecharModalUsuario());
    _on(btnSalvar, 'click', () => _salvarUsuario());

    // Expor funções globais para os botões inline da tabela
    window.ConfiguracaoPage = {
        editarUsuario: _editarUsuario,
        excluirUsuario: _excluirUsuario,
    };
}

function _abrirModalUsuario(usuario = null) {
    const modal = document.getElementById('modalUsuario');
    const titulo = document.getElementById('modalUsuarioTitulo');
    const hintSenha = document.getElementById('hintSenha');
    const senhaObrig = document.getElementById('senhaObrigatorio');

    // Limpar formulário
    document.getElementById('formUsuario').reset();
    document.getElementById('usuarioId').value = '';

    if (usuario) {
        // Modo edição
        _state.editandoId = usuario.id;
        titulo.innerHTML = '<i class="fas fa-user-edit"></i> Editar Usuário';
        document.getElementById('usuarioId').value = usuario.id;
        document.getElementById('usuarioNome').value = usuario.nome || '';
        document.getElementById('usuarioEmail').value = usuario.email || '';
        document.getElementById('usuarioFuncao').value = usuario.funcao || '';
        document.getElementById('usuarioDepartamento').value = usuario.departamento || '';
        document.getElementById('usuarioPermissao').value = usuario.permissao || 'operador';
        document.getElementById('usuarioAtivo').value = usuario.ativo ?? 1;
        document.getElementById('usuarioSenha').placeholder = '(deixe em branco para manter)';
        if (hintSenha) hintSenha.style.display = 'block';
        if (senhaObrig) senhaObrig.style.display = 'none';
    } else {
        // Modo criação
        _state.editandoId = null;
        titulo.innerHTML = '<i class="fas fa-user-plus"></i> Novo Usuário';
        document.getElementById('usuarioSenha').placeholder = 'Mínimo 6 caracteres';
        if (hintSenha) hintSenha.style.display = 'none';
        if (senhaObrig) senhaObrig.style.display = 'inline';
    }

    modal.style.display = 'flex';
}

function _fecharModalUsuario() {
    const modal = document.getElementById('modalUsuario');
    if (modal) modal.style.display = 'none';
    _state.editandoId = null;
}

function _editarUsuario(id) {
    const usuario = _state.usuarios.find(u => u.id == id);
    if (!usuario) {
        _toast('Usuário não encontrado.', 'error');
        return;
    }
    _abrirModalUsuario(usuario);
}

async function _excluirUsuario(id, nome) {
    if (!confirm(`Confirma a exclusão do usuário "${nome}"?\n\nEsta ação não pode ser desfeita.`)) return;

    try {
        const data = await _fetch(_API_USR, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: parseInt(id) }),
        });

        if (data.sucesso) {
            _toast(`Usuário "${nome}" excluído com sucesso.`, 'success');
            await _carregarUsuarios();
        } else {
            _toast(data.mensagem || 'Erro ao excluir usuário.', 'error');
        }
    } catch (e) {
        _toast('Erro ao excluir usuário: ' + e.message, 'error');
    }
}

async function _salvarUsuario() {
    const id = document.getElementById('usuarioId').value;
    const nome = document.getElementById('usuarioNome').value.trim();
    const email = document.getElementById('usuarioEmail').value.trim();
    const funcao = document.getElementById('usuarioFuncao').value.trim();
    const departamento = document.getElementById('usuarioDepartamento').value.trim();
    const permissao = document.getElementById('usuarioPermissao').value;
    const ativo = parseInt(document.getElementById('usuarioAtivo').value);
    const senha = document.getElementById('usuarioSenha').value;
    const senhaConfirm = document.getElementById('usuarioSenhaConfirm').value;

    // Validações client-side
    if (!nome || !email || !funcao) {
        _toast('Preencha todos os campos obrigatórios.', 'warning');
        return;
    }

    if (!id && !senha) {
        _toast('A senha é obrigatória para novos usuários.', 'warning');
        return;
    }

    if (senha && senha.length < 6) {
        _toast('A senha deve ter pelo menos 6 caracteres.', 'warning');
        return;
    }

    if (senha && senha !== senhaConfirm) {
        _toast('As senhas não coincidem.', 'warning');
        return;
    }

    const payload = { nome, email, funcao, departamento, permissao, ativo };
    if (senha) payload.senha = senha;

    const btnSalvar = document.getElementById('btnSalvarUsuario');
    if (btnSalvar) {
        btnSalvar.disabled = true;
        btnSalvar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    }

    try {
        let data;
        if (id) {
            // Atualização: PUT com id no body
            payload.id = parseInt(id);
            data = await _fetch(_API_USR, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        } else {
            // Criação: POST
            data = await _fetch(_API_USR, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        }

        if (data.sucesso) {
            _toast(data.mensagem || 'Usuário salvo com sucesso!', 'success');
            _fecharModalUsuario();
            await _carregarUsuarios();
        } else {
            _toast(data.mensagem || 'Erro ao salvar usuário.', 'error');
        }
    } catch (e) {
        _toast('Erro ao salvar usuário: ' + e.message, 'error');
    } finally {
        if (btnSalvar) {
            btnSalvar.disabled = false;
            btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar Usuário';
        }
    }
}

// ============================================================
// ALTERAR SENHA DO PRÓPRIO PERFIL
// ============================================================

function _setupFormSenha() {
    const form = document.getElementById('formAlterarSenha');
    _on(form, 'submit', async (e) => {
        e.preventDefault();
        await _alterarSenhaPropria();
    });
}

async function _alterarSenhaPropria() {
    const senhaAtual = document.getElementById('senhaAtual').value;
    const senhaNova = document.getElementById('senhaNova').value;
    const senhaNovaConfirm = document.getElementById('senhaNovaConfirm').value;

    if (!senhaAtual || !senhaNova || !senhaNovaConfirm) {
        _toast('Preencha todos os campos de senha.', 'warning');
        return;
    }

    if (senhaNova.length < 6) {
        _toast('A nova senha deve ter pelo menos 6 caracteres.', 'warning');
        return;
    }

    if (senhaNova !== senhaNovaConfirm) {
        _toast('As novas senhas não coincidem.', 'warning');
        return;
    }

    if (!_state.usuarioLogado) {
        _toast('Dados do usuário não carregados. Recarregue a página.', 'error');
        return;
    }

    const btnSubmit = document.querySelector('#formAlterarSenha button[type="submit"]');
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Alterando...';
    }

    try {
        // Usa PUT /api_usuarios.php com o id do usuário logado e a nova senha
        // O backend valida a permissão (admin pode alterar qualquer um; operador só o próprio)
        const data = await _fetch(_API_USR, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: _state.usuarioLogado.id,
                nome: _state.usuarioLogado.nome,
                email: _state.usuarioLogado.email,
                funcao: _state.usuarioLogado.funcao,
                departamento: _state.usuarioLogado.departamento || '',
                permissao: _state.usuarioLogado.permissao,
                ativo: 1,
                senha: senhaNova,
            }),
        });

        if (data.sucesso) {
            _toast('Senha alterada com sucesso!', 'success');
            document.getElementById('formAlterarSenha').reset();
        } else {
            _toast(data.mensagem || 'Erro ao alterar senha.', 'error');
        }
    } catch (e) {
        _toast('Erro ao alterar senha: ' + e.message, 'error');
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = '<i class="fas fa-key"></i> Alterar Senha';
        }
    }
}

/**
 * =====================================================
 * MÓDULO: MORADORES
 * =====================================================
 * Funcionalidades:
 *  - CRUD completo de moradores (incluindo edição via modal)
 *  - CRUD completo de dependentes com CPF, email e celular
 *  - Módulo de Anexos: upload de PDF/imagens até 10 MB
 *  - Feedback visual via toast (sem alert())
 *  - Log de debug detalhado
 * =====================================================
 */

const DEBUG = true;
const log = (...args) => DEBUG && console.log('[Moradores]', ...args);

const API_MORADORES = '../api/api_moradores.php';
const API_DEPENDENTES = '../api/api_dependentes.php';
const API_ANEXOS = '../api/api_moradores_anexos.php';

// ── Estado interno ─────────────────────────────────────────────────────────────
let _currentTab = 'moradores';
let _listaMoradores = [];   // cache para o select de dependentes

// ══════════════════════════════════════════════════════════════════════════════
// INIT / DESTROY
// ══════════════════════════════════════════════════════════════════════════════

export function init() {
    log('Inicializando módulo...');
    _setupTabs();
    _setupForms();
    _setupFileDrop();
    _carregarMoradores();
    _carregarDependentes();

    window.MoradoresPage = {
        // Moradores
        buscar:              _buscarMoradores,
        editar:              _abrirModalEditarMorador,
        excluir:             _excluirMorador,
        fecharModalMorador:  _fecharModalMorador,
        salvarEdicaoMorador: _salvarEdicaoMorador,
        // Dependentes
        buscarDependentes:      _buscarDependentes,
        editarDependente:       _abrirModalEditarDependente,
        excluirDependente:      _excluirDependente,
        fecharModalDependente:  _fecharModalDependente,
        salvarEdicaoDependente: _salvarEdicaoDependente,
        // Anexos
        abrirAnexos:       _abrirModalAnexos,
        fecharModalAnexos: _fecharModalAnexos,
        enviarAnexo:       _enviarAnexo,
        excluirAnexo:      _excluirAnexo,
    };

    // Debounce no campo de busca de dependentes
    const inputBuscaDep = document.getElementById('searchDependente');
    if (inputBuscaDep) {
        let _debounceTimer = null;
        inputBuscaDep.addEventListener('input', () => {
            clearTimeout(_debounceTimer);
            _debounceTimer = setTimeout(() => _buscarDependentes(), 350);
        });
        inputBuscaDep.addEventListener('keydown', e => {
            if (e.key === 'Enter') { clearTimeout(_debounceTimer); _buscarDependentes(); }
        });
    }

    log('Módulo inicializado. window.MoradoresPage exposto.');
}

export function destroy() {
    log('Destruindo módulo...');
    delete window.MoradoresPage;
}

// ══════════════════════════════════════════════════════════════════════════════
// TABS
// ══════════════════════════════════════════════════════════════════════════════

function _setupTabs() {
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            document.querySelectorAll('.tab-button').forEach(b =>
                b.classList.toggle('active', b.dataset.tab === tab));
            document.querySelectorAll('.tab-content').forEach(c =>
                c.classList.toggle('active', c.id === `tab-${tab}`));
            _currentTab = tab;
            log('Tab ativa:', tab);
        });
    });
}

// ══════════════════════════════════════════════════════════════════════════════
// TOAST
// ══════════════════════════════════════════════════════════════════════════════

function _toast(msg, tipo = 'success') {
    const el = document.getElementById('mor-toast');
    if (!el) { console.warn('[Moradores] Toast não encontrado'); return; }

    const cores = {
        success: { bg: '#f0fdf4', border: '#86efac', color: '#166534' },
        error:   { bg: '#fef2f2', border: '#fca5a5', color: '#991b1b' },
        info:    { bg: '#eff6ff', border: '#93c5fd', color: '#1e40af' },
    };
    const c = cores[tipo] || cores.info;
    el.style.cssText = `display:block;position:fixed;top:20px;right:20px;z-index:9999;
        padding:14px 20px;border-radius:8px;font-size:.9rem;min-width:260px;
        box-shadow:0 4px 16px rgba(0,0,0,.15);
        background:${c.bg};border:1px solid ${c.border};color:${c.color};`;
    el.innerHTML = msg;

    clearTimeout(el._timer);
    el._timer = setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// ══════════════════════════════════════════════════════════════════════════════
// FORMULÁRIOS (submit)
// ══════════════════════════════════════════════════════════════════════════════

function _setupForms() {
    const fMorador = document.getElementById('moradorForm');
    if (fMorador) fMorador.addEventListener('submit', e => { e.preventDefault(); _salvarMorador(); });

    const fDep = document.getElementById('dependenteForm');
    if (fDep) fDep.addEventListener('submit', e => { e.preventDefault(); _salvarDependente(); });
}

// ══════════════════════════════════════════════════════════════════════════════
// ── MORADORES ────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function _carregarMoradores() {
    log('Carregando lista de moradores...');
    const loading = document.getElementById('loadingMoradores');
    if (loading) loading.style.display = 'block';

    fetch(API_MORADORES)
        .then(r => r.json())
        .then(data => {
            if (loading) loading.style.display = 'none';
            log('Resposta moradores:', data);
            if (data.sucesso) {
                _listaMoradores = data.dados || [];
                _renderMoradores(_listaMoradores);
                _popularSelectMoradores(_listaMoradores);
            } else {
                _toast('Erro ao carregar moradores: ' + (data.mensagem || ''), 'error');
            }
        })
        .catch(err => {
            if (loading) loading.style.display = 'none';
            log('Erro ao carregar moradores:', err);
            _toast('Falha de comunicação ao carregar moradores', 'error');
        });
}

function _popularSelectMoradores(lista) {
    const sel = document.getElementById('moradorSelecionado');
    if (!sel) return;
    sel.innerHTML = '<option value="">Selecione um morador</option>';
    lista.forEach(m => {
        const id   = m.id || m.id_morador;
        const nome = m.nome || m.nome_completo;
        if (id && nome) {
            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = `${nome} — ${m.unidade || ''}`;
            sel.appendChild(opt);
        }
    });
}

function _renderMoradores(lista) {
    const tbody = document.querySelector('#tabelaMoradores tbody');
    if (!tbody) return;

    if (!lista || lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;opacity:.6;">Nenhum morador cadastrado</td></tr>';
        return;
    }

    tbody.innerHTML = lista.map(m => {
        const id = m.id || m.id_morador || '-';
        return `
        <tr>
            <td>${id}</td>
            <td>${m.nome || m.nome_completo || '-'}</td>
            <td>${m.cpf || '-'}</td>
            <td>${m.unidade || '-'}</td>
            <td>${m.email || '-'}</td>
            <td style="white-space:nowrap;">
                <button onclick="window.MoradoresPage.editar(${id})"
                        class="action-btn edit" title="Editar morador">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="window.MoradoresPage.abrirAnexos(${id}, '${_esc(m.nome || m.nome_completo)}')"
                        class="action-btn attach" title="Anexos do morador">
                    <i class="fas fa-paperclip"></i>
                </button>
                <button onclick="window.MoradoresPage.excluir(${id})"
                        class="action-btn delete" title="Excluir morador">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
}

function _salvarMorador() {
    log('Salvando novo morador...');
    const dados = {
        nome:       document.getElementById('nomeCompleto')?.value?.trim(),
        cpf:        document.getElementById('cpf')?.value?.trim(),
        unidade:    document.getElementById('unidade')?.value?.trim(),
        email:      document.getElementById('email')?.value?.trim(),
        senha:      document.getElementById('senha')?.value,
        telefone:   document.getElementById('telefone')?.value?.trim(),
        celular:    document.getElementById('celular')?.value?.trim(),
        observacao: document.getElementById('observacao')?.value?.trim(),
    };

    if (!dados.nome || !dados.cpf || !dados.unidade || !dados.email || !dados.senha) {
        _toast('Preencha todos os campos obrigatórios (*)', 'error'); return;
    }

    log('Dados do novo morador:', dados);

    fetch(API_MORADORES, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
    })
        .then(r => r.json())
        .then(data => {
            log('Resposta salvar morador:', data);
            if (data.sucesso) {
                _toast('<i class="fas fa-check-circle"></i> Morador cadastrado com sucesso!', 'success');
                document.getElementById('moradorForm')?.reset();
                _carregarMoradores();
            } else {
                _toast('Erro: ' + (data.mensagem || 'Erro desconhecido'), 'error');
            }
        })
        .catch(err => {
            log('Erro ao salvar morador:', err);
            _toast('Falha de comunicação ao salvar morador', 'error');
        });
}

function _buscarMoradores() {
    const termo = document.getElementById('searchMorador')?.value?.trim() || '';
    log('Buscando moradores com termo:', termo);

    fetch(`${API_MORADORES}?nome=${encodeURIComponent(termo)}`)
        .then(r => r.json())
        .then(data => {
            log('Resultado busca:', data);
            if (data.sucesso) _renderMoradores(data.dados || []);
        })
        .catch(err => log('Erro na busca:', err));
}

function _excluirMorador(id) {
    if (!confirm('Deseja realmente excluir este morador? Esta ação não pode ser desfeita.')) return;
    log('Excluindo morador ID:', id);

    fetch(API_MORADORES, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
    })
        .then(r => r.json())
        .then(data => {
            log('Resposta excluir morador:', data);
            if (data.sucesso) {
                _toast('<i class="fas fa-check-circle"></i> Morador excluído com sucesso!', 'success');
                _carregarMoradores();
            } else {
                _toast('Erro ao excluir: ' + (data.mensagem || ''), 'error');
            }
        })
        .catch(err => {
            log('Erro ao excluir morador:', err);
            _toast('Falha de comunicação ao excluir morador', 'error');
        });
}

// ── Modal Editar Morador ───────────────────────────────────────────────────────

function _abrirModalEditarMorador(id) {
    log('Abrindo modal editar morador ID:', id);

    fetch(`${API_MORADORES}?id=${id}`)
        .then(r => r.json())
        .then(data => {
            log('Dados do morador para edição:', data);
            if (!data.sucesso) { _toast('Morador não encontrado', 'error'); return; }

            const m = data.dados;
            document.getElementById('edit-morador-id').value         = m.id;
            document.getElementById('edit-morador-nome').value       = m.nome || '';
            document.getElementById('edit-morador-cpf').value        = m.cpf || '';
            document.getElementById('edit-morador-unidade').value    = m.unidade || '';
            document.getElementById('edit-morador-email').value      = m.email || '';
            document.getElementById('edit-morador-telefone').value   = m.telefone || '';
            document.getElementById('edit-morador-celular').value    = m.celular || '';
            document.getElementById('edit-morador-senha').value      = '';
            document.getElementById('edit-morador-observacao').value = m.observacao || '';

            document.getElementById('modal-editar-morador').style.display = 'flex';
        })
        .catch(err => {
            log('Erro ao carregar morador para edição:', err);
            _toast('Falha ao carregar dados do morador', 'error');
        });
}

function _fecharModalMorador() {
    document.getElementById('modal-editar-morador').style.display = 'none';
}

function _salvarEdicaoMorador() {
    const id = document.getElementById('edit-morador-id')?.value;
    if (!id) { _toast('ID inválido', 'error'); return; }

    const dados = {
        id:         parseInt(id),
        nome:       document.getElementById('edit-morador-nome')?.value?.trim(),
        cpf:        document.getElementById('edit-morador-cpf')?.value?.trim(),
        unidade:    document.getElementById('edit-morador-unidade')?.value?.trim(),
        email:      document.getElementById('edit-morador-email')?.value?.trim(),
        telefone:   document.getElementById('edit-morador-telefone')?.value?.trim(),
        celular:    document.getElementById('edit-morador-celular')?.value?.trim(),
        observacao: document.getElementById('edit-morador-observacao')?.value?.trim(),
    };

    const senha = document.getElementById('edit-morador-senha')?.value;
    if (senha) dados.senha = senha;

    if (!dados.nome || !dados.cpf || !dados.unidade || !dados.email) {
        _toast('Preencha todos os campos obrigatórios (*)', 'error'); return;
    }

    log('Salvando edição morador:', dados);

    fetch(API_MORADORES, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
    })
        .then(r => r.json())
        .then(data => {
            log('Resposta edição morador:', data);
            if (data.sucesso) {
                _toast('<i class="fas fa-check-circle"></i> Morador atualizado com sucesso!', 'success');
                _fecharModalMorador();
                _carregarMoradores();
            } else {
                _toast('Erro: ' + (data.mensagem || 'Erro desconhecido'), 'error');
            }
        })
        .catch(err => {
            log('Erro ao salvar edição morador:', err);
            _toast('Falha de comunicação ao salvar alterações', 'error');
        });
}

// ══════════════════════════════════════════════════════════════════════════════
// ── DEPENDENTES ───────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function _carregarDependentes() {
    log('Carregando dependentes...');
    const tbody = document.querySelector('#tabelaDependentes tbody');
    if (!tbody) return;

    fetch(API_DEPENDENTES)
        .then(r => r.json())
        .then(data => {
            log('Resposta dependentes:', data);
            if (data.sucesso) _renderDependentes(data.dados || []);
            else _toast('Erro ao carregar dependentes: ' + (data.mensagem || ''), 'error');
        })
        .catch(err => {
            log('Erro ao carregar dependentes:', err);
            _toast('Falha de comunicação ao carregar dependentes', 'error');
        });
}

function _renderDependentes(lista) {
    const tbody = document.querySelector('#tabelaDependentes tbody');
    if (!tbody) return;

    if (!lista || lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;opacity:.6;">Nenhum dependente encontrado</td></tr>';
        return;
    }

    tbody.innerHTML = lista.map(dep => {
        const id         = dep.id || dep.dependente_id || '-';
        const nome       = dep.nome_completo || dep.nome || '-';
        const morador    = dep.morador_nome || dep.nome_morador || '-';
        const parentesco = dep.parentesco || '-';
        const cpf        = dep.cpf || '-';
        const email      = dep.email || '-';
        const celular    = dep.celular || '-';

        return `
        <tr>
            <td>${id}</td>
            <td>${nome}</td>
            <td>${morador}</td>
            <td>${parentesco}</td>
            <td>${cpf}</td>
            <td>${email}</td>
            <td>${celular}</td>
            <td style="white-space:nowrap;">
                <button class="action-btn edit" onclick="window.MoradoresPage.editarDependente(${id})" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="action-btn delete" onclick="window.MoradoresPage.excluirDependente(${id})" title="Excluir">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>`;
    }).join('');
}

function _buscarDependentes() {
    const termo = document.getElementById('searchDependente')?.value?.trim() || '';
    log('Buscando dependentes com termo:', termo);

    fetch(`${API_DEPENDENTES}?busca=${encodeURIComponent(termo)}`)
        .then(r => r.json())
        .then(data => {
            log('Resultado busca dependentes:', data);
            if (data.sucesso) _renderDependentes(data.dados || []);
            else _toast('Erro na busca: ' + (data.mensagem || ''), 'error');
        })
        .catch(err => {
            log('Erro na busca de dependentes:', err);
            _toast('Falha de comunicação na busca de dependentes', 'error');
        });
}

function _salvarDependente() {
    log('Salvando novo dependente...');
    const dados = {
        morador_id:    document.getElementById('moradorSelecionado')?.value,
        nome_completo: document.getElementById('nomeDependente')?.value?.trim(),
        parentesco:    document.getElementById('parentesco')?.value,
        cpf:           document.getElementById('cpfDependente')?.value?.trim(),
        email:         document.getElementById('emailDependente')?.value?.trim(),
        celular:       document.getElementById('celularDependente')?.value?.trim(),
    };

    if (!dados.morador_id || !dados.nome_completo || !dados.cpf || !dados.parentesco) {
        _toast('Preencha os campos obrigatórios: Morador, Nome, CPF e Parentesco', 'error'); return;
    }

    log('Dados do novo dependente:', dados);

    fetch(API_DEPENDENTES, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
    })
        .then(r => r.json())
        .then(data => {
            log('Resposta salvar dependente:', data);
            if (data.sucesso) {
                _toast('<i class="fas fa-check-circle"></i> Dependente cadastrado com sucesso!', 'success');
                document.getElementById('dependenteForm')?.reset();
                _carregarDependentes();
            } else {
                _toast('Erro: ' + (data.mensagem || 'Erro desconhecido'), 'error');
            }
        })
        .catch(err => {
            log('Erro ao salvar dependente:', err);
            _toast('Falha de comunicação ao salvar dependente', 'error');
        });
}

function _excluirDependente(id) {
    if (!confirm('Deseja realmente excluir este dependente?')) return;
    log('Excluindo dependente ID:', id);

    fetch(API_DEPENDENTES, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
    })
        .then(r => r.json())
        .then(data => {
            log('Resposta excluir dependente:', data);
            if (data.sucesso) {
                _toast('<i class="fas fa-check-circle"></i> Dependente excluído!', 'success');
                _carregarDependentes();
            } else {
                _toast('Erro ao excluir: ' + (data.mensagem || ''), 'error');
            }
        })
        .catch(err => {
            log('Erro ao excluir dependente:', err);
            _toast('Falha de comunicação ao excluir dependente', 'error');
        });
}

// ── Modal Editar Dependente ────────────────────────────────────────────────────

function _abrirModalEditarDependente(id) {
    log('Abrindo modal editar dependente ID:', id);

    fetch(`${API_DEPENDENTES}?id=${id}`)
        .then(r => r.json())
        .then(data => {
            log('Dados do dependente para edição:', data);
            if (!data.sucesso) { _toast('Dependente não encontrado', 'error'); return; }

            const d = data.dados;
            document.getElementById('edit-dep-id').value         = d.id;
            document.getElementById('edit-dep-nome').value       = d.nome_completo || '';
            document.getElementById('edit-dep-cpf').value        = d.cpf || '';
            document.getElementById('edit-dep-parentesco').value = d.parentesco || '';
            document.getElementById('edit-dep-email').value      = d.email || '';
            document.getElementById('edit-dep-celular').value    = d.celular || '';
            document.getElementById('edit-dep-observacao').value = d.observacao || '';

            document.getElementById('modal-editar-dependente').style.display = 'flex';
        })
        .catch(err => {
            log('Erro ao carregar dependente para edição:', err);
            _toast('Falha ao carregar dados do dependente', 'error');
        });
}

function _fecharModalDependente() {
    document.getElementById('modal-editar-dependente').style.display = 'none';
}

function _salvarEdicaoDependente() {
    const id = document.getElementById('edit-dep-id')?.value;
    if (!id) { _toast('ID inválido', 'error'); return; }

    const dados = {
        id:            parseInt(id),
        nome_completo: document.getElementById('edit-dep-nome')?.value?.trim(),
        cpf:           document.getElementById('edit-dep-cpf')?.value?.trim(),
        parentesco:    document.getElementById('edit-dep-parentesco')?.value,
        email:         document.getElementById('edit-dep-email')?.value?.trim(),
        celular:       document.getElementById('edit-dep-celular')?.value?.trim(),
        observacao:    document.getElementById('edit-dep-observacao')?.value?.trim(),
    };

    if (!dados.nome_completo || !dados.cpf) {
        _toast('Nome completo e CPF são obrigatórios', 'error'); return;
    }

    log('Salvando edição dependente:', dados);

    fetch(API_DEPENDENTES, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
    })
        .then(r => r.json())
        .then(data => {
            log('Resposta edição dependente:', data);
            if (data.sucesso) {
                _toast('<i class="fas fa-check-circle"></i> Dependente atualizado com sucesso!', 'success');
                _fecharModalDependente();
                _carregarDependentes();
            } else {
                _toast('Erro: ' + (data.mensagem || 'Erro desconhecido'), 'error');
            }
        })
        .catch(err => {
            log('Erro ao salvar edição dependente:', err);
            _toast('Falha de comunicação ao salvar dependente', 'error');
        });
}

// ══════════════════════════════════════════════════════════════════════════════
// ── ANEXOS ────────────────────────────────────────────────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

function _setupFileDrop() {
    const drop = document.getElementById('mor-file-drop');
    const input = document.getElementById('anexo-arquivo');
    if (!drop || !input) return;

    input.addEventListener('change', () => {
        const f = input.files[0];
        const label = document.getElementById('mor-file-name');
        if (label) label.textContent = f ? f.name : '';
    });

    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag-over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
    drop.addEventListener('drop', e => {
        e.preventDefault();
        drop.classList.remove('drag-over');
        if (e.dataTransfer.files.length) {
            input.files = e.dataTransfer.files;
            const label = document.getElementById('mor-file-name');
            if (label) label.textContent = e.dataTransfer.files[0].name;
        }
    });
}

function _abrirModalAnexos(moradorId, moradorNome) {
    log('Abrindo modal de anexos — morador ID:', moradorId, '| Nome:', moradorNome);

    document.getElementById('anexo-morador-id').value   = moradorId;
    document.getElementById('anexo-morador-nome').textContent = moradorNome || 'Morador';
    document.getElementById('anexo-nome-doc').value     = '';
    document.getElementById('anexo-arquivo').value      = '';
    const label = document.getElementById('mor-file-name');
    if (label) label.textContent = '';

    document.getElementById('modal-anexos').style.display = 'flex';
    _carregarAnexos(moradorId);
}

function _fecharModalAnexos() {
    document.getElementById('modal-anexos').style.display = 'none';
}

function _carregarAnexos(moradorId) {
    const container = document.getElementById('mor-lista-anexos');
    if (!container) return;

    container.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px;"><i class="fas fa-spinner fa-spin"></i> Carregando...</p>';

    fetch(`${API_ANEXOS}?morador_id=${moradorId}`)
        .then(r => r.json())
        .then(data => {
            log('Anexos carregados:', data);
            if (data.sucesso) {
                _renderAnexos(data.dados || []);
            } else {
                container.innerHTML = '<p style="text-align:center;color:#ef4444;">Erro ao carregar anexos</p>';
            }
        })
        .catch(err => {
            log('Erro ao carregar anexos:', err);
            container.innerHTML = '<p style="text-align:center;color:#ef4444;">Falha de comunicação</p>';
        });
}

function _renderAnexos(lista) {
    const container = document.getElementById('mor-lista-anexos');
    if (!container) return;

    if (!lista || lista.length === 0) {
        container.innerHTML = '<p style="text-align:center;color:#94a3b8;padding:20px;"><i class="fas fa-folder-open"></i> Nenhum documento cadastrado</p>';
        return;
    }

    container.innerHTML = lista.map(a => {
        const isPdf = a.tipo_mime === 'application/pdf';
        const iconClass = isPdf ? 'pdf' : 'img';
        const iconName  = isPdf ? 'fa-file-pdf' : 'fa-file-image';
        const tamanho   = _formatarBytes(a.tamanho_bytes);

        return `
        <div class="mor-anexo-item">
            <div class="mor-anexo-icon ${iconClass}">
                <i class="fas ${iconName}"></i>
            </div>
            <div class="mor-anexo-info">
                <div class="mor-anexo-nome" title="${_esc(a.nome_documento)}">${a.nome_documento}</div>
                <div class="mor-anexo-meta">
                    ${a.nome_original} &bull; ${tamanho} &bull; ${a.data_cadastro}
                    ${a.criado_por ? '&bull; ' + _esc(a.criado_por) : ''}
                </div>
            </div>
            <div class="mor-anexo-actions">
                <a href="${API_ANEXOS}?download=${a.id}" target="_blank"
                   class="action-btn edit" title="Baixar / Visualizar"
                   style="display:inline-flex;align-items:center;justify-content:center;text-decoration:none;">
                    <i class="fas fa-download"></i>
                </a>
                <button class="action-btn delete" title="Remover anexo"
                        onclick="window.MoradoresPage.excluirAnexo(${a.id})">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>`;
    }).join('');
}

function _enviarAnexo() {
    const moradorId    = document.getElementById('anexo-morador-id')?.value;
    const nomeDoc      = document.getElementById('anexo-nome-doc')?.value?.trim();
    const inputArquivo = document.getElementById('anexo-arquivo');
    const arquivo      = inputArquivo?.files?.[0];

    if (!moradorId) { _toast('Morador não identificado', 'error'); return; }
    if (!nomeDoc)   { _toast('Informe o nome do documento', 'error'); return; }
    if (!arquivo)   { _toast('Selecione um arquivo para enviar', 'error'); return; }

    const MAX = 10 * 1024 * 1024;
    if (arquivo.size > MAX) {
        _toast('O arquivo excede o limite de 10 MB', 'error'); return;
    }

    const tiposAceitos = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!tiposAceitos.includes(arquivo.type)) {
        _toast('Formato não permitido. Envie PDF, JPG, PNG, GIF ou WEBP', 'error'); return;
    }

    log('Enviando anexo:', { moradorId, nomeDoc, arquivo: arquivo.name, size: arquivo.size });

    const formData = new FormData();
    formData.append('morador_id',     moradorId);
    formData.append('nome_documento', nomeDoc);
    formData.append('arquivo',        arquivo);

    // Mostrar progresso
    const progressBox = document.getElementById('mor-upload-progress');
    const progressBar = document.getElementById('mor-progress-bar');
    const statusTxt   = document.getElementById('mor-upload-status');
    if (progressBox) progressBox.style.display = 'block';
    if (progressBar) progressBar.style.width = '0%';
    if (statusTxt)   statusTxt.textContent = 'Enviando...';

    const xhr = new XMLHttpRequest();
    xhr.open('POST', API_ANEXOS);
    xhr.withCredentials = true;

    xhr.upload.addEventListener('progress', e => {
        if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            if (progressBar) progressBar.style.width = pct + '%';
            if (statusTxt)   statusTxt.textContent = `Enviando... ${pct}%`;
        }
    });

    xhr.addEventListener('load', () => {
        if (progressBox) progressBox.style.display = 'none';
        try {
            const data = JSON.parse(xhr.responseText);
            log('Resposta upload:', data);
            if (data.sucesso) {
                _toast('<i class="fas fa-check-circle"></i> Documento enviado com sucesso!', 'success');
                document.getElementById('anexo-nome-doc').value = '';
                inputArquivo.value = '';
                const label = document.getElementById('mor-file-name');
                if (label) label.textContent = '';
                _carregarAnexos(moradorId);
            } else {
                _toast('Erro: ' + (data.mensagem || 'Erro desconhecido'), 'error');
            }
        } catch (e) {
            log('Erro ao parsear resposta do upload:', e, xhr.responseText);
            _toast('Resposta inválida do servidor', 'error');
        }
    });

    xhr.addEventListener('error', () => {
        if (progressBox) progressBox.style.display = 'none';
        log('Erro de rede no upload');
        _toast('Falha de comunicação ao enviar o arquivo', 'error');
    });

    xhr.send(formData);
}

function _excluirAnexo(id) {
    if (!confirm('Deseja realmente remover este documento?')) return;
    log('Removendo anexo ID:', id);

    const moradorId = document.getElementById('anexo-morador-id')?.value;

    fetch(API_ANEXOS, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
    })
        .then(r => r.json())
        .then(data => {
            log('Resposta excluir anexo:', data);
            if (data.sucesso) {
                _toast('<i class="fas fa-check-circle"></i> Documento removido!', 'success');
                if (moradorId) _carregarAnexos(moradorId);
            } else {
                _toast('Erro ao remover: ' + (data.mensagem || ''), 'error');
            }
        })
        .catch(err => {
            log('Erro ao remover anexo:', err);
            _toast('Falha de comunicação ao remover documento', 'error');
        });
}

// ══════════════════════════════════════════════════════════════════════════════
// UTILITÁRIOS
// ══════════════════════════════════════════════════════════════════════════════

function _esc(str) {
    return String(str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function _formatarBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

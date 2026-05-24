/**
 * email_alertas.js — Módulo de E-mail e Alertas
 * Sistema ERP Serra da Liberdade
 * v2.0 — Corrigido erro HTTP 500 / JSON parse; layout padronizado
 */
(function () {
    'use strict';

    const API = '../../api/api_email_alertas.php';
    const MODULOS_LABELS = {
        sistema:    { label: 'Sistema',            icon: 'fas fa-cog',           cor: '#64748b' },
        hidrometro: { label: 'Hidrômetro',         icon: 'fas fa-tint',          cor: '#0ea5e9' },
        financeiro: { label: 'Financeiro',          icon: 'fas fa-dollar-sign',   cor: '#22c55e' },
        acesso:     { label: 'Controle de Acesso',  icon: 'fas fa-door-open',     cor: '#f59e0b' },
        rh:         { label: 'Recursos Humanos',    icon: 'fas fa-users',         cor: '#8b5cf6' },
        moradores:  { label: 'Moradores',           icon: 'fas fa-home',          cor: '#2563eb' },
    };

    let _provedores          = [];
    let _alertas             = [];
    let _alertaAtual         = null;
    let _provedorSelecionado = 'custom';
    let _logPagina           = 1;

    // ============================================================
    // HELPER: fetch seguro — não quebra em HTTP 500 / HTML de erro
    // ============================================================
    async function _fetchJson(url, options = {}) {
        const response = await fetch(url, { credentials: 'include', ...options });
        const raw = await response.text();

        let data = null;
        if (raw && raw.trim()) {
            try {
                data = JSON.parse(raw);
            } catch (_) {
                // Servidor retornou HTML (erro PHP, etc.) — extrai texto legível
                const preview = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
                throw new Error(preview || 'Resposta inválida do servidor.');
            }
        }

        if (!response.ok) {
            throw new Error(data?.mensagem || `Erro HTTP ${response.status}`);
        }

        return data || {};
    }

    // ============================================================
    // INICIALIZAÇÃO
    // ============================================================
    function _init() {
        console.log('[EmailAlertas] Inicializando módulo v2.0...');
        _carregarProvedores();
        _carregarSMTP();
    }

    // ============================================================
    // ABAS — usa classList (não style.display) para CSS funcionar
    // ============================================================
    function trocarAba(aba) {
        document.querySelectorAll('.page-email-alertas .tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.page-email-alertas .tab-content').forEach(c => c.classList.remove('active'));
        const btn     = document.querySelector(`.page-email-alertas .tab-btn[data-tab="${aba}"]`);
        const content = document.getElementById(`tab-${aba}`);
        if (btn)     btn.classList.add('active');
        if (content) content.classList.add('active');

        if (aba === 'alertas' && _alertas.length === 0) _carregarAlertas();
        if (aba === 'logs')    carregarLogs();
        if (aba === 'teste')   _renderizarResumoSMTP();
    }

    // ============================================================
    // PROVEDORES
    // ============================================================
    async function _carregarProvedores() {
        try {
            const d = await _fetchJson(`${API}?acao=provedores_listar`);
            if (d.sucesso) {
                _provedores = d.dados.provedores;
                _renderizarProvedores();
            }
        } catch (e) {
            console.error('[EmailAlertas] Erro ao carregar provedores:', e.message);
        }
    }

    function _renderizarProvedores() {
        const grid = document.getElementById('provedores-grid');
        if (!grid) return;
        grid.innerHTML = _provedores.map(p => `
            <div class="provedor-card ${p.id === _provedorSelecionado ? 'active' : ''}"
                 onclick="EmailAlertasPage.selecionarProvedor('${p.id}')" data-id="${p.id}">
                <div class="provedor-card-icon" style="color:${p.cor}">
                    <i class="${p.icone}"></i>
                </div>
                <div class="provedor-card-nome">${p.nome}</div>
            </div>
        `).join('');
    }

    function selecionarProvedor(id) {
        _provedorSelecionado = id;
        document.querySelectorAll('.provedor-card').forEach(c => {
            c.classList.toggle('active', c.dataset.id === id);
        });

        const p = _provedores.find(x => x.id === id);
        if (!p) return;

        if (p.smtp_host) document.getElementById('smtp-host').value = p.smtp_host;
        if (p.smtp_port) document.getElementById('smtp-port').value = p.smtp_port;
        const seg = document.getElementById('smtp-seguranca');
        if (seg && p.smtp_seguranca) seg.value = p.smtp_seguranca;

        const ajudaDiv  = document.getElementById('provedor-ajuda');
        const ajudaTxt  = document.getElementById('provedor-ajuda-texto');
        const ajudaLink = document.getElementById('provedor-ajuda-link');
        if (p.ajuda) {
            ajudaDiv.style.display = 'flex';
            ajudaTxt.textContent = p.ajuda;
            if (p.link_ajuda) {
                ajudaLink.href = p.link_ajuda;
                ajudaLink.style.display = 'inline-flex';
            } else {
                ajudaLink.style.display = 'none';
            }
        } else {
            ajudaDiv.style.display = 'none';
        }
    }

    // ============================================================
    // SMTP — CARREGAR
    // ============================================================
    async function _carregarSMTP() {
        try {
            const d = await _fetchJson(`${API}?acao=smtp_carregar`);
            if (d.sucesso && d.dados) {
                const c = d.dados;
                document.getElementById('smtp-host').value     = c.smtp_host     || '';
                document.getElementById('smtp-port').value     = c.smtp_port     || 587;
                document.getElementById('smtp-usuario').value  = c.smtp_usuario  || '';
                document.getElementById('smtp-de-email').value = c.smtp_de_email || '';
                document.getElementById('smtp-de-nome').value  = c.smtp_de_nome  || 'Sistema ERP';
                document.getElementById('smtp-timeout').value  = c.timeout       || 30;
                const seg = document.getElementById('smtp-seguranca');
                if (seg) seg.value = c.smtp_seguranca || 'tls';

                _provedorSelecionado = c.provedor || 'custom';
                _renderizarProvedores();

                // Atualizar status
                const icon = document.getElementById('smtp-status-icon');
                icon.classList.add('configured');
                icon.innerHTML = '<i class="fas fa-check-circle"></i>';
                document.getElementById('smtp-status-badge').style.display = 'flex';
                document.getElementById('smtp-status-titulo').textContent =
                    `SMTP: ${c.smtp_host}:${c.smtp_port}`;
                document.getElementById('smtp-status-detalhe').textContent =
                    `Usuário: ${c.smtp_usuario} | De: ${c.smtp_de_nome} <${c.smtp_de_email}>`;

                console.log('[EmailAlertas] SMTP carregado:', c.smtp_host, c.smtp_port);
            } else {
                console.log('[EmailAlertas] Nenhuma configuração SMTP encontrada.');
            }
        } catch (e) {
            console.error('[EmailAlertas] Erro ao carregar SMTP:', e.message);
            _toast('Erro ao carregar configuração SMTP: ' + e.message, 'erro');
        }
    }

    // ============================================================
    // SMTP — SALVAR
    // ============================================================
    async function salvarSMTP() {
        const host    = document.getElementById('smtp-host').value.trim();
        const usuario = document.getElementById('smtp-usuario').value.trim();
        const deEmail = document.getElementById('smtp-de-email').value.trim();

        if (!host || !usuario || !deEmail) {
            _toast('Preencha os campos obrigatórios: Host, Usuário e E-mail de Envio.', 'erro');
            return;
        }

        const form = new FormData();
        form.append('acao',           'smtp_salvar');
        form.append('provedor',       _provedorSelecionado);
        form.append('smtp_host',      host);
        form.append('smtp_port',      document.getElementById('smtp-port').value);
        form.append('smtp_usuario',   usuario);
        form.append('smtp_senha',     document.getElementById('smtp-senha').value);
        form.append('smtp_de_email',  deEmail);
        form.append('smtp_de_nome',   document.getElementById('smtp-de-nome').value);
        form.append('smtp_seguranca', document.getElementById('smtp-seguranca').value);
        form.append('timeout',        document.getElementById('smtp-timeout').value);

        try {
            const d = await _fetchJson(API, { method: 'POST', body: form });
            _toast(d.mensagem, d.sucesso ? 'sucesso' : 'erro');
            if (d.sucesso) _carregarSMTP();
        } catch (e) {
            _toast('Erro de comunicação: ' + e.message, 'erro');
        }
    }

    // ============================================================
    // SMTP — TESTAR
    // ============================================================
    async function testarSMTP() {
        const email = document.getElementById('teste-email').value.trim();
        if (!email) { _toast('Informe um e-mail para o teste.', 'erro'); return; }

        const btn = document.getElementById('btn-testar');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

        const form = new FormData();
        form.append('acao', 'smtp_testar');
        form.append('email_teste', email);

        const res = document.getElementById('teste-resultado');
        res.style.display = 'none';

        try {
            const d = await _fetchJson(API, { method: 'POST', body: form });
            res.style.display = 'flex';
            if (d.sucesso) {
                res.className = 'teste-resultado sucesso';
                res.innerHTML = `
                    <i class="fas fa-check-circle"></i>
                    <div>
                        <div class="teste-resultado-titulo">E-mail enviado com sucesso!</div>
                        <div class="teste-resultado-detalhe">
                            Verifique a caixa de entrada de <strong>${_esc(email)}</strong>.<br>
                            Host: ${_esc(d.dados?.host || '')} | Porta: ${_esc(String(d.dados?.porta || ''))}
                        </div>
                    </div>`;
            } else {
                res.className = 'teste-resultado erro';
                res.innerHTML = `
                    <i class="fas fa-times-circle"></i>
                    <div>
                        <div class="teste-resultado-titulo">Falha no envio</div>
                        <div class="teste-resultado-detalhe">
                            ${_esc(d.mensagem)}
                            ${d.dados?.erro ? `<pre style="margin:8px 0 0;font-size:11px;background:#fef2f2;padding:8px;border-radius:4px;overflow:auto;white-space:pre-wrap">${_esc(d.dados.erro)}</pre>` : ''}
                        </div>
                    </div>`;
            }
        } catch (e) {
            res.style.display = 'flex';
            res.className = 'teste-resultado erro';
            res.innerHTML = `
                <i class="fas fa-times-circle"></i>
                <div>
                    <div class="teste-resultado-titulo">Erro de comunicação</div>
                    <div class="teste-resultado-detalhe">${_esc(e.message)}</div>
                </div>`;
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar E-mail de Teste';
        }
    }

    async function _renderizarResumoSMTP() {
        const el = document.getElementById('smtp-resumo');
        if (!el) return;
        try {
            const d = await _fetchJson(`${API}?acao=smtp_carregar`);
            if (d.sucesso && d.dados) {
                const c = d.dados;
                el.innerHTML = `
                    <div class="smtp-resumo-item">
                        <div class="smtp-resumo-label">Provedor</div>
                        <div class="smtp-resumo-valor">${_esc(c.provedor || 'custom')}</div>
                    </div>
                    <div class="smtp-resumo-item">
                        <div class="smtp-resumo-label">Host / Porta</div>
                        <div class="smtp-resumo-valor">${_esc(c.smtp_host)}:${_esc(String(c.smtp_port))}</div>
                    </div>
                    <div class="smtp-resumo-item">
                        <div class="smtp-resumo-label">Usuário</div>
                        <div class="smtp-resumo-valor">${_esc(c.smtp_usuario)}</div>
                    </div>
                    <div class="smtp-resumo-item">
                        <div class="smtp-resumo-label">Remetente</div>
                        <div class="smtp-resumo-valor">${_esc(c.smtp_de_nome)} &lt;${_esc(c.smtp_de_email)}&gt;</div>
                    </div>
                    <div class="smtp-resumo-item">
                        <div class="smtp-resumo-label">Segurança</div>
                        <div class="smtp-resumo-valor">${_esc((c.smtp_seguranca || 'tls').toUpperCase())}</div>
                    </div>
                    <div class="smtp-resumo-item">
                        <div class="smtp-resumo-label">Timeout</div>
                        <div class="smtp-resumo-valor">${_esc(String(c.timeout || 30))}s</div>
                    </div>`;
            } else {
                el.innerHTML = `
                    <div class="smtp-resumo-item" style="grid-column:1/-1">
                        <div class="smtp-resumo-valor" style="color:#dc2626">
                            <i class="fas fa-exclamation-triangle"></i> Nenhuma configuração SMTP encontrada.
                        </div>
                    </div>`;
            }
        } catch (e) {
            el.innerHTML = `<div style="color:#dc2626;font-size:14px"><i class="fas fa-exclamation-triangle"></i> ${_esc(e.message)}</div>`;
        }
    }

    function toggleSenha() {
        const inp  = document.getElementById('smtp-senha');
        const icon = document.getElementById('smtp-senha-icon');
        if (inp.type === 'password') {
            inp.type = 'text';
            icon.className = 'fas fa-eye-slash';
        } else {
            inp.type = 'password';
            icon.className = 'fas fa-eye';
        }
    }

    // ============================================================
    // ALERTAS — CARREGAR
    // ============================================================
    async function _carregarAlertas() {
        const container = document.getElementById('alertas-container');
        if (container) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Carregando alertas...</p></div>';
        }
        try {
            const d = await _fetchJson(`${API}?acao=alertas_listar`);
            if (d.sucesso) {
                _alertas = d.dados.alertas;
                _renderizarFiltrosModulo(d.dados.grupos);
                _renderizarAlertas(d.dados.grupos);
            } else {
                if (container) container.innerHTML =
                    `<div class="page-card" style="color:#dc2626"><i class="fas fa-exclamation-triangle"></i> ${_esc(d.mensagem)}</div>`;
            }
        } catch (e) {
            if (container) container.innerHTML =
                `<div class="page-card" style="color:#dc2626"><i class="fas fa-exclamation-triangle"></i> Erro: ${_esc(e.message)}</div>`;
        }
    }

    function _renderizarFiltrosModulo(grupos) {
        const wrap = document.getElementById('alertas-filtros');
        if (!wrap) return;
        const modulos = Object.keys(grupos);
        const extra = modulos.map(m => {
            const info = MODULOS_LABELS[m] || { label: m, icon: 'fas fa-circle', cor: '#64748b' };
            return `<button class="btn-modulo-filtro" data-modulo="${m}" onclick="EmailAlertasPage.filtrarAlertas('${m}')">
                <i class="${info.icon}" style="color:${info.cor}"></i> ${info.label}
            </button>`;
        }).join('');
        wrap.innerHTML = `<button class="btn-modulo-filtro active" data-modulo="" onclick="EmailAlertasPage.filtrarAlertas('')">Todos</button>${extra}`;
    }

    function _renderizarAlertas(grupos) {
        const container = document.getElementById('alertas-container');
        if (!container) return;
        if (!grupos || Object.keys(grupos).length === 0) {
            container.innerHTML = '<div class="empty-state"><i class="fas fa-bell-slash"></i><p>Nenhum alerta configurado.</p></div>';
            return;
        }
        container.innerHTML = Object.entries(grupos).map(([modulo, lista]) => {
            const info = MODULOS_LABELS[modulo] || { label: modulo, icon: 'fas fa-circle', cor: '#64748b' };
            const ativos = lista.filter(a => a.ativo == 1).length;
            return `
            <div class="alertas-grupo" data-modulo="${modulo}">
                <div class="alertas-grupo-titulo">
                    <i class="${info.icon}" style="color:${info.cor}"></i>
                    ${info.label}
                    <span style="margin-left:auto;font-size:12px;color:#94a3b8;font-weight:400">
                        ${ativos}/${lista.length} ativo${ativos !== 1 ? 's' : ''}
                    </span>
                </div>
                ${lista.map(a => `
                <div class="alerta-card ${a.ativo == 1 ? 'ativo' : 'inativo'}" id="alerta-item-${a.id}">
                    <div class="alerta-info">
                        <div class="alerta-nome">${_esc(a.nome)}</div>
                        <div class="alerta-desc">${_esc(a.descricao || '')}</div>
                        <div class="alerta-assunto">
                            <i class="fas fa-envelope"></i> ${a.assunto ? _esc(a.assunto) : '<em>Assunto não configurado</em>'}
                        </div>
                    </div>
                    <div class="alerta-acoes">
                        <button class="btn-secondary-modern btn-sm" onclick="EmailAlertasPage.abrirModalAlerta(${a.id})" title="Configurar">
                            <i class="fas fa-edit"></i> Configurar
                        </button>
                        <label class="toggle-switch" title="${a.ativo == 1 ? 'Ativo — clique para desativar' : 'Inativo — clique para ativar'}">
                            <input type="checkbox" ${a.ativo == 1 ? 'checked' : ''}
                                   onchange="EmailAlertasPage.toggleAlerta(${a.id}, this.checked)">
                            <span class="toggle-slider"></span>
                        </label>
                    </div>
                </div>`).join('')}
            </div>`;
        }).join('');
    }

    function filtrarAlertas(modulo) {
        document.querySelectorAll('.page-email-alertas .btn-modulo-filtro').forEach(b => {
            b.classList.toggle('active', b.dataset.modulo === modulo);
        });
        document.querySelectorAll('.alertas-grupo').forEach(g => {
            g.style.display = (!modulo || g.dataset.modulo === modulo) ? 'block' : 'none';
        });
    }

    // ============================================================
    // ALERTA — TOGGLE
    // ============================================================
    async function toggleAlerta(id, ativo) {
        const form = new FormData();
        form.append('acao',  'alerta_toggle');
        form.append('id',    id);
        form.append('ativo', ativo ? 1 : 0);

        try {
            const d = await _fetchJson(API, { method: 'POST', body: form });
            _toast(d.mensagem, d.sucesso ? 'sucesso' : 'erro');
            if (d.sucesso) {
                const a = _alertas.find(x => x.id == id);
                if (a) {
                    a.ativo = ativo ? 1 : 0;
                    const card = document.getElementById(`alerta-item-${id}`);
                    if (card) {
                        card.classList.toggle('ativo',   !!ativo);
                        card.classList.toggle('inativo', !ativo);
                    }
                }
            }
        } catch (e) {
            _toast('Erro: ' + e.message, 'erro');
        }
    }

    // ============================================================
    // MODAL — ALERTA
    // ============================================================
    function abrirModalAlerta(id) {
        _alertaAtual = _alertas.find(a => a.id == id);
        if (!_alertaAtual) return;

        document.getElementById('modal-alerta-titulo').textContent = 'Configurar: ' + _alertaAtual.nome;
        document.getElementById('modal-alerta-id').value    = _alertaAtual.id;
        document.getElementById('modal-assunto').value      = _alertaAtual.assunto || '';
        document.getElementById('modal-corpo').value        = _alertaAtual.corpo_html || '';
        document.getElementById('modal-dest-tipo').value    = _alertaAtual.destinatario_tipo || 'admin';
        document.getElementById('modal-dest-email').value   = _alertaAtual.destinatario_email || '';
        document.getElementById('modal-cc').value           = _alertaAtual.cc_emails || '';
        document.getElementById('modal-preview-wrap').style.display = 'none';

        toggleDestEmail();

        const vars = Array.isArray(_alertaAtual.variaveis) ? _alertaAtual.variaveis : [];
        document.getElementById('modal-variaveis-lista').innerHTML = vars.map(v =>
            `<span class="variavel-tag" onclick="EmailAlertasPage.inserirVariavel('{{${v}}}')">{{${v}}}</span>`
        ).join('');

        // Abrir modal via classe CSS
        const overlay = document.getElementById('modal-alerta');
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function fecharModalAlerta() {
        const overlay = document.getElementById('modal-alerta');
        overlay.classList.remove('open');
        document.body.style.overflow = '';
        _alertaAtual = null;
    }

    function toggleDestEmail() {
        const tipo = document.getElementById('modal-dest-tipo').value;
        document.getElementById('modal-dest-email-wrap').style.display =
            tipo === 'email_fixo' ? 'block' : 'none';
    }

    function inserirVariavel(variavel) {
        const ta = document.getElementById('modal-corpo');
        const start = ta.selectionStart;
        const end   = ta.selectionEnd;
        ta.value = ta.value.substring(0, start) + variavel + ta.value.substring(end);
        ta.selectionStart = ta.selectionEnd = start + variavel.length;
        ta.focus();
    }

    function previewAlerta() {
        const corpo = document.getElementById('modal-corpo').value;
        const wrap  = document.getElementById('modal-preview-wrap');
        const cont  = document.getElementById('modal-preview-conteudo');
        const exemplo = corpo
            .replace(/\{\{nome_usuario\}\}/g, 'João da Silva')
            .replace(/\{\{nome_morador\}\}/g, 'Maria Oliveira')
            .replace(/\{\{unidade\}\}/g, 'Gleba 42')
            .replace(/\{\{sistema_nome\}\}/g, 'Serra da Liberdade')
            .replace(/\{\{logo_url\}\}/g, '../../assets/img/logo.png')
            .replace(/\{\{data_envio\}\}/g, new Date().toLocaleString('pt-BR'))
            .replace(/\{\{[\w_]+\}\}/g, '<span style="background:#fef3c7;padding:0 4px;border-radius:3px;font-size:11px">[variável]</span>');
        cont.innerHTML = exemplo;
        wrap.style.display = 'block';
    }

    async function resetarTemplate() {
        if (!_alertaAtual) return;
        if (!confirm('Restaurar o template padrão? Suas edições serão perdidas.')) return;
        try {
            const d = await _fetchJson(`${API}?acao=alertas_listar`);
            if (d.sucesso) {
                const original = d.dados.alertas.find(a => a.id == _alertaAtual.id);
                if (original) {
                    document.getElementById('modal-corpo').value = original.corpo_html || '';
                    _toast('Template restaurado.', 'sucesso');
                }
            }
        } catch (e) {
            _toast('Erro ao restaurar: ' + e.message, 'erro');
        }
    }

    async function salvarAlerta() {
        const id = document.getElementById('modal-alerta-id').value;
        if (!id) return;

        const form = new FormData();
        form.append('acao',               'alerta_salvar');
        form.append('id',                 id);
        form.append('assunto',            document.getElementById('modal-assunto').value);
        form.append('corpo_html',         document.getElementById('modal-corpo').value);
        form.append('destinatario_tipo',  document.getElementById('modal-dest-tipo').value);
        form.append('destinatario_email', document.getElementById('modal-dest-email').value);
        form.append('cc_emails',          document.getElementById('modal-cc').value);

        try {
            const d = await _fetchJson(API, { method: 'POST', body: form });
            _toast(d.mensagem, d.sucesso ? 'sucesso' : 'erro');
            if (d.sucesso) {
                fecharModalAlerta();
                _carregarAlertas();
            }
        } catch (e) {
            _toast('Erro: ' + e.message, 'erro');
        }
    }

    // ============================================================
    // LOG DE ENVIOS
    // ============================================================
    async function carregarLogs() {
        const status = document.getElementById('log-filtro-status')?.value || '';
        const tipo   = document.getElementById('log-filtro-tipo')?.value   || '';
        const busca  = document.getElementById('log-busca')?.value         || '';
        const params = new URLSearchParams({ acao: 'log_listar', pagina: _logPagina, status, tipo, busca });

        try {
            const d = await _fetchJson(`${API}?${params}`);
            if (d.sucesso) _renderizarLogs(d.dados);
        } catch (e) {
            console.error('[EmailAlertas] Erro ao carregar logs:', e.message);
            const tbody = document.getElementById('log-tbody');
            if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:#dc2626">
                <i class="fas fa-exclamation-triangle"></i> ${_esc(e.message)}</td></tr>`;
        }
    }

    function _renderizarLogs(dados) {
        const tbody = document.getElementById('log-tbody');
        if (!tbody) return;

        if (!dados.logs || dados.logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:#94a3b8">Nenhum registro encontrado.</td></tr>';
            return;
        }

        tbody.innerHTML = dados.logs.map(l => {
            const statusBadge = l.status === 'enviado'
                ? '<span class="badge-log enviado"><i class="fas fa-check"></i> Enviado</span>'
                : l.status === 'erro'
                ? '<span class="badge-log erro"><i class="fas fa-times"></i> Erro</span>'
                : '<span class="badge-log pendente"><i class="fas fa-clock"></i> Pendente</span>';

            const dataFmt = l.data_envio
                ? new Date(l.data_envio).toLocaleString('pt-BR')
                : '—';

            return `<tr>
                <td style="white-space:nowrap;font-size:12px">${dataFmt}</td>
                <td>
                    <span style="background:#f1f5f9;padding:2px 8px;border-radius:4px;font-size:12px">${_esc(l.tipo || '—')}</span>
                    ${l.alerta_codigo ? `<br><small style="color:#94a3b8;font-size:11px">${_esc(l.alerta_codigo)}</small>` : ''}
                </td>
                <td style="font-size:13px">${_esc(l.destinatario)}</td>
                <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px" title="${_esc(l.assunto)}">${_esc(l.assunto)}</td>
                <td>${statusBadge}</td>
                <td>${l.erro_mensagem
                    ? `<span style="color:#dc2626;font-size:12px;cursor:help" title="${_esc(l.erro_mensagem)}"><i class="fas fa-exclamation-circle"></i> Ver erro</span>`
                    : '—'}</td>
            </tr>`;
        }).join('');

        // Paginação
        const pag = document.getElementById('log-paginacao');
        if (pag) {
            if (dados.total_paginas > 1) {
                let btns = '';
                for (let i = 1; i <= dados.total_paginas; i++) {
                    btns += `<button class="pag-btn ${i === dados.pagina_atual ? 'active' : ''}"
                        onclick="EmailAlertasPage._setLogPagina(${i})">${i}</button>`;
                }
                pag.innerHTML = btns;
            } else {
                pag.innerHTML = '';
            }
        }
    }

    function _setLogPagina(p) {
        _logPagina = p;
        carregarLogs();
    }

    async function limparLogs() {
        if (!confirm('Remover logs com mais de 30 dias? Esta ação não pode ser desfeita.')) return;
        const form = new FormData();
        form.append('acao', 'log_limpar');
        form.append('dias', 30);
        try {
            const d = await _fetchJson(API, { method: 'POST', body: form });
            _toast(d.mensagem, d.sucesso ? 'sucesso' : 'erro');
            if (d.sucesso) carregarLogs();
        } catch (e) {
            _toast('Erro: ' + e.message, 'erro');
        }
    }

    // ============================================================
    // HELPERS
    // ============================================================
    function _esc(s) {
        if (!s) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function _toast(msg, tipo) {
        const cores = { sucesso: '#22c55e', erro: '#dc2626', info: '#2563eb' };
        const t = document.createElement('div');
        t.style.cssText = `
            position:fixed;bottom:24px;right:24px;
            background:${cores[tipo] || '#334155'};
            color:#fff;padding:12px 20px;border-radius:10px;
            font-size:14px;font-weight:500;z-index:99999;
            box-shadow:0 4px 16px rgba(0,0,0,.2);max-width:380px;
            line-height:1.4;display:flex;align-items:center;gap:10px;
            animation:emailFadeIn .3s ease`;
        const icon = tipo === 'sucesso' ? 'check-circle' : tipo === 'erro' ? 'times-circle' : 'info-circle';
        t.innerHTML = `<i class="fas fa-${icon}"></i><span>${_esc(msg)}</span>`;
        document.body.appendChild(t);
        setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 4000);
    }

    // ============================================================
    // OBJETO PÚBLICO
    // ============================================================
    window.EmailAlertasPage = {
        init:               _init,
        trocarAba:          trocarAba,
        selecionarProvedor: selecionarProvedor,
        salvarSMTP:         salvarSMTP,
        testarSMTP:         testarSMTP,
        toggleSenha:        toggleSenha,
        filtrarAlertas:     filtrarAlertas,
        toggleAlerta:       toggleAlerta,
        abrirModalAlerta:   abrirModalAlerta,
        fecharModalAlerta:  fecharModalAlerta,
        toggleDestEmail:    toggleDestEmail,
        inserirVariavel:    inserirVariavel,
        previewAlerta:      previewAlerta,
        resetarTemplate:    resetarTemplate,
        salvarAlerta:       salvarAlerta,
        carregarLogs:       carregarLogs,
        limparLogs:         limparLogs,
        _setLogPagina:      _setLogPagina,
    };

    // Auto-init quando o DOM estiver pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _init);
    } else {
        setTimeout(_init, 100);
    }

})();

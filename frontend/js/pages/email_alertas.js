/**
 * email_alertas.js — Módulo de E-mail e Alertas
 * Sistema ERP Serra da Liberdade
 */
(function () {
    'use strict';

    const API = '../../api/api_email_alertas.php';
    const MODULOS_LABELS = {
        sistema:    { label: 'Sistema',       icon: 'fas fa-cog',           cor: '#64748b' },
        hidrometro: { label: 'Hidrômetro',    icon: 'fas fa-tint',          cor: '#0ea5e9' },
        financeiro: { label: 'Financeiro',     icon: 'fas fa-dollar-sign',   cor: '#22c55e' },
        acesso:     { label: 'Controle de Acesso', icon: 'fas fa-door-open', cor: '#f59e0b' },
        rh:         { label: 'Recursos Humanos',   icon: 'fas fa-users',     cor: '#8b5cf6' },
        moradores:  { label: 'Moradores',      icon: 'fas fa-home',          cor: '#2563eb' },
    };

    let _provedores = [];
    let _alertas    = [];
    let _alertaAtual = null;
    let _provedorSelecionado = 'custom';
    let _logPagina  = 1;

    // ============================================================
    // INICIALIZAÇÃO
    // ============================================================
    function _init() {
        console.log('[EmailAlertas] Inicializando módulo...');
        _carregarProvedores();
        _carregarSMTP();
    }

    // ============================================================
    // ABAS
    // ============================================================
    function trocarAba(aba) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
        const btn = document.querySelector(`.tab-btn[data-tab="${aba}"]`);
        const content = document.getElementById(`tab-${aba}`);
        if (btn) btn.classList.add('active');
        if (content) content.style.display = 'block';

        if (aba === 'alertas' && _alertas.length === 0) _carregarAlertas();
        if (aba === 'logs')    _carregarLogs();
        if (aba === 'teste')   _renderizarResumoSMTP();
    }

    // ============================================================
    // PROVEDORES
    // ============================================================
    function _carregarProvedores() {
        fetch(`${API}?acao=provedores_listar`)
            .then(r => r.json())
            .then(d => {
                if (d.sucesso) {
                    _provedores = d.dados.provedores;
                    _renderizarProvedores();
                }
            })
            .catch(e => console.error('[EmailAlertas] Erro ao carregar provedores:', e));
    }

    function _renderizarProvedores() {
        const grid = document.getElementById('provedores-grid');
        if (!grid) return;
        grid.innerHTML = _provedores.map(p => `
            <div class="provedor-card ${p.id === _provedorSelecionado ? 'selected' : ''}"
                 onclick="EmailAlertasPage.selecionarProvedor('${p.id}')" data-id="${p.id}">
                <div class="provedor-icon" style="color:${p.cor}">
                    <i class="${p.icone}"></i>
                </div>
                <div class="provedor-nome">${p.nome}</div>
                <div class="provedor-desc">${p.descricao}</div>
            </div>
        `).join('');
    }

    function selecionarProvedor(id) {
        _provedorSelecionado = id;
        document.querySelectorAll('.provedor-card').forEach(c => {
            c.classList.toggle('selected', c.dataset.id === id);
        });

        const p = _provedores.find(x => x.id === id);
        if (!p) return;

        // Preencher campos com preset
        if (p.smtp_host) document.getElementById('smtp-host').value = p.smtp_host;
        if (p.smtp_port) document.getElementById('smtp-port').value = p.smtp_port;
        const seg = document.getElementById('smtp-seguranca');
        if (seg && p.smtp_seguranca) seg.value = p.smtp_seguranca;

        // Mostrar ajuda
        const ajudaDiv  = document.getElementById('provedor-ajuda');
        const ajudaTxt  = document.getElementById('provedor-ajuda-texto');
        const ajudaLink = document.getElementById('provedor-ajuda-link');
        if (p.ajuda) {
            ajudaDiv.style.display = 'block';
            ajudaTxt.textContent = p.ajuda;
            if (p.link_ajuda) {
                ajudaLink.href = p.link_ajuda;
                ajudaLink.style.display = 'inline';
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
    function _carregarSMTP() {
        fetch(`${API}?acao=smtp_carregar`)
            .then(r => r.json())
            .then(d => {
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

                    // Status badge
                    document.getElementById('smtp-status-badge').style.display = 'block';
                    document.getElementById('smtp-status-titulo').textContent = `SMTP: ${c.smtp_host}:${c.smtp_port}`;
                    document.getElementById('smtp-status-detalhe').textContent = `Usuário: ${c.smtp_usuario} | De: ${c.smtp_de_nome} <${c.smtp_de_email}>`;
                    document.getElementById('smtp-status-icon').innerHTML = '<i class="fas fa-check-circle" style="color:#22c55e"></i>';
                }
            })
            .catch(e => console.error('[EmailAlertas] Erro ao carregar SMTP:', e));
    }

    // ============================================================
    // SMTP — SALVAR
    // ============================================================
    function salvarSMTP() {
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

        fetch(API, { method: 'POST', body: form })
            .then(r => r.json())
            .then(d => {
                _toast(d.mensagem, d.sucesso ? 'sucesso' : 'erro');
                if (d.sucesso) _carregarSMTP();
            })
            .catch(e => _toast('Erro de comunicação: ' + e.message, 'erro'));
    }

    // ============================================================
    // SMTP — TESTAR
    // ============================================================
    function testarSMTP() {
        const email = document.getElementById('teste-email').value.trim();
        if (!email) { _toast('Informe um e-mail para o teste.', 'erro'); return; }

        const btn = document.getElementById('btn-testar');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

        const form = new FormData();
        form.append('acao', 'smtp_testar');
        form.append('email_teste', email);

        fetch(API, { method: 'POST', body: form })
            .then(r => r.json())
            .then(d => {
                const res = document.getElementById('teste-resultado');
                res.style.display = 'block';
                if (d.sucesso) {
                    res.style.background = '#dcfce7';
                    res.style.border = '1px solid #86efac';
                    res.innerHTML = `<div style="color:#166534"><i class="fas fa-check-circle fa-lg"></i>
                        <strong style="margin-left:8px">E-mail enviado com sucesso!</strong>
                        <p style="margin:8px 0 0;font-size:13px">Verifique a caixa de entrada de <strong>${email}</strong>.</p>
                        <p style="margin:4px 0 0;font-size:12px;color:#4ade80">Host: ${d.dados?.host} | Porta: ${d.dados?.porta}</p>
                    </div>`;
                } else {
                    res.style.background = '#fee2e2';
                    res.style.border = '1px solid #fca5a5';
                    res.innerHTML = `<div style="color:#991b1b"><i class="fas fa-times-circle fa-lg"></i>
                        <strong style="margin-left:8px">Falha no envio</strong>
                        <p style="margin:8px 0 0;font-size:13px">${d.mensagem}</p>
                        ${d.dados?.erro ? `<pre style="margin:8px 0 0;font-size:11px;background:#fef2f2;padding:8px;border-radius:4px;overflow:auto">${d.dados.erro}</pre>` : ''}
                    </div>`;
                }
            })
            .catch(e => {
                _toast('Erro de comunicação: ' + e.message, 'erro');
            })
            .finally(() => {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar E-mail de Teste';
            });
    }

    function _renderizarResumoSMTP() {
        fetch(`${API}?acao=smtp_carregar`)
            .then(r => r.json())
            .then(d => {
                const el = document.getElementById('smtp-resumo');
                if (!el) return;
                if (d.sucesso && d.dados) {
                    const c = d.dados;
                    el.innerHTML = `
                        <table style="border-collapse:collapse;width:100%">
                            <tr><td style="padding:4px 0;color:#94a3b8;width:140px">Provedor</td><td style="color:#334155;font-weight:600">${c.provedor || 'custom'}</td></tr>
                            <tr><td style="padding:4px 0;color:#94a3b8">Host</td><td style="color:#334155;font-weight:600">${c.smtp_host}:${c.smtp_port}</td></tr>
                            <tr><td style="padding:4px 0;color:#94a3b8">Usuário</td><td style="color:#334155">${c.smtp_usuario}</td></tr>
                            <tr><td style="padding:4px 0;color:#94a3b8">Remetente</td><td style="color:#334155">${c.smtp_de_nome} &lt;${c.smtp_de_email}&gt;</td></tr>
                            <tr><td style="padding:4px 0;color:#94a3b8">Segurança</td><td style="color:#334155">${c.smtp_seguranca?.toUpperCase()}</td></tr>
                        </table>`;
                } else {
                    el.innerHTML = '<span style="color:#dc2626"><i class="fas fa-exclamation-triangle"></i> Nenhuma configuração SMTP encontrada.</span>';
                }
            });
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
    function _carregarAlertas() {
        fetch(`${API}?acao=alertas_listar`)
            .then(r => r.json())
            .then(d => {
                if (d.sucesso) {
                    _alertas = d.dados.alertas;
                    _renderizarFiltrosModulo(d.dados.grupos);
                    _renderizarAlertas(d.dados.grupos);
                } else {
                    document.getElementById('alertas-container').innerHTML =
                        `<div class="page-card" style="color:#dc2626">${d.mensagem}</div>`;
                }
            })
            .catch(e => {
                document.getElementById('alertas-container').innerHTML =
                    `<div class="page-card" style="color:#dc2626">Erro: ${e.message}</div>`;
            });
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
            container.innerHTML = '<div class="page-card" style="text-align:center;color:#94a3b8;padding:40px">Nenhum alerta configurado.</div>';
            return;
        }
        container.innerHTML = Object.entries(grupos).map(([modulo, lista]) => {
            const info = MODULOS_LABELS[modulo] || { label: modulo, icon: 'fas fa-circle', cor: '#64748b' };
            const ativos = lista.filter(a => a.ativo == 1).length;
            return `
            <div class="alerta-grupo page-card" style="padding:0;overflow:hidden" data-modulo="${modulo}">
                <div class="alerta-grupo-titulo">
                    <i class="${info.icon}" style="color:${info.cor}"></i>
                    ${info.label}
                    <span style="margin-left:auto;font-size:12px;color:#64748b;font-weight:400">
                        ${ativos}/${lista.length} ativo${ativos !== 1 ? 's' : ''}
                    </span>
                </div>
                ${lista.map(a => `
                <div class="alerta-item" id="alerta-item-${a.id}">
                    <div class="alerta-info">
                        <div class="alerta-nome">${a.nome}</div>
                        <div class="alerta-desc">${a.descricao || ''}</div>
                        <div style="font-size:11px;color:#94a3b8;margin-top:4px">
                            <i class="fas fa-envelope"></i> ${a.assunto || '<em>Assunto não configurado</em>'}
                        </div>
                    </div>
                    <div class="alerta-acoes">
                        <button class="btn btn-sm btn-outline" onclick="EmailAlertasPage.abrirModalAlerta(${a.id})" title="Configurar">
                            <i class="fas fa-edit"></i> Configurar
                        </button>
                        <label class="toggle-switch" title="${a.ativo ? 'Ativo' : 'Inativo'}">
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
        document.querySelectorAll('.btn-modulo-filtro').forEach(b => {
            b.classList.toggle('active', b.dataset.modulo === modulo);
        });
        document.querySelectorAll('.alerta-grupo').forEach(g => {
            g.style.display = (!modulo || g.dataset.modulo === modulo) ? 'block' : 'none';
        });
    }

    // ============================================================
    // ALERTA — TOGGLE
    // ============================================================
    function toggleAlerta(id, ativo) {
        const form = new FormData();
        form.append('acao',  'alerta_toggle');
        form.append('id',    id);
        form.append('ativo', ativo ? 1 : 0);

        fetch(API, { method: 'POST', body: form })
            .then(r => r.json())
            .then(d => {
                _toast(d.mensagem, d.sucesso ? 'sucesso' : 'erro');
                if (d.sucesso) {
                    const a = _alertas.find(x => x.id == id);
                    if (a) a.ativo = ativo ? 1 : 0;
                }
            })
            .catch(e => _toast('Erro: ' + e.message, 'erro'));
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

        // Renderizar variáveis
        const vars = Array.isArray(_alertaAtual.variaveis) ? _alertaAtual.variaveis : [];
        document.getElementById('modal-variaveis-lista').innerHTML = vars.map(v =>
            `<button class="btn btn-sm btn-outline" onclick="EmailAlertasPage.inserirVariavel('{{${v}}}')" style="font-family:monospace;font-size:11px">{{${v}}}</button>`
        ).join('');

        document.getElementById('modal-alerta').style.display = 'block';
        document.body.style.overflow = 'hidden';
    }

    function fecharModalAlerta() {
        document.getElementById('modal-alerta').style.display = 'none';
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
        // Substituir variáveis por valores de exemplo
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

    function resetarTemplate() {
        if (!_alertaAtual) return;
        if (!confirm('Restaurar o template padrão? Suas edições serão perdidas.')) return;
        // Recarregar da API
        fetch(`${API}?acao=alertas_listar`)
            .then(r => r.json())
            .then(d => {
                if (d.sucesso) {
                    const original = d.dados.alertas.find(a => a.id == _alertaAtual.id);
                    if (original) {
                        document.getElementById('modal-corpo').value = original.corpo_html || '';
                        _toast('Template restaurado.', 'sucesso');
                    }
                }
            });
    }

    function salvarAlerta() {
        const id = document.getElementById('modal-alerta-id').value;
        if (!id) return;

        const form = new FormData();
        form.append('acao',              'alerta_salvar');
        form.append('id',                id);
        form.append('assunto',           document.getElementById('modal-assunto').value);
        form.append('corpo_html',        document.getElementById('modal-corpo').value);
        form.append('destinatario_tipo', document.getElementById('modal-dest-tipo').value);
        form.append('destinatario_email',document.getElementById('modal-dest-email').value);
        form.append('cc_emails',         document.getElementById('modal-cc').value);

        fetch(API, { method: 'POST', body: form })
            .then(r => r.json())
            .then(d => {
                _toast(d.mensagem, d.sucesso ? 'sucesso' : 'erro');
                if (d.sucesso) {
                    fecharModalAlerta();
                    _carregarAlertas();
                }
            })
            .catch(e => _toast('Erro: ' + e.message, 'erro'));
    }

    // ============================================================
    // LOG DE ENVIOS
    // ============================================================
    function carregarLogs() {
        const status = document.getElementById('log-filtro-status')?.value || '';
        const tipo   = document.getElementById('log-filtro-tipo')?.value   || '';
        const busca  = document.getElementById('log-busca')?.value         || '';
        const params = new URLSearchParams({ acao: 'log_listar', pagina: _logPagina, status, tipo, busca });

        fetch(`${API}?${params}`)
            .then(r => r.json())
            .then(d => {
                if (d.sucesso) _renderizarLogs(d.dados);
            })
            .catch(e => console.error('[EmailAlertas] Erro ao carregar logs:', e));
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
                ? '<span class="badge-success"><i class="fas fa-check"></i> Enviado</span>'
                : l.status === 'erro'
                ? '<span class="badge-erro"><i class="fas fa-times"></i> Erro</span>'
                : '<span class="badge-pendente"><i class="fas fa-clock"></i> Pendente</span>';

            const dataFmt = l.data_envio
                ? new Date(l.data_envio).toLocaleString('pt-BR')
                : '—';

            return `<tr>
                <td style="white-space:nowrap">${dataFmt}</td>
                <td><span style="background:#f1f5f9;padding:2px 8px;border-radius:4px;font-size:12px">${l.tipo || '—'}</span>
                    ${l.alerta_codigo ? `<br><small style="color:#94a3b8">${l.alerta_codigo}</small>` : ''}
                </td>
                <td>${_esc(l.destinatario)}</td>
                <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${_esc(l.assunto)}">${_esc(l.assunto)}</td>
                <td>${statusBadge}</td>
                <td>${l.erro_mensagem ? `<span style="color:#dc2626;font-size:12px" title="${_esc(l.erro_mensagem)}"><i class="fas fa-exclamation-circle"></i> Ver erro</span>` : '—'}</td>
            </tr>`;
        }).join('');

        // Paginação
        const pag = document.getElementById('log-paginacao');
        if (pag && dados.total_paginas > 1) {
            let btns = '';
            for (let i = 1; i <= dados.total_paginas; i++) {
                btns += `<button class="btn btn-sm ${i === dados.pagina_atual ? 'btn-primary' : 'btn-outline'}"
                    onclick="EmailAlertasPage._setLogPagina(${i})">${i}</button>`;
            }
            pag.innerHTML = btns;
        } else if (pag) {
            pag.innerHTML = '';
        }
    }

    function _setLogPagina(p) {
        _logPagina = p;
        carregarLogs();
    }

    function limparLogs() {
        if (!confirm('Remover logs com mais de 30 dias? Esta ação não pode ser desfeita.')) return;
        const form = new FormData();
        form.append('acao', 'log_limpar');
        form.append('dias', 30);
        fetch(API, { method: 'POST', body: form })
            .then(r => r.json())
            .then(d => {
                _toast(d.mensagem, d.sucesso ? 'sucesso' : 'erro');
                if (d.sucesso) carregarLogs();
            });
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
        t.style.cssText = `position:fixed;bottom:24px;right:24px;background:${cores[tipo]||'#334155'};
            color:#fff;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:500;
            z-index:99999;box-shadow:0 4px 12px rgba(0,0,0,.2);max-width:360px;line-height:1.4;
            animation:slideIn .3s ease`;
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 4000);
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

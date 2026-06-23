/**
 * ORDENS DE SERVIÇO — JavaScript
 * Módulo completo: Dashboard, Chamados, Configurações, Relatórios
 * Versão: 1.0 | Data: 2026-06-22
 * Padrão: ES6 Module com export init/destroy
 */
'use strict';
// ─── Configuração ─────────────────────────────────────────────────────
const API                = window.location.origin + '/api/api_ordens_servico.php';
const API_MORADORES      = window.location.origin + '/api/api_moradores.php';
const API_USUARIOS       = window.location.origin + '/api/api_usuarios.php';
const API_RH             = window.location.origin + '/api/api_rh_colaboradores.php';
const API_ESTOQUE        = window.location.origin + '/api/api_estoque.php';
const API_USUARIO_LOGADO = window.location.origin + '/api/api_usuario_logado.php';

// Estado global do módulo
const state = {
    abaAtiva: 'dashboard',
    paginaAtual: 1,
    filtros: { status: '', prioridade: '', departamento: '', busca: '' },
    osAtual: null,          // O.S aberta no modal de detalhe
    rhSelecionados: [],     // Colaboradores selecionados no form de nova O.S
    relDados: [],           // Dados do relatório gerado
    departamentos: [],      // Cache de departamentos
    assuntos: [],           // Cache de assuntos
    usuarios: [],           // Cache de usuários
    usuarioLogado: null,    // Usuário logado (para auto-preencher atendente)
};

// ─── Utilitários ──────────────────────────────────────────────────────────
function log(msg, dados) {
    console.log('[OS]', msg, dados || '');
}

function toast(msg, tipo = 'sucesso') {
    const el = document.getElementById('os-toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'os-toast ' + tipo;
    el.style.display = 'block';
    clearTimeout(el._timeout);
    el._timeout = setTimeout(() => { el.style.display = 'none'; }, 4000);
}

async function _post(acao, dados = {}) {
    try {
        const res = await fetch(API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ acao, ...dados })
        });
        const json = await res.json();
        log('POST ' + acao, json);
        return json;
    } catch (e) {
        log('ERRO POST ' + acao, e);
        return { sucesso: false, mensagem: 'Erro de comunicação com o servidor' };
    }
}

async function _get(acao, params = {}) {
    try {
        const qs = new URLSearchParams({ acao, ...params }).toString();
        const res = await fetch(`${API}?${qs}`, {
            credentials: 'include'
        });
        const json = await res.json();
        log('GET ' + acao, json);
        return json;
    } catch (e) {
        log('ERRO GET ' + acao, e);
        return { sucesso: false, mensagem: 'Erro de comunicação com o servidor' };
    }
}

function formatarData(str) {
    if (!str) return '—';
    // Se já vem formatada (dd/mm/yyyy hh:mm) retorna direto
    if (/^\d{2}\/\d{2}\/\d{4}/.test(str)) return str;
    // Formato ISO
    const d = new Date(str);
    if (isNaN(d)) return str;
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatarDataSimples(str) {
    if (!str) return '—';
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str;
    const d = new Date(str + 'T00:00:00');
    if (isNaN(d)) return str;
    return d.toLocaleDateString('pt-BR');
}

function badgeStatus(status) {
    const map = {
        aberto:     '<span class="os-badge os-badge-aberto">Aberto</span>',
        andamento:  '<span class="os-badge os-badge-andamento">Em Andamento</span>',
        finalizado: '<span class="os-badge os-badge-finalizado">Finalizado</span>',
        cancelado:  '<span class="os-badge os-badge-cancelado">Cancelado</span>',
    };
    return map[status] || status;
}

function badgePrioridade(p) {
    const map = {
        urgente: '<span class="os-badge os-badge-urgente">Urgente</span>',
        alta:    '<span class="os-badge os-badge-alta">Alta</span>',
        media:   '<span class="os-badge os-badge-media">Média</span>',
        baixa:   '<span class="os-badge os-badge-baixa">Baixa</span>',
    };
    return map[p] || p;
}

function iconeTipo(tipo) {
    const map = {
        comentario:   'fa-comment',
        andamento:    'fa-spinner',
        solucao:      'fa-check-circle',
        nota_interna: 'fa-sticky-note',
    };
    return map[tipo] || 'fa-circle';
}

// ─── Abas principais ──────────────────────────────────────────────────────
function initAbas() {
    document.querySelectorAll('.os-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            document.querySelectorAll('.os-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.os-tab-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            const content = document.getElementById('os-tab-' + tab);
            if (content) content.classList.add('active');
            state.abaAtiva = tab;
            if (tab === 'dashboard')     carregarDashboard();
            if (tab === 'chamados')      carregarChamados();
            if (tab === 'configuracoes') carregarConfiguracoes();
            if (tab === 'relatorios')    initRelatorios();
        });
    });
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────
async function carregarDashboard() {
    const res = await _get('dashboard_kpis');
    if (!res.sucesso) { toast('Erro ao carregar dashboard', 'erro'); return; }
    const d = res.dados;

    document.getElementById('kpi-abertos').textContent    = d.abertos;
    document.getElementById('kpi-andamento').textContent  = d.andamento;
    document.getElementById('kpi-finalizados').textContent = d.finalizados;
    document.getElementById('kpi-urgentes').textContent   = d.urgentes_abertas;
    document.getElementById('kpi-tempo-medio').textContent = d.tempo_medio_horas + 'h';
    document.getElementById('kpi-prazo-vencido').textContent = d.prazo_vencido;

    // Barras de prioridade
    const total = Object.values(d.por_prioridade).reduce((a, b) => a + b, 0) || 1;
    const barsEl = document.getElementById('prioridade-bars');
    barsEl.innerHTML = ['urgente','alta','media','baixa'].map(p => {
        const qtd = d.por_prioridade[p] || 0;
        const pct = Math.round((qtd / total) * 100);
        const label = { urgente: 'Urgente', alta: 'Alta', media: 'Média', baixa: 'Baixa' }[p];
        return `<div class="os-prioridade-bar-item">
            <div class="os-prioridade-bar-label">${label}</div>
            <div class="os-prioridade-bar-track">
                <div class="os-prioridade-bar-fill ${p}" style="width:${pct}%"></div>
            </div>
            <div class="os-prioridade-bar-count">${qtd}</div>
        </div>`;
    }).join('');

    // Últimas OS
    const listaEl = document.getElementById('ultimas-os-lista');
    if (!d.ultimas_os || !d.ultimas_os.length) {
        listaEl.innerHTML = '<div class="os-loading-text">Nenhuma OS encontrada</div>';
    } else {
        listaEl.innerHTML = d.ultimas_os.map(os => `
            <div class="os-ultima-item" data-id="${os.id}" onclick="osVerDetalhe(${os.id})">
                <div class="os-ultima-numero">${os.numero}</div>
                <div class="os-ultima-titulo">${os.titulo}</div>
                ${badgeStatus(os.status)}
                <div class="os-ultima-data">${os.data_abertura}</div>
            </div>
        `).join('');
    }
}

// ─── CHAMADOS ─────────────────────────────────────────────────────────────
async function carregarChamados(pagina = 1) {
    state.paginaAtual = pagina;
    const params = {
        pagina,
        por_pagina: 20,
        status:      state.filtros.status,
        prioridade:  state.filtros.prioridade,
        departamento: state.filtros.departamento,
        busca:       state.filtros.busca,
    };
    const res = await _get('listar', params);
    const tbody = document.getElementById('tbody-os');
    if (!res.sucesso) {
        tbody.innerHTML = `<tr><td colspan="9" class="os-loading-text">Erro: ${res.mensagem}</td></tr>`;
        return;
    }
    const lista = res.dados.lista || [];
    if (!lista.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="os-loading-text">Nenhuma OS encontrada</td></tr>';
        document.getElementById('os-paginacao').innerHTML = '';
        return;
    }
    tbody.innerHTML = lista.map(os => `
        <tr>
            <td><strong style="color:var(--os-primary)">${os.numero}</strong></td>
            <td>
                <div style="font-weight:600">${os.titulo}</div>
                ${os.assunto_nome ? `<div style="font-size:.78rem;color:#64748b">${os.assunto_nome}</div>` : ''}
            </td>
            <td>
                ${os.morador_nome || '—'}
                ${os.morador_unidade ? `<div style="font-size:.78rem;color:#64748b">Unid. ${os.morador_unidade}</div>` : ''}
            </td>
            <td>${os.departamento || '—'}</td>
            <td>${badgePrioridade(os.prioridade)}</td>
            <td>${badgeStatus(os.status)}</td>
            <td style="white-space:nowrap;font-size:.82rem">${formatarData(os.data_abertura)}</td>
            <td>${os.atendente_nome || '—'}</td>
            <td>
                <button class="os-btn-acao ver" onclick="osVerDetalhe(${os.id})" title="Ver detalhes"><i class="fas fa-eye"></i></button>
                ${os.status !== 'finalizado' ? `<button class="os-btn-acao editar" onclick="osAbrirEditar(${os.id})" title="Editar"><i class="fas fa-edit"></i></button>` : ''}
                <button class="os-btn-acao imprimir" onclick="osImprimir(${os.id})" title="Imprimir / Gerar PDF"><i class="fas fa-print"></i></button>
                ${os.status !== 'finalizado' ? `<button class="os-btn-acao excluir" onclick="osExcluir(${os.id},'${os.numero}')" title="Excluir"><i class="fas fa-trash"></i></button>` : ''}
            </td>
        </tr>
    `).join('');

    // Paginação
    renderizarPaginacao(res.dados.total, res.dados.por_pagina, pagina);
}

function renderizarPaginacao(total, porPagina, atual) {
    const paginas = Math.ceil(total / porPagina);
    const el = document.getElementById('os-paginacao');
    if (paginas <= 1) { el.innerHTML = ''; return; }
    let html = `<button class="os-pag-btn" onclick="osPaginar(${atual - 1})" ${atual === 1 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>`;
    for (let i = 1; i <= paginas; i++) {
        if (i === 1 || i === paginas || Math.abs(i - atual) <= 2) {
            html += `<button class="os-pag-btn ${i === atual ? 'active' : ''}" onclick="osPaginar(${i})">${i}</button>`;
        } else if (Math.abs(i - atual) === 3) {
            html += '<span style="padding:0 4px;color:#94a3b8">...</span>';
        }
    }
    html += `<button class="os-pag-btn" onclick="osPaginar(${atual + 1})" ${atual === paginas ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>`;
    el.innerHTML = html;
}

// Expor para uso inline nos botões
window.osPaginar = (p) => carregarChamados(p);
window.osVerDetalhe = (id) => abrirDetalhe(id);
window.osAbrirEditar = (id) => abrirEditar(id);
window.osExcluir = (id, numero) => excluirOS(id, numero);

// ─── IMPRIMIR / GERAR PDF ─────────────────────────────────────────────────
function imprimirOS(id) {
    const url = window.location.origin + '/frontend/pages/imprimir_os.html?id=' + id;
    window.open(url, '_blank', 'width=900,height=750,scrollbars=yes,resizable=yes');
}
window.osImprimir = (id) => imprimirOS(id);

// ─── FILTROS ──────────────────────────────────────────────────────────────
function initFiltros() {
    document.getElementById('btnFiltrar').addEventListener('click', () => {
        state.filtros.status      = document.getElementById('filtro-status').value;
        state.filtros.prioridade  = document.getElementById('filtro-prioridade').value;
        state.filtros.departamento = document.getElementById('filtro-departamento').value;
        state.filtros.busca       = document.getElementById('filtro-busca').value.trim();
        carregarChamados(1);
    });
    document.getElementById('filtro-busca').addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('btnFiltrar').click();
    });
}

// ─── MODAL: NOVA / EDITAR OS ──────────────────────────────────────────────
function abrirModalNova() {
    limparFormOS();
    document.getElementById('modal-os-titulo').innerHTML = '<i class="fas fa-plus-circle"></i> Nova Ordem de Serviço';
    document.getElementById('row-numero').style.display = 'none';
    // Auto-preencher atendente com o usuário logado
    if (state.usuarioLogado) {
        const sel = document.getElementById('os-atendente');
        if (sel) {
            const opt = Array.from(sel.options).find(o => o.value == state.usuarioLogado.id);
            if (opt) sel.value = opt.value;
        }
    }
    document.getElementById('modal-os').style.display = 'flex';
}

async function abrirEditar(id) {
    const res = await _get('buscar', { id });
    if (!res.sucesso) { toast('Erro ao carregar OS', 'erro'); return; }
    const os = res.dados;
    limparFormOS();
    document.getElementById('modal-os-titulo').innerHTML = '<i class="fas fa-edit"></i> Editar O.S — ' + os.numero;
    document.getElementById('os-id').value = os.id;
    document.getElementById('os-numero-view').value = os.numero;
    document.getElementById('row-numero').style.display = 'flex';
    document.getElementById('os-titulo').value = os.titulo || '';
    document.getElementById('os-prioridade').value = os.prioridade || 'media';
    document.getElementById('os-assunto').value = os.assunto_id || '';
    document.getElementById('os-departamento').value = os.departamento || '';
    document.getElementById('os-horas-estimadas').value = os.horas_estimadas || '';
    document.getElementById('os-data-previsao').value = os.data_previsao || '';
    document.getElementById('os-atendente').value = os.atendente_id || '';
    document.getElementById('os-descricao').innerHTML = os.descricao || '';
    if (os.morador_id) {
        document.getElementById('os-morador-id').value = os.morador_id;
        document.getElementById('os-morador-nome').value = os.morador_nome;
        document.getElementById('os-morador-unidade').value = os.morador_unidade;
        document.getElementById('os-morador-busca').value = os.morador_nome + (os.morador_unidade ? ' — Unid. ' + os.morador_unidade : '');
        const tag = document.getElementById('os-morador-tag');
        tag.innerHTML = `<i class="fas fa-user"></i> ${os.morador_nome} — Unid. ${os.morador_unidade || '?'} <button onclick="limparMorador()">×</button>`;
        tag.style.display = 'inline-flex';
    }
    // RH
    if (os.recursos_humanos && os.recursos_humanos.length) {
        state.rhSelecionados = os.recursos_humanos.map(r => ({
            id: r.colaborador_id, nome: r.colaborador_nome, cargo: r.cargo, departamento: r.departamento
        }));
        renderizarRHTags();
    }
    document.getElementById('modal-os').style.display = 'flex';
}

function limparFormOS() {
    document.getElementById('os-id').value = '';
    document.getElementById('os-titulo').value = '';
    document.getElementById('os-prioridade').value = 'media';
    document.getElementById('os-assunto').value = '';
    document.getElementById('os-departamento').value = '';
    document.getElementById('os-horas-estimadas').value = '';
    document.getElementById('os-data-previsao').value = '';
    document.getElementById('os-atendente').value = '';
    document.getElementById('os-descricao').innerHTML = '';
    document.getElementById('os-morador-id').value = '';
    document.getElementById('os-morador-nome').value = '';
    document.getElementById('os-morador-unidade').value = '';
    document.getElementById('os-morador-busca').value = '';
    document.getElementById('os-morador-tag').style.display = 'none';
    document.getElementById('os-pai-id').value = '';
    document.getElementById('os-pai-busca').value = '';
    document.getElementById('os-pai-tag').style.display = 'none';
    state.rhSelecionados = [];
    renderizarRHTags();
}

async function salvarOS() {
    const id     = document.getElementById('os-id').value;
    const titulo = document.getElementById('os-titulo').value.trim();
    if (!titulo) { toast('Título é obrigatório', 'aviso'); return; }

    // Atendente: pegar o texto correto do select (ignorar "Selecione")
    const atendenteSelect = document.getElementById('os-atendente');
    const atendenteId     = atendenteSelect.value || null;
    const atendenteNome   = atendenteId ? (atendenteSelect.selectedOptions[0]?.text || '') : '';

    const dados = {
        id:               id || undefined,
        titulo,
        prioridade:       document.getElementById('os-prioridade').value,
        assunto_id:       document.getElementById('os-assunto').value || null,
        departamento:     document.getElementById('os-departamento').value || '',
        morador_id:       document.getElementById('os-morador-id').value || null,
        morador_nome:     document.getElementById('os-morador-nome').value || '',
        morador_unidade:  document.getElementById('os-morador-unidade').value || '',
        atendente_id:     atendenteId,
        atendente_nome:   atendenteNome,
        descricao:        document.getElementById('os-descricao').innerHTML,
        os_pai_id:        document.getElementById('os-pai-id').value || null,
        recursos_humanos: state.rhSelecionados,
    };

    log('Salvando O.S', dados);

    const acao = id ? 'editar' : 'criar';
    const btn  = document.getElementById('btnSalvarOS');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

    const res = await _post(acao, dados);
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Salvar O.S';

    if (res.sucesso) {
        toast(res.mensagem || 'O.S salva com sucesso!', 'sucesso');
        fecharModalOS();
        carregarChamados(state.paginaAtual);
        if (state.abaAtiva === 'dashboard') carregarDashboard();
    } else {
        toast(res.mensagem || 'Erro ao salvar O.S', 'erro');
    }
}

async function excluirOS(id, numero) {
    if (!confirm(`Confirma a exclusão da O.S ${numero}?`)) return;
    const res = await _get('excluir', { id });
    if (res.sucesso) {
        toast('O.S excluída com sucesso', 'sucesso');
        carregarChamados(state.paginaAtual);
    } else {
        toast(res.mensagem || 'Erro ao excluir', 'erro');
    }
}

function fecharModalOS() {
    document.getElementById('modal-os').style.display = 'none';
}

// ─── MODAL: DETALHE DA OS ─────────────────────────────────────────────────
async function abrirDetalhe(id) {
    const res = await _get('buscar', { id });
    if (!res.sucesso) { toast('Erro ao carregar OS', 'erro'); return; }
    const os = res.dados;
    state.osAtual = os;

    // Cabeçalho
    document.getElementById('detalhe-titulo').innerHTML = `<i class="fas fa-wrench"></i> ${os.numero} — ${os.titulo}`;
    document.getElementById('detalhe-badges').innerHTML = badgeStatus(os.status) + ' ' + badgePrioridade(os.prioridade);

    // Informações
    document.getElementById('d-numero').textContent     = os.numero;
    document.getElementById('d-status').innerHTML       = badgeStatus(os.status);
    document.getElementById('d-prioridade').innerHTML   = badgePrioridade(os.prioridade);
    document.getElementById('d-assunto').textContent    = os.assunto_nome || '—';
    document.getElementById('d-departamento').textContent = os.departamento || '—';
    document.getElementById('d-morador').textContent    = os.morador_nome || '—';
    document.getElementById('d-unidade').textContent    = os.morador_unidade || '—';
    document.getElementById('d-atendente').textContent  = os.atendente_nome || '—';
    document.getElementById('d-abertura').textContent   = formatarData(os.data_abertura);
    document.getElementById('d-previsao').textContent   = formatarDataSimples(os.data_previsao);
    document.getElementById('d-horas-est').textContent  = os.horas_estimadas ? os.horas_estimadas + 'h' : '—';
    document.getElementById('d-horas-tot').textContent  = os.horas_totais ? os.horas_totais + 'h' : '—';
    document.getElementById('d-descricao').innerHTML    = os.descricao || '—';

    // Mostrar/ocultar formulários conforme status
    const finalizado = os.status === 'finalizado' || os.status === 'cancelado';
    document.getElementById('os-nova-interacao-form').style.display = finalizado ? 'none' : 'block';
    document.getElementById('os-finalizar-form').style.display = 'none';
    document.getElementById('btnIniciarFinalizacao').style.display = finalizado ? 'none' : 'inline-flex';

    // Resetar sub-abas
    document.querySelectorAll('.os-detalhe-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.os-detalhe-content').forEach(c => c.classList.remove('active'));
    document.querySelector('.os-detalhe-tab[data-dtab="info"]').classList.add('active');
    document.getElementById('dtab-info').classList.add('active');

    // Carregar interações
    carregarInteracoes(id);

    // Carregar materiais
    carregarMateriais(id);

    // Carregar equipe
    renderizarEquipe(os.recursos_humanos || []);

    document.getElementById('modal-detalhe').style.display = 'flex';
}

// Sub-abas do detalhe
function initDetalheAbas() {
    document.querySelectorAll('.os-detalhe-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            const dtab = btn.dataset.dtab;
            document.querySelectorAll('.os-detalhe-tab').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.os-detalhe-content').forEach(c => c.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('dtab-' + dtab).classList.add('active');
            if (dtab === 'interacoes' && state.osAtual) carregarInteracoes(state.osAtual.id);
            if (dtab === 'materiais'  && state.osAtual) carregarMateriais(state.osAtual.id);
        });
    });
}

// ─── INTERAÇÕES ───────────────────────────────────────────────────────────
async function carregarInteracoes(osId) {
    const res = await _get('listar_interacoes', { os_id: osId });
    const el = document.getElementById('os-timeline');
    if (!res.sucesso) { el.innerHTML = '<div class="os-loading-text">Erro ao carregar interações</div>'; return; }
    const lista = res.dados || [];
    if (!lista.length) {
        el.innerHTML = '<div class="os-loading-text">Nenhuma interação ainda</div>';
        return;
    }
    el.innerHTML = lista.map(int => `
        <div class="os-timeline-item">
            <div class="os-timeline-icon ${int.tipo}">
                <i class="fas ${iconeTipo(int.tipo)}"></i>
            </div>
            <div class="os-timeline-body">
                <div class="os-timeline-meta">
                    <span class="os-timeline-autor">${int.usuario_nome || 'Sistema'}</span>
                    ${badgeTipoInteracao(int.tipo)}
                    <span class="os-timeline-data">${formatarData(int.criado_em)}</span>
                </div>
                <div class="os-timeline-mensagem">${int.mensagem}</div>
            </div>
        </div>
    `).join('');
    // Scroll para o final
    el.scrollTop = el.scrollHeight;
}

function badgeTipoInteracao(tipo) {
    const map = {
        comentario:   '<span class="os-badge os-badge-andamento" style="font-size:.7rem">Comentário</span>',
        andamento:    '<span class="os-badge os-badge-aberto" style="font-size:.7rem">Andamento</span>',
        solucao:      '<span class="os-badge os-badge-finalizado" style="font-size:.7rem">Solução</span>',
        nota_interna: '<span class="os-badge os-badge-cancelado" style="font-size:.7rem">Nota Interna</span>',
    };
    return map[tipo] || '';
}

async function adicionarInteracao() {
    if (!state.osAtual) return;
    const tipo    = document.getElementById('int-tipo').value;
    const mensagem = document.getElementById('int-mensagem').value.trim();
    if (!mensagem) { toast('Mensagem é obrigatória', 'aviso'); return; }

    const btn = document.getElementById('btnAdicionarInteracao');
    btn.disabled = true;
    const res = await _post('adicionar_interacao', { os_id: state.osAtual.id, tipo, mensagem });
    btn.disabled = false;

    if (res.sucesso) {
        toast('Interação adicionada', 'sucesso');
        document.getElementById('int-mensagem').value = '';
        // Atualizar status local
        if (state.osAtual.status === 'aberto') {
            state.osAtual.status = 'andamento';
            document.getElementById('detalhe-badges').innerHTML = badgeStatus('andamento') + ' ' + badgePrioridade(state.osAtual.prioridade);
        }
        carregarInteracoes(state.osAtual.id);
        carregarChamados(state.paginaAtual);
    } else {
        toast(res.mensagem || 'Erro ao adicionar interação', 'erro');
    }
}

// ─── FINALIZAÇÃO ──────────────────────────────────────────────────────────
function iniciarFinalizacao() {
    document.getElementById('os-nova-interacao-form').style.display = 'none';
    document.getElementById('os-finalizar-form').style.display = 'block';
    document.getElementById('fin-horas').focus();
}

function cancelarFinalizacao() {
    document.getElementById('os-finalizar-form').style.display = 'none';
    document.getElementById('os-nova-interacao-form').style.display = 'block';
}

async function confirmarFinalizacao() {
    if (!state.osAtual) return;
    const horas = parseFloat(document.getElementById('fin-horas').value);
    if (!horas || horas < 0) { toast('Informe as horas totais trabalhadas', 'aviso'); return; }
    const observacao      = document.getElementById('fin-observacao').value.trim();
    const dataPrevisao    = document.getElementById('fin-data-previsao')?.value || null;
    const horasEstimadas  = document.getElementById('fin-horas-estimadas')?.value || null;

    const btn = document.getElementById('btnConfirmarFinalizacao');
    btn.disabled = true;
    const res = await _post('finalizar', {
        os_id: state.osAtual.id,
        horas_totais: horas,
        horas_estimadas: horasEstimadas,
        data_previsao: dataPrevisao,
        observacao_finalizacao: observacao
    });
    btn.disabled = false;

    if (res.sucesso) {
        toast('O.S finalizada com sucesso!', 'sucesso');
        state.osAtual.status = 'finalizado';
        document.getElementById('detalhe-badges').innerHTML = badgeStatus('finalizado') + ' ' + badgePrioridade(state.osAtual.prioridade);
        document.getElementById('os-finalizar-form').style.display = 'none';
        document.getElementById('os-nova-interacao-form').style.display = 'none';
        document.getElementById('d-horas-tot').textContent = horas + 'h';
        if (dataPrevisao) document.getElementById('d-previsao').textContent = dataPrevisao.split('-').reverse().join('/');
        if (horasEstimadas) document.getElementById('d-horas-est').textContent = horasEstimadas + 'h';
        carregarInteracoes(state.osAtual.id);
        carregarChamados(state.paginaAtual);
        if (state.abaAtiva === 'dashboard') carregarDashboard();
    } else {
        toast(res.mensagem || 'Erro ao finalizar O.S', 'erro');
    }
}

// ─── MATERIAIS / ESTOQUE ──────────────────────────────────────────────────
async function carregarMateriais(osId) {
    const res = await _get('listar_materiais', { os_id: osId });
    const el = document.getElementById('lista-materiais-os');
    if (!res.sucesso) { el.innerHTML = '<div class="os-loading-text">Erro ao carregar materiais</div>'; return; }
    const lista = res.dados || [];
    if (!lista.length) {
        el.innerHTML = '<div class="os-loading-text">Nenhum material adicionado</div>';
        return;
    }
    let total = 0;
    const html = `
        <table class="os-mat-table">
            <thead><tr>
                <th>Produto</th><th>Qtd</th><th>Preço Unit.</th><th>Total</th><th>Baixado</th><th></th>
            </tr></thead>
            <tbody>
            ${lista.map(m => {
                const subtotal = m.quantidade * m.preco_unitario;
                total += subtotal;
                return `<tr>
                    <td>${m.produto_nome}</td>
                    <td>${m.quantidade}</td>
                    <td>R$ ${parseFloat(m.preco_unitario).toFixed(2)}</td>
                    <td>R$ ${subtotal.toFixed(2)}</td>
                    <td>${m.estoque_baixado ? '<span class="os-badge os-badge-finalizado">Sim</span>' : '<span class="os-badge os-badge-aberto">Não</span>'}</td>
                    <td>${!m.estoque_baixado && state.osAtual?.status !== 'finalizado' ? `<button class="os-btn-acao excluir" onclick="osRemoverMaterial(${m.id})" title="Remover"><i class="fas fa-trash"></i></button>` : ''}</td>
                </tr>`;
            }).join('')}
            </tbody>
        </table>
        <div class="os-mat-total">Total: R$ ${total.toFixed(2)}</div>
    `;
    el.innerHTML = html;
}

window.osRemoverMaterial = async (id) => {
    if (!confirm('Remover este material?')) return;
    const res = await _get('remover_material', { id });
    if (res.sucesso) {
        toast('Material removido', 'sucesso');
        if (state.osAtual) carregarMateriais(state.osAtual.id);
    } else {
        toast(res.mensagem || 'Erro ao remover', 'erro');
    }
};

async function adicionarMaterial() {
    if (!state.osAtual) return;
    const prodId   = document.getElementById('mat-produto-id').value;
    const prodNome = document.getElementById('mat-produto-nome').value;
    const preco    = parseFloat(document.getElementById('mat-preco-unitario').value) || 0;
    const qtd      = parseFloat(document.getElementById('mat-quantidade').value) || 1;

    if (!prodId) { toast('Selecione um produto', 'aviso'); return; }
    if (qtd <= 0) { toast('Quantidade inválida', 'aviso'); return; }

    const res = await _post('adicionar_material', {
        os_id: state.osAtual.id,
        produto_id: prodId,
        produto_nome: prodNome,
        quantidade: qtd,
        preco_unitario: preco
    });
    if (res.sucesso) {
        toast('Material adicionado', 'sucesso');
        document.getElementById('mat-produto-busca').value = '';
        document.getElementById('mat-produto-id').value = '';
        document.getElementById('mat-produto-nome').value = '';
        document.getElementById('mat-preco-unitario').value = '';
        document.getElementById('mat-quantidade').value = '1';
        carregarMateriais(state.osAtual.id);
    } else {
        toast(res.mensagem || 'Erro ao adicionar material', 'erro');
    }
}

// ─── EQUIPE (RH) ──────────────────────────────────────────────────────────
function renderizarEquipe(lista) {
    const el = document.getElementById('lista-rh-os');
    if (!lista.length) {
        el.innerHTML = '<div class="os-loading-text">Nenhum colaborador vinculado</div>';
        return;
    }
    el.innerHTML = lista.map(r => `
        <div class="os-rh-equipe-item">
            <div class="os-rh-avatar">${(r.colaborador_nome || r.nome || '?')[0].toUpperCase()}</div>
            <div>
                <div class="os-rh-equipe-nome">${r.colaborador_nome || r.nome}</div>
                <div class="os-rh-equipe-cargo">${r.cargo || ''} ${r.departamento ? '— ' + r.departamento : ''}</div>
            </div>
        </div>
    `).join('');
}

// ─── AUTOCOMPLETE: MORADORES ──────────────────────────────────────────────
function initAutocompleteMorador() {
    const input = document.getElementById('os-morador-busca');
    const lista = document.getElementById('os-morador-lista');
    let timer;

    input.addEventListener('input', () => {
        clearTimeout(timer);
        const q = input.value.trim();
        if (q.length < 2) { lista.classList.remove('visible'); return; }
        timer = setTimeout(async () => {
            const res = await fetch(`${API_MORADORES}?nome=${encodeURIComponent(q)}&por_pagina=10`, { credentials: 'include' });
            const json = await res.json();
            const moradores = json.dados?.itens || json.dados?.moradores || json.dados || [];
            if (!moradores.length) { lista.classList.remove('visible'); return; }
            lista.innerHTML = moradores.map(m => `
                <div class="os-autocomplete-item" data-id="${m.id}" data-nome="${m.nome}" data-unidade="${m.unidade || ''}">
                    ${m.nome}
                    <div class="os-ac-sub">Unidade: ${m.unidade || '—'}</div>
                </div>
            `).join('');
            lista.classList.add('visible');
        }, 300);
    });

    lista.addEventListener('click', e => {
        const item = e.target.closest('.os-autocomplete-item');
        if (!item) return;
        document.getElementById('os-morador-id').value = item.dataset.id;
        document.getElementById('os-morador-nome').value = item.dataset.nome;
        document.getElementById('os-morador-unidade').value = item.dataset.unidade;
        input.value = item.dataset.nome + (item.dataset.unidade ? ' — Unid. ' + item.dataset.unidade : '');
        const tag = document.getElementById('os-morador-tag');
        tag.innerHTML = `<i class="fas fa-user"></i> ${item.dataset.nome} — Unid. ${item.dataset.unidade || '?'} <button onclick="limparMorador()">×</button>`;
        tag.style.display = 'inline-flex';
        lista.classList.remove('visible');
    });

    document.addEventListener('click', e => {
        if (!e.target.closest('#os-morador-busca') && !e.target.closest('#os-morador-lista')) {
            lista.classList.remove('visible');
        }
    });
}

window.limparMorador = () => {
    document.getElementById('os-morador-id').value = '';
    document.getElementById('os-morador-nome').value = '';
    document.getElementById('os-morador-unidade').value = '';
    document.getElementById('os-morador-busca').value = '';
    document.getElementById('os-morador-tag').style.display = 'none';
};

// ─── AUTOCOMPLETE: RH COLABORADORES ──────────────────────────────────────
function initAutocompleteRH() {
    const input = document.getElementById('os-rh-busca');
    const lista = document.getElementById('os-rh-lista');
    let timer;

    input.addEventListener('input', () => {
        clearTimeout(timer);
        const q = input.value.trim();
        if (q.length < 2) { lista.classList.remove('visible'); return; }
        timer = setTimeout(async () => {
            const res = await fetch(`${API_RH}?acao=listar&busca=${encodeURIComponent(q)}&ativo=1`, { credentials: 'include' });
            const json = await res.json();
            const colaboradores = json.dados || [];
            if (!colaboradores.length) { lista.classList.remove('visible'); return; }
            lista.innerHTML = colaboradores.map(c => `
                <div class="os-autocomplete-item" data-id="${c.id}" data-nome="${c.nome}" data-cargo="${c.cargo || ''}" data-dep="${c.departamento || ''}">
                    ${c.nome}
                    <div class="os-ac-sub">${c.cargo || ''} ${c.departamento ? '— ' + c.departamento : ''}</div>
                </div>
            `).join('');
            lista.classList.add('visible');
        }, 300);
    });

    lista.addEventListener('click', e => {
        const item = e.target.closest('.os-autocomplete-item');
        if (!item) return;
        const id = parseInt(item.dataset.id);
        if (state.rhSelecionados.find(r => r.id === id)) {
            toast('Colaborador já adicionado', 'aviso');
        } else {
            state.rhSelecionados.push({
                id, nome: item.dataset.nome, cargo: item.dataset.cargo, departamento: item.dataset.dep
            });
            renderizarRHTags();
        }
        input.value = '';
        lista.classList.remove('visible');
    });

    document.addEventListener('click', e => {
        if (!e.target.closest('#os-rh-busca') && !e.target.closest('#os-rh-lista')) {
            lista.classList.remove('visible');
        }
    });
}

function renderizarRHTags() {
    const el = document.getElementById('os-rh-tags');
    el.innerHTML = state.rhSelecionados.map((r, i) => `
        <div class="os-rh-tag">
            <i class="fas fa-user"></i> ${r.nome}
            <button onclick="osRemoverRH(${i})">×</button>
        </div>
    `).join('');
}

window.osRemoverRH = (i) => {
    state.rhSelecionados.splice(i, 1);
    renderizarRHTags();
};

// ─── AUTOCOMPLETE: PRODUTOS (ESTOQUE) ─────────────────────────────────────
function initAutocompleteProdutos() {
    const input = document.getElementById('mat-produto-busca');
    const lista = document.getElementById('mat-produto-lista');
    let timer;

    input.addEventListener('input', () => {
        clearTimeout(timer);
        const q = input.value.trim();
        if (q.length < 2) { lista.classList.remove('visible'); return; }
        timer = setTimeout(async () => {
            const res = await fetch(`${API_ESTOQUE}?action=produtos&busca=${encodeURIComponent(q)}`, { credentials: 'include' });
            const json = await res.json();
            const produtos = json.dados || [];
            if (!produtos.length) { lista.classList.remove('visible'); return; }
            lista.innerHTML = produtos.map(p => `
                <div class="os-autocomplete-item" data-id="${p.id}" data-nome="${p.nome}" data-preco="${p.preco_unitario || 0}">
                    ${p.nome}
                    <div class="os-ac-sub">Estoque: ${p.quantidade_estoque} | R$ ${parseFloat(p.preco_unitario || 0).toFixed(2)}</div>
                </div>
            `).join('');
            lista.classList.add('visible');
        }, 300);
    });

    lista.addEventListener('click', e => {
        const item = e.target.closest('.os-autocomplete-item');
        if (!item) return;
        document.getElementById('mat-produto-id').value = item.dataset.id;
        document.getElementById('mat-produto-nome').value = item.dataset.nome;
        document.getElementById('mat-preco-unitario').value = item.dataset.preco;
        input.value = item.dataset.nome;
        lista.classList.remove('visible');
    });

    document.addEventListener('click', e => {
        if (!e.target.closest('#mat-produto-busca') && !e.target.closest('#mat-produto-lista')) {
            lista.classList.remove('visible');
        }
    });
}

// ─── EDITOR RICH TEXT ─────────────────────────────────────────────────────
function initEditor() {
    document.querySelectorAll('.os-editor-btn[data-cmd]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.execCommand(btn.dataset.cmd, false, null);
            document.getElementById('os-descricao').focus();
        });
    });

    document.getElementById('btnInserirImagem').addEventListener('click', () => {
        document.getElementById('inputImagem').click();
    });

    document.getElementById('inputImagem').addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            document.execCommand('insertImage', false, ev.target.result);
        };
        reader.readAsDataURL(file);
        e.target.value = '';
    });
}

// ─── CARREGAR SELECTS (ASSUNTOS, DEPARTAMENTOS, USUÁRIOS) ─────────────────
async function carregarSelects() {
    // Assuntos
    const resA = await _get('listar_assuntos');
    state.assuntos = resA.sucesso ? (resA.dados || []) : [];
    preencherSelect('os-assunto', state.assuntos, 'id', 'nome', '— Selecione —');
    preencherSelect('hh-assunto', state.assuntos, 'id', 'nome', '— Nenhum —');

    // Departamentos (via RH)
    try {
        const resD = await fetch(`${API_RH}?acao=departamentos`, { credentials: 'include' });
        const jsonD = await resD.json();
        state.departamentos = jsonD.dados || [];
        const opts = state.departamentos.map(d => ({ id: d, nome: d }));
        preencherSelect('os-departamento', opts, 'id', 'nome', '— Selecione —');
        preencherSelect('filtro-departamento', opts, 'id', 'nome', 'Todos');
        preencherSelect('rel-departamento', opts, 'id', 'nome', 'Todos');
        preencherSelect('assunto-departamento', opts, 'id', 'nome', '— Todos —');
    } catch (e) { log('Erro ao carregar departamentos', e); }

    // Usuários (atendentes)
    try {
        const resU = await fetch(`${API_USUARIOS}`, { credentials: 'include' });
        const jsonU = await resU.json();
        state.usuarios = jsonU.dados || [];
        preencherSelect('os-atendente', state.usuarios, 'id', 'nome', '— Selecione —');
    } catch (e) { log('Erro ao carregar usuários', e); }
}

function preencherSelect(id, lista, valKey, labelKey, placeholder) {
    const sel = document.getElementById(id);
    if (!sel) return;
    const atual = sel.value;
    sel.innerHTML = `<option value="">${placeholder}</option>` +
        lista.map(item => `<option value="${item[valKey]}">${item[labelKey]}</option>`).join('');
    if (atual) sel.value = atual;
}

// ─── CONFIGURAÇÕES ────────────────────────────────────────────────────────
async function carregarConfiguracoes() {
    carregarAssuntos();
    carregarConfigHH();
}

async function carregarAssuntos() {
    const res = await _get('listar_assuntos', { ativo: '' });
    const el = document.getElementById('lista-assuntos');
    if (!res.sucesso) { el.innerHTML = '<div class="os-loading-text">Erro ao carregar</div>'; return; }
    const lista = res.dados || [];
    if (!lista.length) { el.innerHTML = '<div class="os-loading-text">Nenhum assunto cadastrado</div>'; return; }
    el.innerHTML = lista.map(a => `
        <div class="os-lista-item">
            <div class="os-lista-item-info">
                <div class="os-lista-item-nome">${a.nome}</div>
                <div class="os-lista-item-sub">${a.departamento || 'Todos os departamentos'} ${!a.ativo ? '— <em>Inativo</em>' : ''}</div>
            </div>
            <div class="os-lista-item-acoes">
                <button class="os-btn-acao editar" onclick="osEditarAssunto(${a.id})" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="os-btn-acao excluir" onclick="osExcluirAssunto(${a.id},'${a.nome}')" title="Excluir"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `).join('');
}

async function carregarConfigHH() {
    const res = await _get('listar_config');
    const el = document.getElementById('lista-config-hh');
    if (!res.sucesso) { el.innerHTML = '<div class="os-loading-text">Erro ao carregar</div>'; return; }
    const lista = res.dados || [];
    if (!lista.length) { el.innerHTML = '<div class="os-loading-text">Nenhuma configuração cadastrada</div>'; return; }
    el.innerHTML = lista.map(c => `
        <div class="os-lista-item">
            <div class="os-lista-item-info">
                <div class="os-lista-item-nome">${c.descricao}</div>
                <div class="os-lista-item-sub">
                    ${c.assunto_nome ? 'Assunto: ' + c.assunto_nome + ' | ' : ''}
                    ${c.horas_estimadas}h estimadas
                    ${c.custo_hora > 0 ? ' | R$ ' + parseFloat(c.custo_hora).toFixed(2) + '/h' : ''}
                </div>
            </div>
            <div class="os-lista-item-acoes">
                <button class="os-btn-acao editar" onclick="osEditarConfigHH(${c.id})" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="os-btn-acao excluir" onclick="osExcluirConfigHH(${c.id})" title="Excluir"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `).join('');
}

// Modal Assunto
window.osEditarAssunto = async (id) => {
    const res = await _get('listar_assuntos', { ativo: '' });
    const assunto = (res.dados || []).find(a => a.id == id);
    if (!assunto) return;
    document.getElementById('assunto-id').value = assunto.id;
    document.getElementById('assunto-nome').value = assunto.nome;
    document.getElementById('assunto-descricao').value = assunto.descricao || '';
    document.getElementById('assunto-departamento').value = assunto.departamento || '';
    document.getElementById('modal-assunto-titulo').innerHTML = '<i class="fas fa-edit"></i> Editar Assunto';
    document.getElementById('modal-assunto').style.display = 'flex';
};

window.osExcluirAssunto = async (id, nome) => {
    if (!confirm(`Excluir assunto "${nome}"?`)) return;
    const res = await _get('excluir_assunto', { id });
    if (res.sucesso) { toast('Assunto excluído', 'sucesso'); carregarAssuntos(); carregarSelects(); }
    else toast(res.mensagem || 'Erro ao excluir', 'erro');
};

async function salvarAssunto() {
    const id   = document.getElementById('assunto-id').value;
    const nome = document.getElementById('assunto-nome').value.trim();
    if (!nome) { toast('Nome é obrigatório', 'aviso'); return; }
    const dados = {
        id: id || undefined,
        nome,
        descricao:    document.getElementById('assunto-descricao').value.trim(),
        departamento: document.getElementById('assunto-departamento').value,
    };
    const acao = id ? 'editar_assunto' : 'criar_assunto';
    const res = await _post(acao, dados);
    if (res.sucesso) {
        toast('Assunto salvo', 'sucesso');
        document.getElementById('modal-assunto').style.display = 'none';
        carregarAssuntos();
        carregarSelects();
    } else {
        toast(res.mensagem || 'Erro ao salvar', 'erro');
    }
}

// Modal Config HH
window.osEditarConfigHH = async (id) => {
    const res = await _get('listar_config');
    const config = (res.dados || []).find(c => c.id == id);
    if (!config) return;
    document.getElementById('hh-id').value = config.id;
    document.getElementById('hh-assunto').value = config.assunto_id || '';
    document.getElementById('hh-descricao').value = config.descricao;
    document.getElementById('hh-horas').value = config.horas_estimadas;
    document.getElementById('hh-custo').value = config.custo_hora;
    document.getElementById('modal-hh-titulo').innerHTML = '<i class="fas fa-edit"></i> Editar Configuração';
    document.getElementById('modal-config-hh').style.display = 'flex';
};

window.osExcluirConfigHH = async (id) => {
    if (!confirm('Excluir esta configuração?')) return;
    const res = await _get('excluir_config', { id });
    if (res.sucesso) { toast('Configuração excluída', 'sucesso'); carregarConfigHH(); }
    else toast(res.mensagem || 'Erro ao excluir', 'erro');
};

async function salvarConfigHH() {
    const id = document.getElementById('hh-id').value;
    const descricao = document.getElementById('hh-descricao').value.trim();
    if (!descricao) { toast('Descrição é obrigatória', 'aviso'); return; }
    const dados = {
        id: id || undefined,
        assunto_id:     document.getElementById('hh-assunto').value || null,
        descricao,
        horas_estimadas: parseFloat(document.getElementById('hh-horas').value) || 1,
        custo_hora:     parseFloat(document.getElementById('hh-custo').value) || 0,
    };
    const res = await _post('salvar_config', dados);
    if (res.sucesso) {
        toast('Configuração salva', 'sucesso');
        document.getElementById('modal-config-hh').style.display = 'none';
        carregarConfigHH();
    } else {
        toast(res.mensagem || 'Erro ao salvar', 'erro');
    }
}

// ─── RELATÓRIOS ───────────────────────────────────────────────────────────
function initRelatorios() {
    // Preencher data padrão (mês atual)
    const hoje = new Date();
    const ini = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
    document.getElementById('rel-data-inicio').value = ini.toISOString().split('T')[0];
    document.getElementById('rel-data-fim').value    = hoje.toISOString().split('T')[0];
}

async function gerarRelatorio() {
    const dataIni = document.getElementById('rel-data-inicio').value;
    const dataFim = document.getElementById('rel-data-fim').value;
    const status  = document.getElementById('rel-status').value;
    const dep     = document.getElementById('rel-departamento').value;

    // Buscar todas as OS no período
    const params = { por_pagina: 1000, pagina: 1 };
    if (status) params.status = status;
    if (dep)    params.departamento = dep;

    const res = await _get('listar', params);
    if (!res.sucesso) { toast('Erro ao gerar relatório', 'erro'); return; }

    let lista = res.dados.lista || [];

    // Filtrar por data no frontend
    if (dataIni || dataFim) {
        lista = lista.filter(os => {
            const d = new Date(os.data_abertura);
            if (dataIni && d < new Date(dataIni)) return false;
            if (dataFim && d > new Date(dataFim + 'T23:59:59')) return false;
            return true;
        });
    }

    state.relDados = lista;

    // KPIs
    const total     = lista.length;
    const finalizadas = lista.filter(o => o.status === 'finalizado').length;
    const abertas   = lista.filter(o => o.status === 'aberto' || o.status === 'andamento').length;
    const horas     = lista.reduce((s, o) => s + (parseFloat(o.horas_totais) || 0), 0);

    document.getElementById('rel-total').textContent      = total;
    document.getElementById('rel-finalizadas').textContent = finalizadas;
    document.getElementById('rel-abertas').textContent    = abertas;
    document.getElementById('rel-horas').textContent      = horas.toFixed(1) + 'h';

    document.getElementById('rel-kpis').style.display = 'flex';
    document.getElementById('rel-tabela-wrapper').style.display = 'block';
    document.getElementById('rel-acoes').style.display = 'flex';

    // Tabela
    const tbody = document.getElementById('tbody-relatorio');
    if (!lista.length) {
        tbody.innerHTML = '<tr><td colspan="9" class="os-loading-text">Nenhuma OS no período</td></tr>';
        return;
    }
    tbody.innerHTML = lista.map(os => `
        <tr>
            <td><strong style="color:var(--os-primary)">${os.numero}</strong></td>
            <td>${os.titulo}</td>
            <td>${os.departamento || '—'}</td>
            <td>${badgePrioridade(os.prioridade)}</td>
            <td>${badgeStatus(os.status)}</td>
            <td style="white-space:nowrap;font-size:.82rem">${formatarData(os.data_abertura)}</td>
            <td style="white-space:nowrap;font-size:.82rem">${os.data_finalizacao ? formatarData(os.data_finalizacao) : '—'}</td>
            <td>${os.horas_totais ? os.horas_totais + 'h' : '—'}</td>
            <td>${os.atendente_nome || '—'}</td>
        </tr>
    `).join('');
}

function exportarCSV() {
    if (!state.relDados.length) { toast('Gere o relatório primeiro', 'aviso'); return; }
    const cabecalho = ['Número','Título','Departamento','Prioridade','Status','Abertura','Finalização','Horas','Atendente'];
    const linhas = state.relDados.map(os => [
        os.numero, os.titulo, os.departamento || '', os.prioridade, os.status,
        formatarData(os.data_abertura), os.data_finalizacao ? formatarData(os.data_finalizacao) : '',
        os.horas_totais || '', os.atendente_nome || ''
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = '\uFEFF' + [cabecalho.join(','), ...linhas].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ordens_servico_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ─── BUSCA DE OS PAI ──────────────────────────────────────────────────────
function initBuscaOSPai() {
    const input = document.getElementById('os-pai-busca');
    let timer;
    input.addEventListener('input', () => {
        clearTimeout(timer);
        const q = input.value.trim();
        if (q.length < 3) return;
        timer = setTimeout(async () => {
            const res = await _get('listar', { busca: q, por_pagina: 5 });
            const lista = res.dados?.lista || [];
            if (!lista.length) return;
            // Usar a primeira que bater exato pelo número
            const match = lista.find(o => o.numero.toLowerCase() === q.toLowerCase());
            if (match) {
                document.getElementById('os-pai-id').value = match.id;
                const tag = document.getElementById('os-pai-tag');
                tag.innerHTML = `<i class="fas fa-link"></i> ${match.numero} — ${match.titulo} <button onclick="limparOSPai()">×</button>`;
                tag.style.display = 'inline-flex';
            }
        }, 500);
    });
}

window.limparOSPai = () => {
    document.getElementById('os-pai-id').value = '';
    document.getElementById('os-pai-busca').value = '';
    document.getElementById('os-pai-tag').style.display = 'none';
};

// ─── INICIALIZAÇÃO ────────────────────────────────────────────────────────
function init_modulo() {
    log('Iniciando módulo Ordens de Serviço');

    initAbas();
    initFiltros();
    initEditor();
    initAutocompleteMorador();
    initAutocompleteRH();
    initAutocompleteProdutos();
    initDetalheAbas();
    initBuscaOSPai();

    // Botão Nova OS
    document.getElementById('btnNovaOS').addEventListener('click', () => {
        abrirModalNova();
    });

    // Botões do modal OS
    document.getElementById('btnSalvarOS').addEventListener('click', salvarOS);
    document.getElementById('btnCancelarOS').addEventListener('click', fecharModalOS);
    document.getElementById('btnFecharModalOS').addEventListener('click', fecharModalOS);

    // Fechar modal ao clicar no overlay
    document.getElementById('modal-os').addEventListener('click', e => {
        if (e.target === document.getElementById('modal-os')) fecharModalOS();
    });

    // Botões do modal detalhe
    document.getElementById('btnFecharDetalhe').addEventListener('click', () => {
        document.getElementById('modal-detalhe').style.display = 'none';
    });
    document.getElementById('btnFecharDetalhe2').addEventListener('click', () => {
        document.getElementById('modal-detalhe').style.display = 'none';
    });
    document.getElementById('btnEditarOS').addEventListener('click', () => {
        if (state.osAtual) {
            document.getElementById('modal-detalhe').style.display = 'none';
            abrirEditar(state.osAtual.id);
        }
    });
    document.getElementById('modal-detalhe').addEventListener('click', e => {
        if (e.target === document.getElementById('modal-detalhe')) {
            document.getElementById('modal-detalhe').style.display = 'none';
        }
    });

    // Interações
    document.getElementById('btnAdicionarInteracao').addEventListener('click', adicionarInteracao);
    document.getElementById('btnIniciarFinalizacao').addEventListener('click', iniciarFinalizacao);
    document.getElementById('btnCancelarFinalizacao').addEventListener('click', cancelarFinalizacao);
    document.getElementById('btnConfirmarFinalizacao').addEventListener('click', confirmarFinalizacao);

    // Materiais
    document.getElementById('btnAdicionarMaterial').addEventListener('click', adicionarMaterial);

    // Modal Assunto
    document.getElementById('btnNovoAssunto').addEventListener('click', () => {
        document.getElementById('assunto-id').value = '';
        document.getElementById('assunto-nome').value = '';
        document.getElementById('assunto-descricao').value = '';
        document.getElementById('assunto-departamento').value = '';
        document.getElementById('modal-assunto-titulo').innerHTML = '<i class="fas fa-tag"></i> Novo Assunto';
        document.getElementById('modal-assunto').style.display = 'flex';
    });
    document.getElementById('btnSalvarAssunto').addEventListener('click', salvarAssunto);
    document.getElementById('btnCancelarAssunto').addEventListener('click', () => {
        document.getElementById('modal-assunto').style.display = 'none';
    });
    document.getElementById('btnFecharModalAssunto').addEventListener('click', () => {
        document.getElementById('modal-assunto').style.display = 'none';
    });
    document.getElementById('modal-assunto').addEventListener('click', e => {
        if (e.target === document.getElementById('modal-assunto')) {
            document.getElementById('modal-assunto').style.display = 'none';
        }
    });

    // Modal Config HH
    document.getElementById('btnNovaConfig').addEventListener('click', () => {
        document.getElementById('hh-id').value = '';
        document.getElementById('hh-assunto').value = '';
        document.getElementById('hh-descricao').value = '';
        document.getElementById('hh-horas').value = '1';
        document.getElementById('hh-custo').value = '0';
        document.getElementById('modal-hh-titulo').innerHTML = '<i class="fas fa-user-clock"></i> Nova Configuração';
        document.getElementById('modal-config-hh').style.display = 'flex';
    });
    document.getElementById('btnSalvarHH').addEventListener('click', salvarConfigHH);
    document.getElementById('btnCancelarHH').addEventListener('click', () => {
        document.getElementById('modal-config-hh').style.display = 'none';
    });
    document.getElementById('btnFecharModalHH').addEventListener('click', () => {
        document.getElementById('modal-config-hh').style.display = 'none';
    });
    document.getElementById('modal-config-hh').addEventListener('click', e => {
        if (e.target === document.getElementById('modal-config-hh')) {
            document.getElementById('modal-config-hh').style.display = 'none';
        }
    });

    // Relatórios
    document.getElementById('btnGerarRelatorio').addEventListener('click', gerarRelatorio);
    document.getElementById('btnExportarCSV').addEventListener('click', exportarCSV);

    // Carregar dados iniciais — primeiro busca o usuário logado para auto-preencher o atendente
    fetch(API_USUARIO_LOGADO, { credentials: 'include' })
        .then(r => r.json())
        .then(json => {
            if (json.sucesso && json.usuario) {
                state.usuarioLogado = json.usuario;
                log('Usuário logado:', json.usuario.nome);
            }
        })
        .catch(e => log('Erro ao buscar usuário logado', e))
        .finally(() => {
            carregarSelects().then(() => {
                // Após carregar selects, auto-preencher o atendente no select
                if (state.usuarioLogado) {
                    const sel = document.getElementById('os-atendente');
                    if (sel) {
                        const opt = Array.from(sel.options).find(o => o.value == state.usuarioLogado.id);
                        if (opt) sel.value = opt.value;
                    }
                }
                carregarDashboard();
            });
        });

    log('Módulo Ordens de Serviço inicializado');
}

 // ─── Lifecycle ES6 Module ─────────────────────────────────────────────────────
export function init() {
// O router chama init() após injetar o HTML
init_modulo();
}
export function destroy() {
log('Destruindo módulo Ordens de Serviço');
// Remover globals expostos
['osPaginar','osVerDetalhe','osAbrirEditar','osExcluir','osRemoverMaterial',
 'osRemoverRH','osEditarAssunto','osExcluirAssunto','osEditarConfigHH','osExcluirConfigHH',
 'limparMorador','limparOSPai'].forEach(k => { if (window[k]) delete window[k]; });
if (window.OrdensServico) delete window.OrdensServico;
}

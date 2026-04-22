/**
 * Módulo: Recursos Humanos
 * Abas: Colaboradores | Registro de Ponto | Escala | Relatórios
 */

// ── Estado ─────────────────────────────────────────────────────────────────────
let _state = {
    colaboradorAtual : null,
    periodoAtual     : null,
    lancamentos      : [],
    escalaDias       : ['seg','ter','qua','qui','sex'],
};

const RH_DEFAULT_AVATAR = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='110' height='110' viewBox='0 0 110 110'%3E%3Ccircle cx='55' cy='55' r='55' fill='%23e2e8f0'/%3E%3Ccircle cx='55' cy='42' r='18' fill='%2394a3b8'/%3E%3Cellipse cx='55' cy='85' rx='28' ry='20' fill='%2394a3b8'/%3E%3C/svg%3E";

// ── Ciclo de vida ─────────────────────────────────────────────────────────────
export async function init() {
    window.ModuleRHDefaultAvatar = RH_DEFAULT_AVATAR;
    _setupTabs();
    _setupColaboradores();
    _setupPonto();
    _setupEscala();
    _setupRelatorios();
    _popularSelects();

    window.ModuleRH = {
        editarColaborador : _editarColaborador,
        excluirColaborador: _excluirColaborador,
        abrirPontoColab   : _abrirPontoColab,
        salvarLinhaPonto  : _salvarLinhaPonto,
        gerarRelatorio    : _gerarRelatorio,
        imprimirRelatorio : _imprimirRelatorio,
        editarEscala      : _editarEscala,
        excluirEscala     : _excluirEscala,
    };
}

export function destroy() {
    delete window.ModuleRH;
    delete window.ModuleRHDefaultAvatar;
}

// ── Abas ──────────────────────────────────────────────────────────────────────
function _setupTabs() {
    document.querySelectorAll('.page-recursos-humanos .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.page-recursos-humanos .tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.page-recursos-humanos .tab-content').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('tab-' + btn.dataset.tab)?.classList.add('active');
        });
    });
}

// ── Toast helper ──────────────────────────────────────────────────────────────
function _toast(msg, type = 'info') {
    const colors = { success: '#16a34a', error: '#dc2626', info: '#667eea' };
    const t = Object.assign(document.createElement('div'), {
        textContent: msg,
        style: `position:fixed;bottom:24px;right:24px;z-index:9999;padding:12px 20px;
                border-radius:8px;color:#fff;font-size:14px;font-weight:500;
                background:${colors[type]||colors.info};box-shadow:0 4px 12px rgba(0,0,0,.2);
                animation:fadeIn .3s ease;`,
    });
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3500);
}

function _setFormStatus(msg = '', type = 'info') {
    const el = document.getElementById('rh-form-status');
    if (!el) return;

    if (!msg) {
        el.style.display = 'none';
        el.innerHTML = '';
        return;
    }

    const palette = {
        success: { bg: '#dcfce7', border: '#16a34a', color: '#166534', icon: 'fa-circle-check' },
        error: { bg: '#fee2e2', border: '#dc2626', color: '#991b1b', icon: 'fa-circle-exclamation' },
        info: { bg: '#dbeafe', border: '#2563eb', color: '#1d4ed8', icon: 'fa-circle-info' },
    };
    const config = palette[type] || palette.info;

    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.gap = '10px';
    el.style.padding = '12px 14px';
    el.style.marginBottom = '16px';
    el.style.borderRadius = '10px';
    el.style.border = `1px solid ${config.border}`;
    el.style.background = config.bg;
    el.style.color = config.color;
    el.innerHTML = `<i class="fas ${config.icon}"></i><span>${_esc(msg)}</span>`;
}

async function _fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const raw = await response.text();

    let data = null;
    if (raw) {
        try {
            data = JSON.parse(raw);
        } catch (error) {
            const preview = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180);
            throw new Error(preview || 'Resposta inv\u00e1lida do servidor.');
        }
    }

    if (!response.ok) {
        throw new Error(data?.mensagem || `Erro HTTP ${response.status}`);
    }

    return data || {};
}

// ────────────────────────────────────────────────────────────────────────────
// ABA: COLABORADORES
// ────────────────────────────────────────────────────────────────────────────
function _setupColaboradores() {
    _carregarColaboradores();
    _setFormStatus();

    document.getElementById('btnRhBuscar')?.addEventListener('click', _carregarColaboradores);
    document.getElementById('rh-busca')?.addEventListener('keydown', e => { if (e.key === 'Enter') _carregarColaboradores(); });
    document.getElementById('rh-filtro-ativo')?.addEventListener('change', _carregarColaboradores);

    document.getElementById('btnRhNovoColab')?.addEventListener('click', _limparFormColab);
    document.getElementById('btnRhCancelar')?.addEventListener('click', _limparFormColab);

    const form = document.getElementById('formColaborador');
    if (form) {
        form.noValidate = true;
        form.method = 'post';
        form.action = 'javascript:void(0)';
        form.addEventListener('submit', _salvarColaborador);
    }

    // Foto preview
    document.getElementById('rh-foto-input')?.addEventListener('change', e => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = ev => { document.getElementById('rh-foto-preview').src = ev.target.result; };
            reader.readAsDataURL(file);
        }
    });

    // CEP auto-fill
    document.getElementById('rh-cep')?.addEventListener('blur', _buscarCep);

    // Mask CPF
    document.getElementById('rh-cpf')?.addEventListener('input', e => {
        let v = e.target.value.replace(/\D/g,'');
        if (v.length > 11) v = v.slice(0,11);
        e.target.value = v.replace(/(\d{3})(\d)/, '$1.$2')
                          .replace(/(\d{3})(\d)/, '$1.$2')
                          .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    });
}

async function _carregarColaboradores() {
    const busca  = document.getElementById('rh-busca')?.value ?? '';
    const ativo  = document.getElementById('rh-filtro-ativo')?.value ?? '1';
    const wrap   = document.getElementById('rh-lista-colaboradores');
    if (!wrap) return;
    wrap.innerHTML = '<div class="loading-msg"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';

    try {
        const d = await _fetchJson(`../api/api_rh_colaboradores.php?acao=listar&busca=${encodeURIComponent(busca)}&ativo=${ativo}`, { credentials: 'include' });
        if (!d.sucesso) throw new Error(d.mensagem);
        _renderColaboradores(d.dados ?? []);
    } catch (err) {
        wrap.innerHTML = `<p style="color:#dc2626;padding:16px;"><i class="fas fa-exclamation-triangle"></i> ${err.message}</p>`;
    }
}

function _renderColaboradores(list) {
    const wrap = document.getElementById('rh-lista-colaboradores');
    if (!list.length) { wrap.innerHTML = '<p style="padding:16px;color:var(--text-secondary,#64748b);">Nenhum colaborador encontrado.</p>'; return; }

    wrap.innerHTML = list.map(c => `
        <div class="rh-colab-card">
            <img class="rh-colab-avatar"
                 src="${c.foto_path ? c.foto_path : RH_DEFAULT_AVATAR}"
                 alt="${_esc(c.nome)}"
                 onerror="this.onerror=null;this.src=window.ModuleRHDefaultAvatar||''">
            <div class="rh-colab-info">
                <div class="rh-colab-nome">${_esc(c.nome)}</div>
                <div class="rh-colab-sub">${_esc(c.cargo||'—')} · ${_esc(c.departamento||'—')} · CPF: ${_esc(c.cpf||'—')}</div>
            </div>
            <span class="rh-badge ${c.ativo == 1 ? 'rh-badge-ativo' : 'rh-badge-inativo'}">${c.ativo == 1 ? 'Ativo' : 'Inativo'}</span>
            <div style="display:flex;gap:6px;flex-shrink:0;">
                <button class="action-btn" title="Registrar ponto" onclick='window.ModuleRH.abrirPontoColab(${c.id}, "${_escAttr(c.nome)}")'>
                    <i class="fas fa-clock"></i>
                </button>
                <button class="action-btn" title="Editar" onclick="window.ModuleRH.editarColaborador(${c.id})">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="action-btn" title="Excluir" onclick='window.ModuleRH.excluirColaborador(${c.id}, "${_escAttr(c.nome)}")'>
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

async function _editarColaborador(id) {
    try {
        const d = await _fetchJson(`../api/api_rh_colaboradores.php?acao=obter&id=${id}`, { credentials: 'include' });
        if (!d.sucesso) throw new Error(d.mensagem);
        const c = d.dados;

        document.getElementById('rh-id').value            = c.id;
        document.getElementById('rh-nome').value          = c.nome ?? '';
        document.getElementById('rh-cpf').value           = c.cpf  ?? '';
        document.getElementById('rh-rg').value            = c.rg   ?? '';
        document.getElementById('rh-data-nascimento').value = c.data_nascimento ?? '';
        _setSelect('rh-sexo', c.sexo);
        _setSelect('rh-estado-civil', c.estado_civil);
        document.getElementById('rh-cargo').value         = c.cargo ?? '';
        document.getElementById('rh-departamento').value  = c.departamento ?? '';
        _setSelect('rh-tipo-contrato', c.tipo_contrato);
        document.getElementById('rh-data-admissao').value = c.data_admissao ?? '';
        document.getElementById('rh-data-demissao').value = c.data_demissao ?? '';
        document.getElementById('rh-salario').value       = c.salario ?? '';
        document.getElementById('rh-telefone').value      = c.telefone ?? '';
        document.getElementById('rh-celular').value       = c.celular  ?? '';
        document.getElementById('rh-email').value         = c.email    ?? '';
        document.getElementById('rh-cep').value           = c.cep ?? '';
        document.getElementById('rh-logradouro').value    = c.logradouro ?? '';
        document.getElementById('rh-numero').value        = c.numero ?? '';
        document.getElementById('rh-complemento').value   = c.complemento ?? '';
        document.getElementById('rh-bairro').value        = c.bairro ?? '';
        document.getElementById('rh-cidade').value        = c.cidade ?? '';
        _setSelect('rh-estado', c.estado);
        document.getElementById('rh-banco').value         = c.banco ?? '';
        document.getElementById('rh-agencia').value       = c.agencia ?? '';
        document.getElementById('rh-conta').value         = c.conta ?? '';
        document.getElementById('rh-pix').value           = c.pix ?? '';
        document.getElementById('rh-observacoes').value   = c.observacoes ?? '';

        document.getElementById('rh-foto-preview').src = c.foto_path || RH_DEFAULT_AVATAR;
        _setFormStatus();

        document.getElementById('rh-form-titulo').innerHTML = '<i class="fas fa-edit"></i> Editar Colaborador';
        document.getElementById('btnRhCancelar').style.display = '';
        document.getElementById('rh-form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
        _toast(err.message, 'error');
    }
}

async function _excluirColaborador(id, nome) {
    if (!confirm(`Deseja remover o colaborador "${nome}"?`)) return;
    try {
        const d = await _fetchJson(`../api/api_rh_colaboradores.php?acao=excluir`, {
            method: 'DELETE', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
        });
        _toast(d.mensagem, d.sucesso ? 'success' : 'error');
        if (d.sucesso) _carregarColaboradores();
    } catch (err) { _toast(err.message, 'error'); }
}

async function _salvarColaborador(e) {
    e.preventDefault();
    _setFormStatus();
    const id   = document.getElementById('rh-id').value;
    const acao = id ? 'atualizar' : 'criar';
    const fd   = new FormData(e.target);

    // Adicionar campos manualmente (inputs sem name)
    const campos = ['nome','cpf','rg','data_nascimento','sexo','estado_civil','cargo','departamento',
                    'tipo_contrato','data_admissao','data_demissao','salario','telefone','celular','email',
                    'cep','logradouro','numero','complemento','bairro','cidade','estado',
                    'banco','agencia','conta','pix','observacoes'];
    campos.forEach(c => fd.set(c, document.getElementById('rh-' + c)?.value ?? ''));
    if (id) fd.set('id', id);

    const fotoInput = document.getElementById('rh-foto-input');
    if (fotoInput?.files[0]) fd.set('foto', fotoInput.files[0]);

    const btn = document.getElementById('btnRhSalvar');
    btn.disabled = true;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${id ? 'Salvando...' : 'Cadastrando...'}`;

    try {
        const url = `../api/api_rh_colaboradores.php?acao=${acao}${id ? '&id=' + id : ''}`;
        const d   = await _fetchJson(url, { method: 'POST', credentials: 'include', body: fd });
        _toast(d.mensagem, d.sucesso ? 'success' : 'error');
        if (!d.sucesso) throw new Error(d.mensagem || 'N\u00e3o foi poss\u00edvel salvar o colaborador.');
        _setFormStatus(d.mensagem || 'Colaborador salvo com sucesso.', 'success');
        _limparFormColab({ preserveStatus: true });
        _carregarColaboradores();
        _popularSelects();
    } catch (err) {
        const mensagem = err.message || 'Ocorreu um erro ao salvar o colaborador.';
        _setFormStatus(mensagem, 'error');
        _toast(mensagem, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-save"></i> Salvar Colaborador';
    }
}

function _limparFormColab(options = {}) {
    document.getElementById('formColaborador').reset();
    document.getElementById('rh-id').value = '';
    document.getElementById('rh-foto-preview').src = RH_DEFAULT_AVATAR;
    document.getElementById('rh-foto-input').value = '';
    document.getElementById('rh-form-titulo').innerHTML = '<i class="fas fa-plus-circle"></i> Novo Colaborador';
    document.getElementById('btnRhCancelar').style.display = 'none';
    if (!options.preserveStatus) _setFormStatus();
}

async function _buscarCep() {
    const cep = document.getElementById('rh-cep').value.replace(/\D/g,'');
    if (cep.length !== 8) return;
    try {
        const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const d = await r.json();
        if (d.erro) return;
        document.getElementById('rh-logradouro').value = d.logradouro ?? '';
        document.getElementById('rh-bairro').value     = d.bairro     ?? '';
        document.getElementById('rh-cidade').value     = d.localidade ?? '';
        _setSelect('rh-estado', d.uf);
    } catch {}
}

// ────────────────────────────────────────────────────────────────────────────
// ABA: REGISTRO DE PONTO
// ────────────────────────────────────────────────────────────────────────────
function _setupPonto() {
    const hoje = new Date();
    document.getElementById('ponto-mes').value = String(hoje.getMonth() + 1);
    document.getElementById('ponto-ano').value = String(hoje.getFullYear());

    document.getElementById('btnPontoAbrir')?.addEventListener('click', _abrirPeriodo);
    document.getElementById('btnPontoCriar')?.addEventListener('click', _criarPeriodo);
    document.getElementById('btnPontoVoltar')?.addEventListener('click', _fecharFolha);
    document.getElementById('btnPontoFechar')?.addEventListener('click', _fecharPeriodo);
    document.getElementById('btnPontoReabrir')?.addEventListener('click', _reabrirPeriodo);
}

function _abrirPontoColab(id, nome) {
    // Muda para aba ponto e pré-seleciona colaborador
    document.querySelectorAll('.page-recursos-humanos .tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page-recursos-humanos .tab-content').forEach(t => t.classList.remove('active'));
    document.querySelector('.page-recursos-humanos [data-tab="ponto"]')?.classList.add('active');
    document.getElementById('tab-ponto')?.classList.add('active');
    _setSelect('ponto-colaborador-id', String(id));
    document.getElementById('tab-ponto').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function _abrirPeriodo() {
    const colab_id = document.getElementById('ponto-colaborador-id').value;
    const mes      = document.getElementById('ponto-mes').value;
    const ano      = document.getElementById('ponto-ano').value;
    if (!colab_id) return _toast('Selecione um colaborador', 'error');

    try {
        const r = await fetch(`../api/api_rh_ponto.php?acao=listar_periodos&colaborador_id=${colab_id}`, { credentials: 'include' });
        const d = await r.json();
        if (!d.sucesso) throw new Error(d.mensagem);
        const periodo = (d.dados ?? []).find(p => p.mes == mes && p.ano == ano);
        if (!periodo) return _toast('Período não encontrado. Use o botão + para criar.', 'info');
        _state.periodoAtual = periodo;
        _exibirFolha(periodo);
    } catch (err) { _toast(err.message, 'error'); }
}

async function _criarPeriodo() {
    const colab_id = document.getElementById('ponto-colaborador-id').value;
    const mes      = parseInt(document.getElementById('ponto-mes').value);
    const ano      = parseInt(document.getElementById('ponto-ano').value);
    if (!colab_id) return _toast('Selecione um colaborador', 'error');

    try {
        const r = await fetch(`../api/api_rh_ponto.php?acao=criar_periodo`, {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ colaborador_id: parseInt(colab_id), mes, ano }),
        });
        const d = await r.json();
        _toast(d.mensagem, d.sucesso ? 'success' : 'error');
        if (d.sucesso) _abrirPeriodo();
    } catch (err) { _toast(err.message, 'error'); }
}

async function _exibirFolha(periodo) {
    document.getElementById('ponto-seletor-card').style.display = 'none';
    const folha = document.getElementById('ponto-folha-wrap');
    folha.style.display = '';

    const meses = ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    document.getElementById('ponto-header-nome').textContent = periodo.colaborador_nome ?? '—';
    document.getElementById('ponto-header-meta').innerHTML  =
        `${meses[periodo.mes]}/${periodo.ano} &nbsp;|&nbsp; <span class="status-${periodo.status}">${periodo.status === 'fechado' ? 'Fechado' : 'Em aberto'}</span>`;

    document.getElementById('btnPontoFechar').style.display  = periodo.status === 'aberto'  ? '' : 'none';
    document.getElementById('btnPontoReabrir').style.display = periodo.status === 'fechado' ? '' : 'none';

    _atualizarTotais(periodo);
    await _carregarLancamentos(periodo.id, periodo.status === 'fechado');
}

function _atualizarTotais(p) {
    document.getElementById('pt-trabalhadas').textContent = _minParaHoras(p.total_horas_trabalhadas_min);
    document.getElementById('pt-extras').textContent      = _minParaHoras(p.total_horas_extras_min);
    document.getElementById('pt-atraso').textContent      = _minParaHoras(p.total_atraso_min);
    document.getElementById('pt-faltas').textContent      = p.total_faltas  ?? 0;
    document.getElementById('pt-folgas').textContent      = p.total_folgas  ?? 0;
}

async function _carregarLancamentos(periodo_id, readonly = false) {
    try {
        const r = await fetch(`../api/api_rh_ponto.php?acao=listar_lancamentos&periodo_id=${periodo_id}`, { credentials: 'include' });
        const d = await r.json();
        if (!d.sucesso) throw new Error(d.mensagem);
        _state.lancamentos = d.dados ?? [];
        _renderLancamentos(readonly);
    } catch (err) { _toast(err.message, 'error'); }
}

function _renderLancamentos(readonly) {
    const tbody = document.getElementById('ponto-tbody');
    if (!_state.lancamentos.length) {
        tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;padding:20px;color:var(--text-secondary,#64748b);">Nenhum lançamento</td></tr>';
        return;
    }

    const TIPOS = ['normal','folga','falta','feriado','meio_periodo','afastamento'];
    const diasPt = { Monday:'Segunda', Tuesday:'Terça', Wednesday:'Quarta', Thursday:'Quinta', Friday:'Sexta', Saturday:'Sábado', Sunday:'Domingo' };

    tbody.innerHTML = _state.lancamentos.map(l => {
        const cls = ['folga','falta','feriado'].includes(l.tipo_dia) ? `dia-${l.tipo_dia}` : '';
        const dis  = readonly ? 'disabled' : '';
        const trab = l.horas_trabalhadas_min > 0 ? `<span class="${l.horas_extras_min > 0 ? 'horas-extra' : ''}">${_minParaHoras(l.horas_trabalhadas_min)}</span>` : '—';
        const ext  = l.horas_extras_min > 0 ? `<span class="horas-extra">${_minParaHoras(l.horas_extras_min)}</span>` : '—';
        const atr  = l.atraso_min > 0 ? `<span class="horas-atraso">${_minParaHoras(l.atraso_min)}</span>` : '—';
        const diaName = diasPt[l.dia_semana] ?? l.dia_semana ?? '';

        return `<tr class="${cls}" data-id="${l.id}" data-periodo="${_state.periodoAtual.id}" data-colab="${_state.periodoAtual.colaborador_id}">
            <td>${l.data_fmt}</td>
            <td class="dia-semana">${diaName}</td>
            <td>
                <select onchange="window.ModuleRH.salvarLinhaPonto(this)" data-campo="tipo_dia" ${dis}>
                    ${TIPOS.map(t => `<option value="${t}" ${l.tipo_dia===t?'selected':''}>${_tipoDia(t)}</option>`).join('')}
                </select>
            </td>
            <td><input type="time" value="${l.he||''}" data-campo="hora_entrada" onchange="window.ModuleRH.salvarLinhaPonto(this)" ${dis}></td>
            <td><input type="time" value="${l.has||''}" data-campo="hora_almoco_saida" onchange="window.ModuleRH.salvarLinhaPonto(this)" ${dis}></td>
            <td><input type="time" value="${l.har||''}" data-campo="hora_almoco_retorno" onchange="window.ModuleRH.salvarLinhaPonto(this)" ${dis}></td>
            <td><input type="time" value="${l.hs||''}" data-campo="hora_saida" onchange="window.ModuleRH.salvarLinhaPonto(this)" ${dis}></td>
            <td>${trab}</td>
            <td>${ext}</td>
            <td>${atr}</td>
            <td style="max-width:100px;"><input type="text" value="${_esc(l.observacoes||'')}" placeholder="Obs" data-campo="observacoes" onchange="window.ModuleRH.salvarLinhaPonto(this)" ${dis} style="width:100%;border:1px solid var(--border-color,#e2e8f0);border-radius:5px;padding:4px 6px;font-size:12px;"></td>
            <td></td>
        </tr>`;
    }).join('');
}

async function _salvarLinhaPonto(el) {
    const tr         = el.closest('tr');
    const periodo_id = parseInt(tr.dataset.periodo);
    const colab_id   = parseInt(tr.dataset.colab);
    const data       = _state.lancamentos.find(l => l.id == tr.dataset.id)?.data;
    if (!data) return;

    const campos = {};
    tr.querySelectorAll('[data-campo]').forEach(inp => { campos[inp.dataset.campo] = inp.value; });

    try {
        const r = await fetch('../api/api_rh_ponto.php?acao=salvar_lancamento', {
            method: 'POST', credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ periodo_id, colaborador_id: colab_id, data, ...campos }),
        });
        const d = await r.json();
        if (!d.sucesso) { _toast(d.mensagem, 'error'); return; }
        // Atualizar totais sem re-renderizar tudo
        const calc = d.dados;
        const trabEl = tr.querySelector('td:nth-child(8)');
        const extEl  = tr.querySelector('td:nth-child(9)');
        const atrEl  = tr.querySelector('td:nth-child(10)');
        if (trabEl) trabEl.innerHTML = calc.trabalhadas > 0 ? `<span class="${calc.extras>0?'horas-extra':''}">${_minParaHoras(calc.trabalhadas)}</span>` : '—';
        if (extEl)  extEl.innerHTML  = calc.extras > 0  ? `<span class="horas-extra">${_minParaHoras(calc.extras)}</span>` : '—';
        if (atrEl)  atrEl.innerHTML  = calc.atraso > 0  ? `<span class="horas-atraso">${_minParaHoras(calc.atraso)}</span>` : '—';
        // Recarregar totalizadores do período
        _recarregarTotaisPeriodo(periodo_id);
    } catch (err) { _toast(err.message, 'error'); }
}

async function _recarregarTotaisPeriodo(periodo_id) {
    try {
        const r = await fetch(`../api/api_rh_ponto.php?acao=obter_periodo&id=${periodo_id}`, { credentials: 'include' });
        const d = await r.json();
        if (d.sucesso) { _state.periodoAtual = d.dados; _atualizarTotais(d.dados); }
    } catch {}
}

async function _fecharPeriodo() {
    if (!_state.periodoAtual) return;
    if (!confirm('Fechar este período? Não será mais possível lançar horas.')) return;
    try {
        const r = await fetch(`../api/api_rh_ponto.php?acao=fechar_periodo&id=${_state.periodoAtual.id}`, { method: 'POST', credentials: 'include', headers: {'Content-Type':'application/json'}, body: '{}' });
        const d = await r.json();
        _toast(d.mensagem, d.sucesso ? 'success' : 'error');
        if (d.sucesso) { _state.periodoAtual.status = 'fechado'; _exibirFolha(_state.periodoAtual); }
    } catch (err) { _toast(err.message, 'error'); }
}

async function _reabrirPeriodo() {
    if (!_state.periodoAtual) return;
    try {
        const r = await fetch(`../api/api_rh_ponto.php?acao=reabrir_periodo&id=${_state.periodoAtual.id}`, { method: 'POST', credentials: 'include', headers: {'Content-Type':'application/json'}, body: '{}' });
        const d = await r.json();
        _toast(d.mensagem, d.sucesso ? 'success' : 'error');
        if (d.sucesso) { _state.periodoAtual.status = 'aberto'; _exibirFolha(_state.periodoAtual); }
    } catch (err) { _toast(err.message, 'error'); }
}

function _fecharFolha() {
    _state.periodoAtual = null;
    document.getElementById('ponto-folha-wrap').style.display = 'none';
    document.getElementById('ponto-seletor-card').style.display = '';
}

// ────────────────────────────────────────────────────────────────────────────
// ABA: ESCALA
// ────────────────────────────────────────────────────────────────────────────
function _setupEscala() {
    document.getElementById('btnEscalaCarregar')?.addEventListener('click', _carregarEscalas);
    document.getElementById('btnEscalaNova')?.addEventListener('click', () => {
        _limparFormEscala();
        document.getElementById('escala-form-card').style.display = '';
        document.getElementById('escala-form-card').scrollIntoView({ behavior: 'smooth' });
    });
    document.getElementById('btnEscalaCancelar')?.addEventListener('click', () => {
        document.getElementById('escala-form-card').style.display = 'none';
    });
    document.getElementById('formEscala')?.addEventListener('submit', _salvarEscala);

    // Dias clicáveis
    document.querySelectorAll('.page-recursos-humanos .dia-tag').forEach(tag => {
        tag.addEventListener('click', () => {
            tag.classList.toggle('ativo');
            _state.escalaDias = Array.from(document.querySelectorAll('.page-recursos-humanos .dia-tag.ativo')).map(t => t.dataset.dia);
        });
    });
}

async function _carregarEscalas() {
    const colab_id = document.getElementById('escala-colaborador-id').value;
    if (!colab_id) return _toast('Selecione um colaborador', 'error');

    const wrap = document.getElementById('escala-lista-wrap');
    const list = document.getElementById('escala-lista');
    wrap.style.display = '';
    list.innerHTML = '<div class="loading-msg"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';
    document.getElementById('btnEscalaNova').style.display = '';

    try {
        const r = await fetch(`../api/api_rh_escala.php?acao=listar&colaborador_id=${colab_id}`, { credentials: 'include' });
        const d = await r.json();
        if (!d.sucesso) throw new Error(d.mensagem);
        _renderEscalas(d.dados ?? []);
    } catch (err) { list.innerHTML = `<p style="color:#dc2626;padding:16px;">${err.message}</p>`; }
}

function _renderEscalas(list) {
    const container = document.getElementById('escala-lista');
    if (!list.length) { container.innerHTML = '<p style="padding:16px;color:var(--text-secondary,#64748b);">Nenhuma escala cadastrada.</p>'; return; }

    const diasLabel = { seg:'Seg', ter:'Ter', qua:'Qua', qui:'Qui', sex:'Sex', sab:'Sáb', dom:'Dom' };
    container.innerHTML = list.map(e => {
        const dias = JSON.parse(e.dias_trabalho || '[]');
        const tipoLabel = e.tipo === 'controle_jornada' ? 'Controle de Jornada' : 'Livre';
        return `
        <div class="escala-card">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
                <div>
                    <div style="font-weight:700;font-size:14px;">${_esc(e.nome_escala)}</div>
                    <span class="escala-tipo escala-tipo-${e.tipo}">${tipoLabel}</span>
                </div>
                <div style="display:flex;gap:6px;">
                    <button class="action-btn" onclick="window.ModuleRH.editarEscala(${e.id})"><i class="fas fa-edit"></i></button>
                    <button class="action-btn" onclick="window.ModuleRH.excluirEscala(${e.id})"><i class="fas fa-trash"></i></button>
                </div>
            </div>
            <div style="margin:6px 0 4px;font-size:12px;color:var(--text-secondary,#64748b);">Dias de trabalho:</div>
            <div class="dias-semana-grid" style="pointer-events:none;">
                ${['seg','ter','qua','qui','sex','sab','dom'].map(d => `<span class="dia-tag ${dias.includes(d)?'ativo':''}">${diasLabel[d]}</span>`).join('')}
            </div>
            <div class="escala-horarios" style="margin-top:8px;">
                <span><i class="fas fa-sign-in-alt"></i> ${e.hora_entrada?.slice(0,5)||'—'}</span>
                <span><i class="fas fa-utensils"></i> ${e.hora_almoco_saida?.slice(0,5)||'—'} – ${e.hora_almoco_retorno?.slice(0,5)||'—'}</span>
                <span><i class="fas fa-sign-out-alt"></i> ${e.hora_saida?.slice(0,5)||'—'}</span>
                ${e.tipo==='controle_jornada'?`<span><i class="fas fa-clock"></i> ${Math.floor(e.carga_horaria_diaria_min/60)}h carga / ${e.tolerancia_minutos}min tolerância</span>`:''}
            </div>
        </div>`;
    }).join('');
}

async function _editarEscala(id) {
    try {
        const r = await fetch(`../api/api_rh_escala.php?acao=obter&id=${id}`, { credentials: 'include' });
        const d = await r.json();
        if (!d.sucesso) throw new Error(d.mensagem);
        const e = d.dados;
        document.getElementById('escala-id').value            = e.id;
        document.getElementById('escala-nome').value          = e.nome_escala ?? '';
        _setSelect('escala-tipo', e.tipo);
        document.getElementById('escala-carga-h').value       = Math.round((e.carga_horaria_diaria_min??480)/60*2)/2;
        document.getElementById('escala-tolerancia').value    = e.tolerancia_minutos ?? 10;
        document.getElementById('escala-entrada').value       = (e.hora_entrada??'08:00:00').slice(0,5);
        document.getElementById('escala-almoco-saida').value  = (e.hora_almoco_saida??'12:00:00').slice(0,5);
        document.getElementById('escala-almoco-retorno').value = (e.hora_almoco_retorno??'13:00:00').slice(0,5);
        document.getElementById('escala-saida').value         = (e.hora_saida??'17:00:00').slice(0,5);
        document.getElementById('escala-intervalo').value     = e.intervalo_almoco_min ?? 60;

        const dias = JSON.parse(e.dias_trabalho || '[]');
        document.querySelectorAll('.page-recursos-humanos #escala-dias-grid .dia-tag').forEach(t => {
            t.classList.toggle('ativo', dias.includes(t.dataset.dia));
        });
        _state.escalaDias = dias;

        document.getElementById('escala-form-titulo').innerHTML = '<i class="fas fa-edit"></i> Editar Escala';
        document.getElementById('escala-form-card').style.display = '';
        document.getElementById('escala-form-card').scrollIntoView({ behavior: 'smooth' });
    } catch (err) { _toast(err.message, 'error'); }
}

async function _excluirEscala(id) {
    if (!confirm('Remover esta escala?')) return;
    try {
        const r = await fetch('../api/api_rh_escala.php?acao=excluir', {
            method: 'DELETE', credentials: 'include',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
        });
        const d = await r.json();
        _toast(d.mensagem, d.sucesso ? 'success' : 'error');
        if (d.sucesso) _carregarEscalas();
    } catch (err) { _toast(err.message, 'error'); }
}

async function _salvarEscala(e) {
    e.preventDefault();
    const id   = document.getElementById('escala-id').value;
    const acao = id ? 'atualizar' : 'criar';
    const carga_h = parseFloat(document.getElementById('escala-carga-h').value) || 8;
    const payload = {
        colaborador_id           : parseInt(document.getElementById('escala-colaborador-id').value),
        nome_escala              : document.getElementById('escala-nome').value,
        tipo                     : document.getElementById('escala-tipo').value,
        carga_horaria_diaria_min : Math.round(carga_h * 60),
        dias_trabalho            : _state.escalaDias,
        hora_entrada             : document.getElementById('escala-entrada').value + ':00',
        hora_almoco_saida        : document.getElementById('escala-almoco-saida').value + ':00',
        hora_almoco_retorno      : document.getElementById('escala-almoco-retorno').value + ':00',
        hora_saida               : document.getElementById('escala-saida').value + ':00',
        tolerancia_minutos       : parseInt(document.getElementById('escala-tolerancia').value),
        intervalo_almoco_min     : parseInt(document.getElementById('escala-intervalo').value),
    };
    if (id) payload.id = parseInt(id);

    try {
        const url = `../api/api_rh_escala.php?acao=${acao}${id ? '&id=' + id : ''}`;
        const r   = await fetch(url, { method: 'POST', credentials: 'include', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
        const d   = await r.json();
        _toast(d.mensagem, d.sucesso ? 'success' : 'error');
        if (d.sucesso) { _limparFormEscala(); _carregarEscalas(); }
    } catch (err) { _toast(err.message, 'error'); }
}

function _limparFormEscala() {
    document.getElementById('formEscala').reset();
    document.getElementById('escala-id').value = '';
    document.querySelectorAll('.page-recursos-humanos #escala-dias-grid .dia-tag').forEach(t => {
        t.classList.toggle('ativo', ['seg','ter','qua','qui','sex'].includes(t.dataset.dia));
    });
    _state.escalaDias = ['seg','ter','qua','qui','sex'];
    document.getElementById('escala-form-titulo').innerHTML = '<i class="fas fa-plus-circle"></i> Nova Escala';
    document.getElementById('escala-form-card').style.display = 'none';
}

// ────────────────────────────────────────────────────────────────────────────
// ABA: RELATÓRIOS
// ────────────────────────────────────────────────────────────────────────────
function _setupRelatorios() {
    const hoje = new Date();
    document.getElementById('rel-mes').value = String(hoje.getMonth() + 1);
    document.getElementById('rel-ano').value = String(hoje.getFullYear());
}

async function _gerarRelatorio(tipo) {
    const mes       = document.getElementById('rel-mes').value;
    const ano       = document.getElementById('rel-ano').value;
    const dept      = document.getElementById('rel-departamento').value;
    const colab_id  = document.getElementById('rel-colaborador-id').value;

    const wrap   = document.getElementById('relatorio-resultado');
    const titulo = document.getElementById('relatorio-titulo');
    const body   = document.getElementById('relatorio-conteudo');
    wrap.style.display = '';
    body.innerHTML = '<div class="loading-msg"><i class="fas fa-spinner fa-spin"></i> Gerando relatório...</div>';

    let url, tituloText;

    switch (tipo) {
        case 'totais_horas':
            url = `../api/api_rh_relatorios.php?acao=totais_horas&mes=${mes}&ano=${ano}&departamento=${encodeURIComponent(dept)}`;
            tituloText = `Totais de Horas — ${_nomeMes(mes)}/${ano}`;
            break;
        case 'espelho_ponto':
            if (!colab_id) { _toast('Selecione um colaborador para o espelho', 'error'); return; }
            url = `../api/api_rh_relatorios.php?acao=espelho_ponto&colaborador_id=${colab_id}&mes=${mes}&ano=${ano}`;
            tituloText = `Espelho de Ponto — ${_nomeMes(mes)}/${ano}`;
            break;
        case 'faltas':
            url = `../api/api_rh_relatorios.php?acao=faltas&mes=${mes}&ano=${ano}&departamento=${encodeURIComponent(dept)}`;
            tituloText = `Faltas e Afastamentos — ${_nomeMes(mes)}/${ano}`;
            break;
        case 'horas_extras':
            url = `../api/api_rh_relatorios.php?acao=horas_extras&mes=${mes}&ano=${ano}&departamento=${encodeURIComponent(dept)}`;
            tituloText = `Horas Extras — ${_nomeMes(mes)}/${ano}`;
            break;
        case 'atrasos':
            url = `../api/api_rh_relatorios.php?acao=atrasos&mes=${mes}&ano=${ano}&departamento=${encodeURIComponent(dept)}`;
            tituloText = `Atrasos — ${_nomeMes(mes)}/${ano}`;
            break;
        case 'banco_horas':
            if (!colab_id) { _toast('Selecione um colaborador para o banco de horas', 'error'); return; }
            url = `../api/api_rh_relatorios.php?acao=banco_horas&colaborador_id=${colab_id}&ate_mes=${mes}&ate_ano=${ano}`;
            tituloText = 'Banco de Horas';
            break;
        case 'aniversariantes':
            url = `../api/api_rh_relatorios.php?acao=aniversariantes&mes=${mes}`;
            tituloText = `Aniversariantes de ${_nomeMes(mes)}`;
            break;
        default: return;
    }

    titulo.textContent = tituloText;

    try {
        const r = await fetch(url, { credentials: 'include' });
        const d = await r.json();
        if (!d.sucesso) throw new Error(d.mensagem);
        body.innerHTML = _renderRelatorio(tipo, d.dados);
        wrap.scrollIntoView({ behavior: 'smooth' });
    } catch (err) {
        body.innerHTML = `<p style="color:#dc2626;padding:16px;"><i class="fas fa-exclamation-triangle"></i> ${err.message}</p>`;
    }
}

function _renderRelatorio(tipo, dados) {
    if (tipo === 'totais_horas') {
        if (!dados?.length) return '<p style="padding:16px;color:var(--text-secondary,#64748b);">Nenhum dado encontrado.</p>';
        return `<div class="table-container"><table class="data-table">
            <thead><tr><th>Nome</th><th>Cargo</th><th>Depto</th><th>Contrato</th><th>Trabalhado</th><th>Extra</th><th>Atraso</th><th>Faltas</th><th>Folgas</th><th>Status</th></tr></thead>
            <tbody>${dados.map(r => `<tr>
                <td>${_esc(r.nome)}</td><td>${_esc(r.cargo||'—')}</td><td>${_esc(r.departamento||'—')}</td>
                <td>${r.tipo_contrato?.toUpperCase()||'—'}</td>
                <td>${r.total_horas_trabalhadas_fmt||'—'}</td>
                <td style="color:#16a34a;">${r.total_horas_extras_fmt||'—'}</td>
                <td style="color:#dc2626;">${r.total_atraso_fmt||'—'}</td>
                <td>${r.total_faltas??'—'}</td><td>${r.total_folgas??'—'}</td>
                <td>${r.periodo_status ? `<span class="status-${r.periodo_status}">${r.periodo_status}</span>` : '—'}</td>
            </tr>`).join('')}</tbody></table></div>`;
    }

    if (tipo === 'espelho_ponto') {
        const { cabecalho: c, lancamentos: l } = dados;
        if (!c) return '<p style="padding:16px;">Nenhum dado encontrado.</p>';
        const info = `<div style="background:var(--bg-secondary,#f8fafc);border-radius:10px;padding:14px 18px;margin-bottom:14px;border:1px solid var(--border-color,#e2e8f0);">
            <strong>${_esc(c.nome)}</strong> · ${_esc(c.cargo||'—')} · ${_esc(c.departamento||'—')}
            <div style="margin-top:4px;font-size:12px;color:var(--text-secondary,#64748b);">
                Trabalhado: <strong>${c.total_horas_trabalhadas_fmt||'—'}</strong> |
                Extra: <strong style="color:#16a34a;">${c.total_horas_extras_fmt||'—'}</strong> |
                Atraso: <strong style="color:#dc2626;">${c.total_atraso_fmt||'—'}</strong> |
                Faltas: <strong>${c.total_faltas||0}</strong>
            </div></div>`;
        if (!l?.length) return info + '<p style="padding:16px;">Nenhum lançamento.</p>';
        return info + `<div class="table-container"><table class="data-table">
            <thead><tr><th>Data</th><th>Dia</th><th>Tipo</th><th>Entrada</th><th>Saída Alm.</th><th>Ret. Alm.</th><th>Saída</th><th>Trabalhado</th><th>Extra</th><th>Atraso</th><th>Obs</th></tr></thead>
            <tbody>${l.map(r => `<tr>
                <td>${r.data_fmt}</td><td>${r.dia_semana||'—'}</td><td>${_tipoDia(r.tipo_dia)}</td>
                <td>${r.he||'—'}</td><td>${r.has||'—'}</td><td>${r.har||'—'}</td><td>${r.hs||'—'}</td>
                <td>${r.horas_trab_fmt||'—'}</td>
                <td style="color:#16a34a;">${r.horas_extra_fmt||'—'}</td>
                <td style="color:#dc2626;">${r.atraso_fmt||'—'}</td>
                <td>${_esc(r.observacoes||'')}</td>
            </tr>`).join('')}</tbody></table></div>`;
    }

    if (tipo === 'banco_horas') {
        const { meses, total_acumulado_fmt } = dados;
        if (!meses?.length) return '<p style="padding:16px;">Nenhum dado.</p>';
        return `<div class="table-container"><table class="data-table">
            <thead><tr><th>Mês/Ano</th><th>Trabalhado</th><th>Extras</th><th>Atraso</th><th>Saldo</th><th>Acumulado</th></tr></thead>
            <tbody>${meses.map(m => `<tr>
                <td>${_nomeMes(m.mes)}/${m.ano}</td>
                <td>${_minParaHoras(m.total_horas_trabalhadas_min)}</td>
                <td style="color:#16a34a;">${_minParaHoras(m.total_horas_extras_min)}</td>
                <td style="color:#dc2626;">${_minParaHoras(m.total_atraso_min)}</td>
                <td style="color:${m.saldo_min>=0?'#16a34a':'#dc2626'};">${m.saldo_fmt}</td>
                <td style="color:${m.acumulado_min>=0?'#16a34a':'#dc2626'};font-weight:600;">${m.acumulado_fmt}</td>
            </tr>`).join('')}
            <tr style="font-weight:700;border-top:2px solid var(--border-color,#e2e8f0);">
                <td colspan="5" style="text-align:right;">Total acumulado:</td>
                <td style="color:${total_acumulado_fmt?.startsWith('-')?'#dc2626':'#16a34a'};">${total_acumulado_fmt}</td>
            </tr></tbody></table></div>`;
    }

    if (tipo === 'aniversariantes') {
        if (!dados?.length) return '<p style="padding:16px;">Nenhum aniversariante.</p>';
        return `<div class="table-container"><table class="data-table">
            <thead><tr><th>Data</th><th>Nome</th><th>Cargo</th><th>Departamento</th></tr></thead>
            <tbody>${dados.map(r => `<tr>
                <td>🎂 ${r.aniversario}</td><td>${_esc(r.nome)}</td>
                <td>${_esc(r.cargo||'—')}</td><td>${_esc(r.departamento||'—')}</td>
            </tr>`).join('')}</tbody></table></div>`;
    }

    // Tabela genérica para faltas, extras, atrasos
    if (!dados?.length) return '<p style="padding:16px;color:var(--text-secondary,#64748b);">Nenhum dado encontrado.</p>';

    const keys = Object.keys(dados[0]);
    return `<div class="table-container"><table class="data-table">
        <thead><tr>${keys.map(k => `<th>${k}</th>`).join('')}</tr></thead>
        <tbody>${dados.map(r => `<tr>${keys.map(k => `<td>${r[k]??'—'}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>`;
}

function _imprimirRelatorio() {
    const titulo  = document.getElementById('relatorio-titulo').textContent;
    const conteudo = document.getElementById('relatorio-conteudo').innerHTML;
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${titulo}</title>
        <style>body{font-family:sans-serif;font-size:12px;padding:20px;}table{width:100%;border-collapse:collapse;}
        th,td{border:1px solid #ccc;padding:6px 8px;text-align:left;}th{background:#f0f0f0;font-weight:600;}
        h2{margin-bottom:12px;}</style></head><body>
        <h2>${titulo}</h2>${conteudo}</body></html>`);
    win.document.close();
    win.print();
}

// ────────────────────────────────────────────────────────────────────────────
// SELECTS GLOBAIS
// ────────────────────────────────────────────────────────────────────────────
async function _popularSelects() {
    try {
        const d = await _fetchJson('../api/api_rh_colaboradores.php?acao=listar&ativo=1', { credentials: 'include' });
        if (!d.sucesso) return;
        const opts = d.dados.map(c => `<option value="${c.id}">${_esc(c.nome)}</option>`).join('');
        ['ponto-colaborador-id','escala-colaborador-id','rel-colaborador-id'].forEach(id => {
            const sel = document.getElementById(id);
            if (!sel) return;
            const first = sel.options[0].outerHTML;
            sel.innerHTML = first + opts;
        });
    } catch {}

    try {
        const d = await _fetchJson('../api/api_rh_colaboradores.php?acao=departamentos', { credentials: 'include' });
        if (!d.sucesso) return;
        const sel = document.getElementById('rel-departamento');
        if (sel) sel.innerHTML = '<option value="">Todos</option>' + d.dados.map(dp => `<option value="${_esc(dp)}">${_esc(dp)}</option>`).join('');
    } catch {}
}

// ────────────────────────────────────────────────────────────────────────────
// UTILITÁRIOS
// ────────────────────────────────────────────────────────────────────────────
function _esc(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _escAttr(str) {
    return String(str ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/\r?\n/g, ' ');
}

function _setSelect(id, val) {
    const sel = document.getElementById(id);
    if (sel && val != null) sel.value = val;
}

function _minParaHoras(min) {
    if (!min || min <= 0) return '00:00';
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function _nomeMes(m) {
    return ['','Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][parseInt(m)] ?? '';
}

function _tipoDia(t) {
    const map = { normal:'Normal', folga:'Folga', falta:'Falta', feriado:'Feriado', meio_periodo:'Meio período', afastamento:'Afastamento' };
    return map[t] ?? t;
}

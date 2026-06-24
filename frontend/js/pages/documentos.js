/**
 * documentos.js — GED (Gestão Eletrônica de Documentos)
 * ES Module — AppRouter lifecycle: init() / destroy()
 */

const API = window.location.origin + '/api/api_documentos.php';

// ── Estado ─────────────────────────────────────────────────────────────────
let _deps     = [];
let _grupos   = [];
let _pastas   = [];
let _docPag   = 1;
let _rastroPag= 1;
let _debTimer = null;

// ── Lifecycle ──────────────────────────────────────────────────────────────
export function init() {
    console.log('[Documentos] init()');
    _setupTabs();
    _carregarDeps();
    _carregarGrupos();
    _carregarPastas();
    _carregarDashboard();
    _carregarDocs();

    window.DocumentosPage = {
        trocarAba, buscarDocs, limparFiltrosDocs,
        abrirModalDoc, fecharModalDoc, salvarDoc, onArquivoSelecionado,
        abrirModalDep, fecharModalDep, salvarDep, excluirDep,
        abrirModalGrupo, fecharModalGrupo, salvarGrupo, excluirGrupo,
        abrirModalPasta, fecharModalPasta, salvarPasta, excluirPasta,
        abrirModalComp, fecharModalComp, gerarLink, copiarLink,
        desativarLink, baixarDoc, excluirDoc, editarDoc,
        carregarRastreabilidade, _setRastroPag, _setDocPag,
    };
}

export function destroy() {
    console.log('[Documentos] destroy()');
    delete window.DocumentosPage;
    _deps = []; _grupos = []; _pastas = [];
    _docPag = 1; _rastroPag = 1;
    clearTimeout(_debTimer);
}

// ── Fetch helper ───────────────────────────────────────────────────────────
async function _fetch(url, opts = {}) {
    const r = await fetch(url, { credentials: 'include', ...opts });
    const raw = await r.text();
    let data = null;
    if (raw.trim()) {
        try { data = JSON.parse(raw); } catch (_) {
            const preview = raw.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,200);
            throw new Error(preview || 'Resposta inválida do servidor');
        }
    }
    if (!r.ok) throw new Error(data?.mensagem || `Erro HTTP ${r.status}`);
    return data || {};
}

// ── Tabs ───────────────────────────────────────────────────────────────────
function _setupTabs() {
    document.querySelectorAll('.page-documentos .tab-btn').forEach(btn => {
        btn.addEventListener('click', () => trocarAba(btn.dataset.tab));
    });
}

function trocarAba(aba) {
    document.querySelectorAll('.page-documentos .tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page-documentos .tab-content').forEach(c => c.classList.remove('active'));
    const btn = document.querySelector(`.page-documentos .tab-btn[data-tab="${aba}"]`);
    const cnt = document.getElementById(`tab-${aba}`);
    if (btn) btn.classList.add('active');
    if (cnt) cnt.classList.add('active');

    if (aba === 'documentos')        _carregarDocs();
    if (aba === 'departamentos')     _renderDeps();
    if (aba === 'grupos')            _renderGrupos();
    if (aba === 'pastas')            _renderPastas();
    if (aba === 'compartilhamentos') _carregarCompartilhamentos();
    if (aba === 'rastreabilidade')   carregarRastreabilidade();
}

// ── Dashboard KPIs ─────────────────────────────────────────────────────────
async function _carregarDashboard() {
    try {
        const d = await _fetch(`${API}?acao=dashboard_stats`);
        if (!d.sucesso) return;
        const s = d.dados;
        _setText('kpi-total-docs', s.total_documentos ?? '0');
        _setText('kpi-total-dl',   s.total_downloads  ?? '0');
        _setText('kpi-total-vis',  s.total_visualizacoes ?? '0');
        _setText('kpi-links',      s.links_ativos     ?? '0');
        _setText('kpi-exp',        s.expirando        ?? '0');
    } catch (e) { console.warn('[Documentos] Dashboard:', e.message); }
}

// ── Documentos ─────────────────────────────────────────────────────────────
async function _carregarDocs(pag = _docPag) {
    _docPag = pag;
    const busca  = _val('doc-busca');
    const depId  = _val('doc-filtro-dep');
    const status = _val('doc-filtro-status');
    const tbody  = document.getElementById('docs-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#94a3b8"><i class="fas fa-spinner fa-spin"></i></td></tr>';

    try {
        const params = new URLSearchParams({ acao:'documentos_listar', busca, departamento_id: depId, status, pagina: pag });
        const d = await _fetch(`${API}?${params}`);
        if (!d.sucesso) { _toastErro(d.mensagem); return; }
        _renderDocsTbody(d.dados.documentos || []);
        _renderPaginacao('docs-paginacao', d.dados.pagina, d.dados.total_paginas, '_setDocPag');
    } catch (e) { _toastErro(e.message); }
}

function _setDocPag(p) { _carregarDocs(p); }

function buscarDocs() {
    clearTimeout(_debTimer);
    _debTimer = setTimeout(() => _carregarDocs(1), 350);
}

function limparFiltrosDocs() {
    _val('doc-busca', '');
    _val('doc-filtro-dep', '');
    _val('doc-filtro-status', 'ativo');
    _carregarDocs(1);
}

function _renderDocsTbody(docs) {
    const tbody = document.getElementById('docs-tbody');
    if (!tbody) return;
    if (!docs.length) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:40px;color:#94a3b8">Nenhum documento encontrado.</td></tr>';
        return;
    }
    tbody.innerHTML = docs.map(d => {
        const corDep  = d.departamento_cor || '#64748b';
        const nomeDep = d.departamento_nome || '—';
        const badge   = _badgeStatus(d.status);
        const temArq  = d.arquivo ? '1' : '0';
        return `<tr>
            <td>
                <div style="font-weight:600;color:#0f172a;max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${_esc(d.nome)}">${_esc(d.nome)}</div>
                ${d.tags ? `<div style="font-size:11px;color:#94a3b8;margin-top:2px">${_esc(d.tags)}</div>` : ''}
            </td>
            <td><span style="font-size:12px;background:${corDep}22;color:${corDep};padding:3px 10px;border-radius:12px;font-weight:600">${_esc(nomeDep)}</span></td>
            <td style="font-size:12px;color:#64748b">${_esc(d.grupo_nome || '—')}</td>
            <td>${badge}</td>
            <td style="text-align:center">${d.total_downloads || 0}</td>
            <td style="text-align:center">${d.total_visualizacoes || 0}</td>
            <td style="font-size:12px;color:#64748b;white-space:nowrap">${d.criado_em || '—'}</td>
            <td>
                <div class="docs-btn-group">
                    ${temArq === '1' ? `<button type="button" class="btn-icon btn-icon--dl" onclick="DocumentosPage.baixarDoc(${d.id})" title="Download"><i class="fas fa-download"></i></button>` : ''}
                    <button type="button" class="btn-icon btn-icon--share" onclick="DocumentosPage.abrirModalComp(${d.id})" title="Compartilhar"><i class="fas fa-share-alt"></i></button>
                    <button type="button" class="btn-icon btn-icon--edit" onclick="DocumentosPage.editarDoc(${d.id})" title="Editar" data-perm="editar"><i class="fas fa-edit"></i></button>
                    <button type="button" class="btn-icon btn-icon--del" onclick="DocumentosPage.excluirDoc(${d.id},'${_esc(d.nome)}')" title="Excluir" data-perm="excluir"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function _badgeStatus(s) {
    const map = { ativo:'badge-doc--ativo', rascunho:'badge-doc--rascunho', inativo:'badge-doc--inativo', expirado:'badge-doc--expirado' };
    const lbl = { ativo:'Ativo', rascunho:'Rascunho', inativo:'Inativo', expirado:'Expirado' };
    return `<span class="badge-doc ${map[s]||'badge-doc--inativo'}">${lbl[s]||s}</span>`;
}

// ── Modal Documento ─────────────────────────────────────────────────────────
function abrirModalDoc() {
    _modal('modal-doc', true);
    _setId('modal-doc-titulo', 'Novo Documento');
    document.getElementById('doc-id').value = '';
    ['doc-nome','doc-descricao','doc-tags','doc-link-externo'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.getElementById('doc-status').value = 'ativo';
    document.getElementById('doc-data-pub').value = '';
    document.getElementById('doc-data-exp').value = '';
    document.getElementById('docs-upload-label').textContent = 'Clique ou arraste o arquivo aqui';
    document.getElementById('doc-arquivo').value = '';
    _popularSelectDep('doc-departamento');
    _popularSelectGrupo('doc-grupo');
    _popularSelectPasta('doc-pasta');
}

async function editarDoc(id) {
    try {
        const d = await _fetch(`${API}?acao=documento_carregar&id=${id}`);
        if (!d.sucesso) { _toastErro(d.mensagem); return; }
        const doc = d.dados.documento;
        _modal('modal-doc', true);
        _setId('modal-doc-titulo', 'Editar Documento');
        document.getElementById('doc-id').value            = doc.id;
        document.getElementById('doc-nome').value          = doc.nome || '';
        document.getElementById('doc-descricao').value     = doc.descricao || '';
        document.getElementById('doc-tags').value          = doc.tags || '';
        document.getElementById('doc-link-externo').value  = doc.link_externo || '';
        document.getElementById('doc-status').value        = doc.status || 'ativo';
        document.getElementById('doc-data-pub').value      = doc.data_publicacao || '';
        document.getElementById('doc-data-exp').value      = doc.data_expiracao || '';
        if (doc.arquivo) _setId('docs-upload-label', `Arquivo atual: ${doc.arquivo_nome_original || doc.arquivo}`);
        _popularSelectDep('doc-departamento', doc.departamento_id);
        _popularSelectGrupo('doc-grupo', doc.grupo_id);
        _popularSelectPasta('doc-pasta', doc.pasta_id);
    } catch (e) { _toastErro(e.message); }
}

function fecharModalDoc() { _modal('modal-doc', false); }

function onArquivoSelecionado(input) {
    const label = document.getElementById('docs-upload-label');
    if (input.files && input.files[0]) {
        const f = input.files[0];
        const mb = (f.size / 1024 / 1024).toFixed(1);
        label.textContent = `${f.name} (${mb} MB)`;
    }
}

async function salvarDoc() {
    const btn = document.getElementById('btn-salvar-doc');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; }
    try {
        const fd = new FormData();
        fd.append('acao', 'documento_salvar');
        fd.append('id',              document.getElementById('doc-id').value);
        fd.append('nome',            document.getElementById('doc-nome').value.trim());
        fd.append('descricao',       document.getElementById('doc-descricao').value.trim());
        fd.append('departamento_id', document.getElementById('doc-departamento').value);
        fd.append('pasta_id',        document.getElementById('doc-pasta').value);
        fd.append('grupo_id',        document.getElementById('doc-grupo').value);
        fd.append('tags',            document.getElementById('doc-tags').value.trim());
        fd.append('link_externo',    document.getElementById('doc-link-externo').value.trim());
        fd.append('status',          document.getElementById('doc-status').value);
        fd.append('data_publicacao', document.getElementById('doc-data-pub').value);
        fd.append('data_expiracao',  document.getElementById('doc-data-exp').value);
        const arqInput = document.getElementById('doc-arquivo');
        if (arqInput.files && arqInput.files[0]) fd.append('arquivo', arqInput.files[0]);

        const d = await _fetch(API, { method: 'POST', body: fd });
        if (!d.sucesso) { _toastErro(d.mensagem); return; }
        _toast(d.mensagem, 'sucesso');
        fecharModalDoc();
        _carregarDocs(_docPag);
        _carregarDashboard();
    } catch (e) { _toastErro(e.message); }
    finally { if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Salvar'; } }
}

async function baixarDoc(id) {
    try {
        const url = `${API}?acao=download&id=${id}`;
        // Verificar se é link externo
        const d = await _fetch(`${API}?acao=documento_carregar&id=${id}`);
        if (d.sucesso && d.dados.documento.link_externo && !d.dados.documento.arquivo) {
            window.open(d.dados.documento.link_externo, '_blank');
        } else {
            window.location.href = url;
        }
    } catch (e) { _toastErro(e.message); }
}

async function excluirDoc(id, nome) {
    if (!confirm(`Excluir o documento "${nome}"? Esta ação não pode ser desfeita.`)) return;
    try {
        const fd = new FormData();
        fd.append('acao', 'documento_excluir');
        fd.append('id', id);
        const d = await _fetch(API, { method: 'POST', body: fd });
        if (!d.sucesso) { _toastErro(d.mensagem); return; }
        _toast(d.mensagem, 'sucesso');
        _carregarDocs(_docPag);
        _carregarDashboard();
    } catch (e) { _toastErro(e.message); }
}

// ── Departamentos ───────────────────────────────────────────────────────────
async function _carregarDeps() {
    try {
        const d = await _fetch(`${API}?acao=departamentos_listar`);
        if (d.sucesso) { _deps = d.dados.departamentos || []; _preencherFiltrosDep(); }
    } catch (e) { console.warn('[Documentos] Deps:', e.message); }
}

function _preencherFiltrosDep() {
    const sel = document.getElementById('doc-filtro-dep');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = '<option value="">Todos os Departamentos</option>' +
        _deps.map(d => `<option value="${d.id}">${_esc(d.nome)}</option>`).join('');
    sel.value = cur;
}

function _popularSelectDep(selId, val = '') {
    const sel = document.getElementById(selId);
    if (!sel) return;
    sel.innerHTML = '<option value="">Selecione...</option>' +
        _deps.map(d => `<option value="${d.id}" ${+d.id === +val ? 'selected' : ''}>${_esc(d.nome)}</option>`).join('');
}

function _renderDeps() {
    const grid = document.getElementById('deps-grid');
    if (!grid) return;
    if (!_deps.length) { grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#94a3b8">Nenhum departamento cadastrado.</div>'; return; }
    grid.innerHTML = _deps.map(d => `
        <div class="dep-card page-card">
            <div class="dep-card-stripe" style="background:${_esc(d.cor||'#2563eb')}"></div>
            <div class="dep-card-icon" style="background:${_esc(d.cor||'#2563eb')}22;color:${_esc(d.cor||'#2563eb')}"><i class="${_esc(d.icone||'fas fa-folder')}"></i></div>
            <div class="dep-card-nome">${_esc(d.nome)}</div>
            ${d.descricao ? `<div class="dep-card-desc">${_esc(d.descricao)}</div>` : ''}
            <div class="dep-card-footer">
                <span class="dep-card-count"><i class="fas fa-file-alt"></i> ${d.total_documentos||0} doc(s)</span>
                <div class="dep-card-actions">
                    <button type="button" class="btn-icon btn-icon--edit" onclick="DocumentosPage.abrirModalDep(${JSON.stringify(d)})" title="Editar"><i class="fas fa-edit"></i></button>
                    <button type="button" class="btn-icon btn-icon--del"  onclick="DocumentosPage.excluirDep(${d.id},'${_esc(d.nome)}')" title="Excluir"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        </div>`).join('');
}

function abrirModalDep(dep) {
    _modal('modal-dep', true);
    if (dep && typeof dep === 'object') {
        _setId('modal-dep-titulo', 'Editar Departamento');
        document.getElementById('dep-id').value      = dep.id;
        document.getElementById('dep-nome').value    = dep.nome || '';
        document.getElementById('dep-descricao').value = dep.descricao || '';
        document.getElementById('dep-icone').value   = dep.icone || 'fas fa-folder';
        document.getElementById('dep-cor').value     = dep.cor || '#2563eb';
    } else {
        _setId('modal-dep-titulo', 'Novo Departamento');
        ['dep-id','dep-nome','dep-descricao'].forEach(id => { document.getElementById(id).value = ''; });
        document.getElementById('dep-icone').value = 'fas fa-folder';
        document.getElementById('dep-cor').value   = '#2563eb';
    }
}

function fecharModalDep() { _modal('modal-dep', false); }

async function salvarDep() {
    const fd = new FormData();
    fd.append('acao',      'departamento_salvar');
    fd.append('id',        document.getElementById('dep-id').value);
    fd.append('nome',      document.getElementById('dep-nome').value.trim());
    fd.append('descricao', document.getElementById('dep-descricao').value.trim());
    fd.append('icone',     document.getElementById('dep-icone').value.trim());
    fd.append('cor',       document.getElementById('dep-cor').value);
    try {
        const d = await _fetch(API, { method: 'POST', body: fd });
        if (!d.sucesso) { _toastErro(d.mensagem); return; }
        _toast(d.mensagem, 'sucesso');
        fecharModalDep();
        await _carregarDeps();
        _renderDeps();
    } catch (e) { _toastErro(e.message); }
}

async function excluirDep(id, nome) {
    if (!confirm(`Excluir o departamento "${nome}"?`)) return;
    const fd = new FormData();
    fd.append('acao', 'departamento_excluir');
    fd.append('id', id);
    try {
        const d = await _fetch(API, { method: 'POST', body: fd });
        if (!d.sucesso) { _toastErro(d.mensagem); return; }
        _toast(d.mensagem, 'sucesso');
        await _carregarDeps();
        _renderDeps();
    } catch (e) { _toastErro(e.message); }
}

// ── Grupos ──────────────────────────────────────────────────────────────────
async function _carregarGrupos() {
    try {
        const d = await _fetch(`${API}?acao=grupos_listar`);
        if (d.sucesso) { _grupos = d.dados.grupos || []; }
    } catch (e) { console.warn('[Documentos] Grupos:', e.message); }
}

function _popularSelectGrupo(selId, val = '') {
    const sel = document.getElementById(selId);
    if (!sel) return;
    sel.innerHTML = '<option value="">Sem grupo (público)</option>' +
        _grupos.map(g => `<option value="${g.id}" ${+g.id === +val ? 'selected' : ''}>${_esc(g.nome)}</option>`).join('');
}

function _renderGrupos() {
    const tbody = document.getElementById('grupos-tbody');
    if (!tbody) return;
    if (!_grupos.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:#94a3b8">Nenhum grupo cadastrado.</td></tr>';
        return;
    }
    const tipoLabel = { todos:'Todos', moradores:'Moradores', administradores:'Administradores',
        conselho:'Conselho', diretoria:'Diretoria', financeiro:'Financeiro', juridico:'Jurídico',
        portaria:'Portaria', manutencao:'Manutenção', prestadores:'Prestadores',
        visitantes:'Visitantes', personalizado:'Personalizado' };
    tbody.innerHTML = _grupos.map(g => `<tr>
        <td style="font-weight:600">${_esc(g.nome)}</td>
        <td><span class="badge-doc badge-doc--ativo">${tipoLabel[g.acesso_tipo]||g.acesso_tipo}</span></td>
        <td style="text-align:center">${g.total_usuarios||0}</td>
        <td style="text-align:center">${g.total_moradores||0}</td>
        <td>
            <div class="docs-btn-group">
                <button type="button" class="btn-icon btn-icon--edit" onclick='DocumentosPage.abrirModalGrupo(${JSON.stringify(g)})' title="Editar"><i class="fas fa-edit"></i></button>
                <button type="button" class="btn-icon btn-icon--del" onclick="DocumentosPage.excluirGrupo(${g.id},'${_esc(g.nome)}')" title="Excluir"><i class="fas fa-trash"></i></button>
            </div>
        </td>
    </tr>`).join('');
}

function abrirModalGrupo(grupo) {
    _modal('modal-grupo', true);
    if (grupo && typeof grupo === 'object') {
        _setId('modal-grupo-titulo', 'Editar Grupo');
        document.getElementById('grupo-id').value        = grupo.id;
        document.getElementById('grupo-nome').value      = grupo.nome || '';
        document.getElementById('grupo-descricao').value = grupo.descricao || '';
        document.getElementById('grupo-tipo').value      = grupo.acesso_tipo || 'todos';
    } else {
        _setId('modal-grupo-titulo', 'Novo Grupo');
        ['grupo-id','grupo-nome','grupo-descricao'].forEach(id => { document.getElementById(id).value = ''; });
        document.getElementById('grupo-tipo').value = 'todos';
    }
}

function fecharModalGrupo() { _modal('modal-grupo', false); }

async function salvarGrupo() {
    const fd = new FormData();
    fd.append('acao',        'grupo_salvar');
    fd.append('id',          document.getElementById('grupo-id').value);
    fd.append('nome',        document.getElementById('grupo-nome').value.trim());
    fd.append('descricao',   document.getElementById('grupo-descricao').value.trim());
    fd.append('acesso_tipo', document.getElementById('grupo-tipo').value);
    try {
        const d = await _fetch(API, { method: 'POST', body: fd });
        if (!d.sucesso) { _toastErro(d.mensagem); return; }
        _toast(d.mensagem, 'sucesso');
        fecharModalGrupo();
        await _carregarGrupos();
        _renderGrupos();
    } catch (e) { _toastErro(e.message); }
}

async function excluirGrupo(id, nome) {
    if (!confirm(`Excluir o grupo "${nome}"?`)) return;
    const fd = new FormData();
    fd.append('acao', 'grupo_excluir');
    fd.append('id', id);
    try {
        const d = await _fetch(API, { method: 'POST', body: fd });
        if (!d.sucesso) { _toastErro(d.mensagem); return; }
        _toast(d.mensagem, 'sucesso');
        await _carregarGrupos();
        _renderGrupos();
    } catch (e) { _toastErro(e.message); }
}

// ── Pastas ──────────────────────────────────────────────────────────────────
async function _carregarPastas() {
    try {
        const d = await _fetch(`${API}?acao=pastas_listar`);
        if (d.sucesso) { _pastas = d.dados.pastas || []; _renderPastas(); }
    } catch (e) { console.warn('[Documentos] Pastas:', e.message); }
}

function _popularSelectPasta(selId, val = '') {
    const sel = document.getElementById(selId);
    if (!sel) return;
    sel.innerHTML = '<option value="">Sem pasta</option>' +
        _pastas.map(p => `<option value="${p.id}" ${+p.id === +val ? 'selected' : ''}>${_esc((p.departamento_nome ? p.departamento_nome + ' › ' : '') + p.nome)}</option>`).join('');
}

function _renderPastas() {
    const tbody = document.getElementById('pastas-tbody');
    if (!tbody) return;
    if (!_pastas.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:#94a3b8">Nenhuma pasta cadastrada.</td></tr>';
        return;
    }
    tbody.innerHTML = _pastas.map(p => `<tr>
        <td style="font-weight:600"><i class="fas fa-folder" style="color:#f59e0b;margin-right:6px"></i>${_esc(p.nome)}</td>
        <td>${_esc(p.departamento_nome||'—')}</td>
        <td>${_esc(p.pasta_pai_nome||'—')}</td>
        <td style="text-align:center">${p.total_documentos||0}</td>
        <td>
            <div class="docs-btn-group">
                <button type="button" class="btn-icon btn-icon--edit" onclick='DocumentosPage.abrirModalPasta(${JSON.stringify(p)})' title="Editar"><i class="fas fa-edit"></i></button>
                <button type="button" class="btn-icon btn-icon--del" onclick="DocumentosPage.excluirPasta(${p.id},'${_esc(p.nome)}')" title="Excluir"><i class="fas fa-trash"></i></button>
            </div>
        </td>
    </tr>`).join('');
}

function abrirModalPasta(pasta) {
    _popularSelectDep('pasta-dep', pasta?.departamento_id);
    const paiSel = document.getElementById('pasta-pai');
    if (paiSel) {
        paiSel.innerHTML = '<option value="">Nenhuma (raiz)</option>' +
            _pastas.filter(p => !pasta || p.id != pasta.id).map(p =>
                `<option value="${p.id}" ${pasta && +p.id === +pasta.pasta_pai_id ? 'selected' : ''}>${_esc(p.nome)}</option>`
            ).join('');
    }
    _modal('modal-pasta', true);
    if (pasta && typeof pasta === 'object') {
        _setId('modal-pasta-titulo', 'Editar Pasta');
        document.getElementById('pasta-id').value   = pasta.id;
        document.getElementById('pasta-nome').value = pasta.nome || '';
        document.getElementById('pasta-desc').value = pasta.descricao || '';
    } else {
        _setId('modal-pasta-titulo', 'Nova Pasta');
        ['pasta-id','pasta-nome','pasta-desc'].forEach(id => { document.getElementById(id).value = ''; });
    }
}

function fecharModalPasta() { _modal('modal-pasta', false); }

async function salvarPasta() {
    const fd = new FormData();
    fd.append('acao',            'pasta_salvar');
    fd.append('id',              document.getElementById('pasta-id').value);
    fd.append('nome',            document.getElementById('pasta-nome').value.trim());
    fd.append('departamento_id', document.getElementById('pasta-dep').value);
    fd.append('pasta_pai_id',    document.getElementById('pasta-pai').value);
    fd.append('descricao',       document.getElementById('pasta-desc').value.trim());
    try {
        const d = await _fetch(API, { method: 'POST', body: fd });
        if (!d.sucesso) { _toastErro(d.mensagem); return; }
        _toast(d.mensagem, 'sucesso');
        fecharModalPasta();
        await _carregarPastas();
    } catch (e) { _toastErro(e.message); }
}

async function excluirPasta(id, nome) {
    if (!confirm(`Excluir a pasta "${nome}"?`)) return;
    const fd = new FormData();
    fd.append('acao', 'pasta_excluir');
    fd.append('id', id);
    try {
        const d = await _fetch(API, { method: 'POST', body: fd });
        if (!d.sucesso) { _toastErro(d.mensagem); return; }
        _toast(d.mensagem, 'sucesso');
        await _carregarPastas();
    } catch (e) { _toastErro(e.message); }
}

// ── Compartilhamentos ───────────────────────────────────────────────────────
async function _carregarCompartilhamentos() {
    const tbody = document.getElementById('comp-tbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:#94a3b8"><i class="fas fa-spinner fa-spin"></i></td></tr>';
    try {
        const d = await _fetch(`${API}?acao=compartilhamentos_listar`);
        if (!d.sucesso) { _toastErro(d.mensagem); return; }
        const comps = d.dados.compartilhamentos || [];
        if (!tbody) return;
        if (!comps.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:#94a3b8">Nenhum link gerado ainda.</td></tr>'; return; }
        tbody.innerHTML = comps.map(c => `<tr>
            <td style="font-weight:600;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(c.documento_nome)}</td>
            <td style="font-size:12px;max-width:220px;overflow:hidden;text-overflow:ellipsis"><a href="${_esc(c.url)}" target="_blank" rel="noopener noreferrer" style="color:#2563eb">${_esc(c.url)}</a></td>
            <td style="text-align:center">${c.total_acessos||0}${c.limite_acessos ? '/'+c.limite_acessos : ''}</td>
            <td style="font-size:12px;color:#64748b">${c.expira_formatado||'Sem expiração'}</td>
            <td><span class="badge-doc ${c.ativo ? 'badge-doc--ativo' : 'badge-doc--inativo'}">${c.ativo ? 'Ativo' : 'Inativo'}</span></td>
            <td>
                <div class="docs-btn-group">
                    <button type="button" class="btn-icon" onclick="navigator.clipboard.writeText('${_esc(c.url)}');DocumentosPage._toast('Link copiado!','sucesso')" title="Copiar"><i class="fas fa-copy"></i></button>
                    ${c.ativo ? `<button type="button" class="btn-icon btn-icon--del" onclick="DocumentosPage.desativarLink(${c.id})" title="Desativar"><i class="fas fa-ban"></i></button>` : ''}
                </div>
            </td>
        </tr>`).join('');
    } catch (e) { _toastErro(e.message); }
}

function abrirModalComp(docId) {
    document.getElementById('comp-doc-id').value = docId;
    document.getElementById('comp-desc').value   = '';
    document.getElementById('comp-expira').value = '';
    document.getElementById('comp-limite').value = '0';
    document.getElementById('comp-link-gerado').style.display = 'none';
    document.getElementById('btn-gerar-link').disabled = false;
    document.getElementById('btn-gerar-link').innerHTML = '<i class="fas fa-link"></i> Gerar Link';
    _modal('modal-comp', true);
}

function fecharModalComp() { _modal('modal-comp', false); }

async function gerarLink() {
    const btn = document.getElementById('btn-gerar-link');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...'; }
    const fd = new FormData();
    fd.append('acao',        'compartilhamento_gerar');
    fd.append('documento_id', document.getElementById('comp-doc-id').value);
    fd.append('descricao',    document.getElementById('comp-desc').value.trim());
    fd.append('expira_em',    document.getElementById('comp-expira').value);
    fd.append('limite_acessos', document.getElementById('comp-limite').value);
    try {
        const d = await _fetch(API, { method: 'POST', body: fd });
        if (!d.sucesso) { _toastErro(d.mensagem); return; }
        document.getElementById('comp-link-url').value = d.dados.url;
        document.getElementById('comp-link-gerado').style.display = 'block';
        _toast('Link gerado com sucesso!', 'sucesso');
    } catch (e) { _toastErro(e.message); }
    finally { if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-link"></i> Gerar Outro'; } }
}

function copiarLink() {
    const inp = document.getElementById('comp-link-url');
    if (inp) { navigator.clipboard.writeText(inp.value).then(() => _toast('Link copiado!', 'sucesso')); }
}

async function desativarLink(id) {
    if (!confirm('Desativar este link de compartilhamento?')) return;
    const fd = new FormData();
    fd.append('acao', 'compartilhamento_desativar');
    fd.append('id', id);
    try {
        const d = await _fetch(API, { method: 'POST', body: fd });
        if (!d.sucesso) { _toastErro(d.mensagem); return; }
        _toast(d.mensagem, 'sucesso');
        _carregarCompartilhamentos();
    } catch (e) { _toastErro(e.message); }
}

// ── Rastreabilidade ─────────────────────────────────────────────────────────
async function carregarRastreabilidade(pag = _rastroPag) {
    _rastroPag = pag;
    const tipo  = _val('rastro-tipo') || 'acessos';
    const tbody = document.getElementById('rastro-tbody');
    const thead = document.getElementById('rastro-thead');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:#94a3b8"><i class="fas fa-spinner fa-spin"></i></td></tr>';

    try {
        const acaoMap = { acessos: 'acessos_listar', logs: 'logs_listar' };
        const acao = acaoMap[tipo] || 'acessos_listar';
        const d = await _fetch(`${API}?acao=${acao}&pagina=${pag}`);
        if (!d.sucesso) { _toastErro(d.mensagem); return; }

        if (tipo === 'acessos') {
            if (thead) thead.innerHTML = '<tr><th>Data/Hora</th><th>Documento</th><th>Tipo</th><th>Origem</th><th>Usuário / IP</th><th>Navegador</th></tr>';
            const rows = d.dados.acessos || [];
            if (!tbody) return;
            tbody.innerHTML = rows.length
                ? rows.map(a => `<tr>
                    <td style="white-space:nowrap;font-size:12px">${_esc(a.data_acesso||'')}</td>
                    <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(a.documento_nome||'—')}</td>
                    <td><span class="badge-doc badge-doc--ativo">${_esc(a.tipo)}</span></td>
                    <td><span class="badge-doc ${a.origem==='interno'?'badge-doc--ativo':'badge-doc--rascunho'}">${a.origem}</span></td>
                    <td style="font-size:12px">${_esc(a.usuario_nome||a.ip||'—')}</td>
                    <td style="font-size:11px;color:#64748b;max-width:200px;overflow:hidden;text-overflow:ellipsis">${_esc((a.user_agent||'').slice(0,80))}</td>
                </tr>`).join('')
                : '<tr><td colspan="6" style="text-align:center;padding:40px;color:#94a3b8">Nenhum acesso registrado.</td></tr>';
            _renderPaginacao('rastro-paginacao', d.dados.pagina, d.dados.total_paginas, '_setRastroPag');
        } else {
            if (thead) thead.innerHTML = '<tr><th>Data/Hora</th><th>Documento</th><th>Operação</th><th>Usuário</th><th>Descrição</th><th>IP</th></tr>';
            const rows = d.dados.logs || [];
            if (!tbody) return;
            tbody.innerHTML = rows.length
                ? rows.map(l => `<tr>
                    <td style="white-space:nowrap;font-size:12px">${_esc(l.data_log||'')}</td>
                    <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${_esc(l.documento_nome||'—')}</td>
                    <td><span class="badge-doc badge-doc--ativo">${_esc(l.acao)}</span></td>
                    <td>${_esc(l.usuario_nome||'Sistema')}</td>
                    <td style="font-size:12px;color:#64748b">${_esc(l.descricao||'')}</td>
                    <td style="font-size:12px;color:#94a3b8">${_esc(l.ip||'')}</td>
                </tr>`).join('')
                : '<tr><td colspan="6" style="text-align:center;padding:40px;color:#94a3b8">Nenhum log registrado.</td></tr>';
            _renderPaginacao('rastro-paginacao', d.dados.pagina, d.dados.total_paginas, '_setRastroPag');
        }
    } catch (e) { _toastErro(e.message); }
}

function _setRastroPag(p) { carregarRastreabilidade(p); }

// ── Paginação ───────────────────────────────────────────────────────────────
function _renderPaginacao(containerId, pag, total, callbackName) {
    const el = document.getElementById(containerId);
    if (!el || total <= 1) { if (el) el.innerHTML = ''; return; }
    let html = `<button class="pag-btn" ${pag<=1?'disabled':''} onclick="DocumentosPage.${callbackName}(${pag-1})"><i class="fas fa-chevron-left"></i></button>`;
    for (let i = 1; i <= total; i++) {
        if (total > 7 && Math.abs(i - pag) > 2 && i !== 1 && i !== total) {
            if (i === 2 || i === total - 1) html += `<button class="pag-btn" disabled>…</button>`;
            continue;
        }
        html += `<button class="pag-btn ${i===pag?'active':''}" onclick="DocumentosPage.${callbackName}(${i})">${i}</button>`;
    }
    html += `<button class="pag-btn" ${pag>=total?'disabled':''} onclick="DocumentosPage.${callbackName}(${pag+1})"><i class="fas fa-chevron-right"></i></button>`;
    el.innerHTML = html;
}

// ── DOM helpers ─────────────────────────────────────────────────────────────
function _val(id, set)    {
    const el = document.getElementById(id);
    if (!el) return '';
    if (set !== undefined) { el.value = set; return ''; }
    return (el.value || '').trim();
}
function _setId(id, t)    { const el = document.getElementById(id); if (el) el.textContent = t; }
function _setText(id, t)  { const el = document.getElementById(id); if (el) el.textContent = t; }
function _modal(id, show) {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', show);
}
function _esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _toast(msg, tipo) {
    const cores = { sucesso:'#22c55e', erro:'#dc2626', info:'#2563eb' };
    const icon  = tipo==='sucesso' ? 'check-circle' : tipo==='erro' ? 'times-circle' : 'info-circle';
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;bottom:24px;right:24px;background:${cores[tipo]||'#334155'};color:#fff;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:500;z-index:99999;box-shadow:0 4px 16px rgba(0,0,0,.2);max-width:380px;line-height:1.4;display:flex;align-items:center;gap:10px`;
    t.innerHTML = `<i class="fas fa-${icon}"></i><span>${_esc(msg)}</span>`;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity='0'; t.style.transition='opacity .3s'; setTimeout(()=>t.remove(),300); }, 4000);
}
function _toastErro(msg) { _toast(msg, 'erro'); }

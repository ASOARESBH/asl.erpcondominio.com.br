/**
 * MÓDULO: CONTRATOS
 * Padrão: ES6 SPA — export init / destroy
 */

const _state = {
  lista: [], pagina: 1, porPagina: 15,
  filtros: { texto: '', status: '', tipo: '' },
  contratoAtivo: null, planos: [],
  relDados: [], relColunas: [], relTitulo: '',
  _listeners: [], _searchTimer: null, _confirmCallback: null,
};

const _esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const _fmt = v => Number(v).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
const _fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';

function _api(path, opts = {}) {
  return fetch(`${window.location.origin}/api/${path}`, opts).then(r => r.json());
}

function _on(el, ev, fn) {
  if (!el) return;
  el.addEventListener(ev, fn);
  _state._listeners.push({ el, ev, fn });
}

function _toast(msg, tipo = 'success') {
  const t = document.getElementById('ctr_toast');
  const i = document.getElementById('ctr_toastIcon');
  const m = document.getElementById('ctr_toastMsg');
  if (!t) return;
  i.className = tipo === 'success' ? 'fas fa-check-circle' : tipo === 'error' ? 'fas fa-times-circle' : 'fas fa-info-circle';
  t.className = `ctr-toast ctr-toast-${tipo}`;
  m.textContent = msg;
  t.style.display = 'flex';
  setTimeout(() => { t.style.display = 'none'; }, 4000);
}

function _statusBadge(s) {
  const map = {
    ativo:      '<span class="ctr-badge-status ctr-status-ativo">Ativo</span>',
    aguardando: '<span class="ctr-badge-status ctr-status-aguardando">Aguardando</span>',
    encerrado:  '<span class="ctr-badge-status ctr-status-encerrado">Encerrado</span>',
    cancelado:  '<span class="ctr-badge-status ctr-status-cancelado">Cancelado</span>',
  };
  return map[s] || `<span class="ctr-badge-status">${_esc(s)}</span>`;
}

function _tipoBadge(t) {
  return t === 'prestacao_servico'
    ? '<span class="ctr-badge-tipo ctr-tipo-servico"><i class="fas fa-tools"></i> Serviço</span>'
    : '<span class="ctr-badge-tipo ctr-tipo-venda"><i class="fas fa-shopping-cart"></i> Venda</span>';
}

function _recorrenciaLabel(r) {
  return { unica:'Única', mensal:'Mensal', anual:'Anual', diaria:'Diária' }[r] || r;
}

// ─── Init / Destroy ───────────────────────────────────────────────────────────
export async function init() {
  console.log('[Contratos] Init');
  Object.assign(_state, {
    lista: [], pagina: 1, filtros: { texto:'', status:'', tipo:'' },
    contratoAtivo: null, planos: [], relDados: [], relColunas: [], relTitulo: '',
    _listeners: [], _searchTimer: null, _confirmCallback: null,
  });
  _bindTabs();
  _bindToolbar();
  _bindModalContrato();
  _bindModalDoc();
  _bindModalOrc();
  _bindModalConfirm();
  await Promise.all([_carregarPlanos(), _carregar()]);
}

export function destroy() {
  console.log('[Contratos] Destroy');
  _state._listeners.forEach(({ el, ev, fn }) => el.removeEventListener(ev, fn));
  _state._listeners = [];
  if (_state._searchTimer) clearTimeout(_state._searchTimer);
}

// ─── Abas ─────────────────────────────────────────────────────────────────────
function _bindTabs() {
  document.querySelectorAll('.ctr-tab').forEach(btn => {
    _on(btn, 'click', () => {
      document.querySelectorAll('.ctr-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.querySelectorAll('.ctr-tab-content').forEach(c => c.style.display = 'none');
      const key = tab.charAt(0).toUpperCase() + tab.slice(1);
      const el = document.getElementById(`ctr_tab${key}`);
      if (el) el.style.display = 'block';
      if (tab === 'documentos' && _state.contratoAtivo) _carregarDocs(_state.contratoAtivo.id);
      if (tab === 'orcamentos' && _state.contratoAtivo) _carregarOrcamentos(_state.contratoAtivo.id);
    });
  });
}

// ─── Toolbar ─────────────────────────────────────────────────────────────────
function _bindToolbar() {
  _on(document.getElementById('ctr_btnNovo'),    'click', () => _abrirModalContrato());
  _on(document.getElementById('ctr_btnFiltrar'), 'click', _aplicarFiltros);
  _on(document.getElementById('ctr_btnLimpar'),  'click', _limparFiltros);
  const txt = document.getElementById('ctr_filtroTexto');
  _on(txt, 'keyup', () => {
    clearTimeout(_state._searchTimer);
    _state._searchTimer = setTimeout(_aplicarFiltros, 400);
  });
  document.querySelectorAll('.ctr-btn-relatorio').forEach(btn => {
    _on(btn, 'click', () => _gerarRelatorio(btn.dataset.rel));
  });
  _on(document.getElementById('ctr_btnExportarCSV'), 'click', _exportarCSV);
}

function _aplicarFiltros() {
  _state.filtros.texto  = document.getElementById('ctr_filtroTexto')?.value.trim() || '';
  _state.filtros.status = document.getElementById('ctr_filtroStatus')?.value || '';
  _state.filtros.tipo   = document.getElementById('ctr_filtroTipo')?.value || '';
  _state.pagina = 1;
  _carregar();
}

function _limparFiltros() {
  ['ctr_filtroTexto','ctr_filtroStatus','ctr_filtroTipo'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  _state.filtros = { texto:'', status:'', tipo:'' };
  _state.pagina = 1;
  _carregar();
}

// ─── Lista de Contratos ───────────────────────────────────────────────────────
async function _carregar() {
  const tbody = document.getElementById('ctr_tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="10" class="ctr-empty"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';
  const params = new URLSearchParams({
    acao: 'listar', pagina: _state.pagina, limite: _state.porPagina,
    texto: _state.filtros.texto, status: _state.filtros.status, tipo: _state.filtros.tipo,
  });
  try {
    const d = await _api(`api_contratos.php?${params}`);
    if (!d.sucesso) { _toast(d.mensagem || 'Erro ao carregar', 'error'); return; }
    _state.lista = Array.isArray(d.dados) ? d.dados : [];
    _renderTabela();
    _renderPaginacao(d.total || _state.lista.length);
    _atualizarKPIs(d.kpis || {});
    _verificarAlertas(d.alertas || []);
  } catch (e) {
    console.error('[Contratos] Erro:', e);
    if (tbody) tbody.innerHTML = '<tr><td colspan="10" class="ctr-empty ctr-empty-error">Erro ao carregar contratos</td></tr>';
  }
}

function _renderTabela() {
  const tbody = document.getElementById('ctr_tbody');
  if (!tbody) return;
  if (!_state.lista.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="ctr-empty"><i class="fas fa-folder-open"></i> Nenhum contrato encontrado</td></tr>';
    return;
  }
  tbody.innerHTML = _state.lista.map(c => `
    <tr>
      <td><strong class="ctr-numero">${_esc(c.numero_contrato)}</strong></td>
      <td><div class="ctr-fornecedor-cell"><strong>${_esc(c.fornecedor_nome)}</strong><small>${_esc(c.fornecedor_cnpj||'')}</small></div></td>
      <td>${_tipoBadge(c.tipo_servico)}</td>
      <td>${_esc(c.nome_contrato)}</td>
      <td>${_recorrenciaLabel(c.recorrencia)}</td>
      <td><strong>${_fmt(c.valor_total)}</strong></td>
      <td><div class="ctr-vigencia-cell"><span>${_fmtDate(c.data_inicio)}</span><small>até ${_fmtDate(c.data_fim)}</small>${c.dias_restantes!=null?`<small class="${c.dias_restantes<30?'ctr-dias-alerta':'ctr-dias-ok'}">${c.dias_restantes>=0?c.dias_restantes+' dias':'Encerrado'}</small>`:''}</div></td>
      <td>${_statusBadge(c.status_calculado||c.status)}</td>
      <td><span class="ctr-docs-count ${parseInt(c.total_docs)>0?'ctr-docs-ok':'ctr-docs-zero'}"><i class="fas fa-paperclip"></i> ${c.total_docs||0}</span></td>
      <td><div class="ctr-acoes">
        <button class="btn-ctr-acao btn-ctr-docs" title="Documentos" data-id="${c.id}"><i class="fas fa-paperclip"></i></button>
        <button class="btn-ctr-acao btn-ctr-orc"  title="Orçamentos" data-id="${c.id}"><i class="fas fa-balance-scale"></i></button>
        <button class="btn-ctr-acao btn-ctr-edit" title="Editar"     data-id="${c.id}"><i class="fas fa-edit"></i></button>
        <button class="btn-ctr-acao btn-ctr-del"  title="Cancelar"   data-id="${c.id}" data-nome="${_esc(c.numero_contrato)}"><i class="fas fa-ban"></i></button>
      </div></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('.btn-ctr-edit').forEach(b => _on(b,'click',()=>_abrirModalContrato(+b.dataset.id)));
  tbody.querySelectorAll('.btn-ctr-del').forEach(b  => _on(b,'click',()=>_confirmarCancelamento(+b.dataset.id,b.dataset.nome)));
  tbody.querySelectorAll('.btn-ctr-docs').forEach(b => _on(b,'click',()=>_irParaDocs(+b.dataset.id)));
  tbody.querySelectorAll('.btn-ctr-orc').forEach(b  => _on(b,'click',()=>_irParaOrcamentos(+b.dataset.id)));
}

function _renderPaginacao(total) {
  const el = document.getElementById('ctr_pagination');
  if (!el) return;
  const totalPag = Math.ceil(total / _state.porPagina);
  if (totalPag <= 1) { el.innerHTML = ''; return; }
  el.innerHTML = Array.from({length:totalPag},(_,i)=>`<button class="ctr-pag-btn ${i+1===_state.pagina?'active':''}" data-pag="${i+1}">${i+1}</button>`).join('');
  el.querySelectorAll('.ctr-pag-btn').forEach(b => _on(b,'click',()=>{ _state.pagina=+b.dataset.pag; _carregar(); }));
}

function _atualizarKPIs(k) {
  const s = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
  s('ctr_kpiTotal',      k.total      ?? '0');
  s('ctr_kpiAtivos',     k.ativos     ?? '0');
  s('ctr_kpiAguardando', k.aguardando ?? '0');
  s('ctr_kpiEncerrados', k.encerrados ?? '0');
  s('ctr_kpiValor',      k.valor_total ? _fmt(k.valor_total) : 'R$ 0,00');
}

function _verificarAlertas(alertas) {
  const bar = document.getElementById('ctr_alertBar');
  const msg = document.getElementById('ctr_alertMsg');
  if (!bar) return;
  if (alertas.length) { msg.textContent = alertas[0]; bar.style.display = 'flex'; }
  else bar.style.display = 'none';
}

// ─── Planos de Contas ─────────────────────────────────────────────────────────
async function _carregarPlanos() {
  try {
    const d = await _api('api_planos_contas.php?acao=listar');
    _state.planos = Array.isArray(d.dados) ? d.dados : (Array.isArray(d) ? d : []);
    const sel = document.getElementById('ctr_fPlanoContas');
    if (!sel) return;
    sel.innerHTML = '<option value="">Selecione o plano de contas...</option>' +
      _state.planos.map(p => `<option value="${p.id}">${_esc((p.codigo?p.codigo+' - ':'')+( p.nome||p.descricao||''))}</option>`).join('');
  } catch(e) { console.error('[Contratos] Planos:', e); }
}

// ─── Modal Contrato ───────────────────────────────────────────────────────────
function _bindModalContrato() {
  _on(document.getElementById('ctr_btnFecharModal'),    'click', _fecharModalContrato);
  _on(document.getElementById('ctr_btnCancelarModal'),  'click', _fecharModalContrato);
  _on(document.getElementById('ctr_btnSalvarContrato'), 'click', _salvarContrato);
  const busca = document.getElementById('ctr_fFornecedorBusca');
  _on(busca, 'input', () => {
    clearTimeout(_state._searchTimer);
    _state._searchTimer = setTimeout(() => _buscarFornecedor(busca.value), 350);
  });
  _on(document.getElementById('ctr_btnLimparFornecedor'), 'click', _limparFornecedorSelecionado);
  ['ctr_fRecorrencia','ctr_fValor','ctr_fDataInicio','ctr_fDataFim'].forEach(id => {
    _on(document.getElementById(id), id==='ctr_fValor'?'input':'change', _atualizarPreviewParcelas);
  });
  _on(document.getElementById('ctr_modalContrato'), 'click', e => { if(e.target.id==='ctr_modalContrato') _fecharModalContrato(); });
}

async function _abrirModalContrato(id = null) {
  const modal = document.getElementById('ctr_modalContrato');
  document.getElementById('ctr_formContrato')?.reset();
  document.getElementById('ctr_fId').value = '';
  _limparFornecedorSelecionado();
  document.getElementById('ctr_previewParcelas').style.display = 'none';
  if (_state.planos.length === 0) await _carregarPlanos();

  if (id) {
    document.getElementById('ctr_modalTitulo').innerHTML = '<i class="fas fa-edit"></i> Editar Contrato';
    document.getElementById('ctr_btnSalvarText').textContent = 'Salvar Alterações';
    try {
      const d = await _api(`api_contratos.php?acao=buscar&id=${id}`);
      if (!d.sucesso) { _toast('Erro ao carregar contrato','error'); return; }
      const c = d.dados;
      document.getElementById('ctr_fId').value           = c.id;
      document.getElementById('ctr_fFornecedorId').value  = c.fornecedor_id;
      document.getElementById('ctr_fFornecedorNome').value= c.fornecedor_nome;
      document.getElementById('ctr_fFornecedorCnpj').value= c.fornecedor_cnpj||'';
      document.getElementById('ctr_fornecedorSelecionadoNome').textContent = c.fornecedor_nome;
      document.getElementById('ctr_fornecedorSelecionado').style.display = 'flex';
      document.getElementById('ctr_fFornecedorBusca').style.display = 'none';
      ['TipoServico','Nome','DataInicio','DataFim','Recorrencia','Valor','Vencimento','PlanoContas','Obs'].forEach(k => {
        const map = {TipoServico:'tipo_servico',Nome:'nome_contrato',DataInicio:'data_inicio',DataFim:'data_fim',Recorrencia:'recorrencia',Valor:'valor_total',Vencimento:'data_vencimento',PlanoContas:'plano_conta_id',Obs:'observacoes'};
        const el = document.getElementById(`ctr_f${k}`);
        if (el) el.value = c[map[k]] || '';
      });
      _atualizarPreviewParcelas();
    } catch(e) { _toast('Erro ao carregar contrato','error'); return; }
  } else {
    document.getElementById('ctr_modalTitulo').innerHTML = '<i class="fas fa-file-contract"></i> Novo Contrato';
    document.getElementById('ctr_btnSalvarText').textContent = 'Gerar Contrato';
    document.getElementById('ctr_fDataInicio').value = new Date().toISOString().split('T')[0];
  }
  modal.style.display = 'flex';
}

function _fecharModalContrato() {
  document.getElementById('ctr_modalContrato').style.display = 'none';
  const sug = document.getElementById('ctr_fornecedorSugestoes');
  if (sug) sug.style.display = 'none';
}

async function _buscarFornecedor(q) {
  const sug = document.getElementById('ctr_fornecedorSugestoes');
  if (!sug) return;
  if (q.length < 2) { sug.style.display = 'none'; return; }
  try {
    const d = await _api(`api_admin_fornecedores.php?acao=listar&busca=${encodeURIComponent(q)}&limite=8`);
    const lista = Array.isArray(d.dados) ? d.dados : [];
    if (!lista.length) { sug.style.display = 'none'; return; }
    sug.innerHTML = lista.map(f => `<div class="ctr-sugestao-item" data-id="${f.id}" data-nome="${_esc(f.nome_estabelecimento)}" data-cnpj="${_esc(f.cpf_cnpj||'')}"><strong>${_esc(f.nome_estabelecimento)}</strong><small>${_esc(f.cpf_cnpj||'')}</small></div>`).join('');
    sug.style.display = 'block';
    sug.querySelectorAll('.ctr-sugestao-item').forEach(item => {
      _on(item, 'click', () => {
        document.getElementById('ctr_fFornecedorId').value   = item.dataset.id;
        document.getElementById('ctr_fFornecedorNome').value = item.dataset.nome;
        document.getElementById('ctr_fFornecedorCnpj').value = item.dataset.cnpj;
        document.getElementById('ctr_fornecedorSelecionadoNome').textContent = item.dataset.nome;
        document.getElementById('ctr_fornecedorSelecionado').style.display = 'flex';
        document.getElementById('ctr_fFornecedorBusca').style.display = 'none';
        sug.style.display = 'none';
      });
    });
  } catch(e) { sug.style.display = 'none'; }
}

function _limparFornecedorSelecionado() {
  ['ctr_fFornecedorId','ctr_fFornecedorNome','ctr_fFornecedorCnpj'].forEach(id => { const e=document.getElementById(id); if(e) e.value=''; });
  document.getElementById('ctr_fornecedorSelecionado').style.display = 'none';
  const b = document.getElementById('ctr_fFornecedorBusca');
  if (b) { b.style.display=''; b.value=''; b.focus(); }
}

function _atualizarPreviewParcelas() {
  const rec=document.getElementById('ctr_fRecorrencia')?.value;
  const val=parseFloat(document.getElementById('ctr_fValor')?.value||0);
  const ini=document.getElementById('ctr_fDataInicio')?.value;
  const fim=document.getElementById('ctr_fDataFim')?.value;
  const prev=document.getElementById('ctr_previewParcelas');
  const txt=document.getElementById('ctr_previewParcelasText');
  if (!prev||!txt||!rec||!val||!ini||!fim) { if(prev) prev.style.display='none'; return; }
  const dI=new Date(ini), dF=new Date(fim);
  let qtd=1;
  if (rec==='mensal') qtd=Math.max(1,Math.round((dF-dI)/(1000*60*60*24*30)));
  else if (rec==='anual') qtd=Math.max(1,Math.round((dF-dI)/(1000*60*60*24*365)));
  else if (rec==='diaria') qtd=Math.max(1,Math.round((dF-dI)/(1000*60*60*24)));
  txt.textContent = rec==='unica' ? `1 lançamento de ${_fmt(val)} será gerado em Contas a Pagar` : `${qtd} parcela(s) de ${_fmt(val/qtd)} serão geradas em Contas a Pagar`;
  prev.style.display='flex';
}

async function _salvarContrato() {
  const btn=document.getElementById('ctr_btnSalvarContrato');
  const id=document.getElementById('ctr_fId')?.value;
  const fornId=document.getElementById('ctr_fFornecedorId')?.value;
  if (!fornId) { _toast('Selecione um fornecedor','error'); return; }
  const tipo=document.getElementById('ctr_fTipoServico')?.value;
  if (!tipo) { _toast('Selecione o tipo de serviço','error'); return; }
  const nome=document.getElementById('ctr_fNome')?.value.trim();
  if (!nome) { _toast('Informe o nome do contrato','error'); return; }
  const ini=document.getElementById('ctr_fDataInicio')?.value;
  const fim=document.getElementById('ctr_fDataFim')?.value;
  if (!ini||!fim) { _toast('Informe as datas de início e fim','error'); return; }
  if (new Date(fim)<new Date(ini)) { _toast('Data de fim deve ser posterior à data de início','error'); return; }
  const rec=document.getElementById('ctr_fRecorrencia')?.value;
  if (!rec) { _toast('Selecione a recorrência','error'); return; }
  const valor=parseFloat(document.getElementById('ctr_fValor')?.value||0);
  if (!valor||valor<=0) { _toast('Informe o valor total','error'); return; }
  const venc=document.getElementById('ctr_fVencimento')?.value;
  if (!venc) { _toast('Informe a data de vencimento','error'); return; }
  const plano=document.getElementById('ctr_fPlanoContas')?.value;
  if (!plano) { _toast('Selecione o plano de contas','error'); return; }

  const fd=new FormData();
  fd.append('acao', id?'atualizar':'cadastrar');
  if (id) fd.append('id',id);
  fd.append('fornecedor_id',   fornId);
  fd.append('fornecedor_nome', document.getElementById('ctr_fFornecedorNome')?.value||'');
  fd.append('fornecedor_cnpj', document.getElementById('ctr_fFornecedorCnpj')?.value||'');
  fd.append('tipo_servico',    tipo);
  fd.append('nome_contrato',   nome);
  fd.append('data_inicio',     ini);
  fd.append('data_fim',        fim);
  fd.append('recorrencia',     rec);
  fd.append('valor_total',     valor);
  fd.append('data_vencimento', venc);
  fd.append('plano_conta_id',  plano);
  fd.append('observacoes',     document.getElementById('ctr_fObs')?.value||'');

  btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Salvando...';
  try {
    const d=await _api('api_contratos.php',{method:'POST',body:fd});
    if (d.sucesso) {
      _toast(d.mensagem||'Contrato salvo!','success');
      _fecharModalContrato();
      await _carregar();
      if (!id&&d.contrato_id) _irParaDocs(d.contrato_id);
    } else _toast(d.mensagem||'Erro ao salvar','error');
  } catch(e) { _toast('Erro de comunicação','error'); }
  finally { btn.disabled=false; btn.innerHTML='<i class="fas fa-save"></i> <span id="ctr_btnSalvarText">Gerar Contrato</span>'; }
}

// ─── Documentos ───────────────────────────────────────────────────────────────
function _irParaDocs(id) {
  _state.contratoAtivo = _state.lista.find(c=>c.id==id)||{id};
  document.querySelectorAll('.ctr-tab').forEach(b=>b.classList.remove('active'));
  document.querySelector('.ctr-tab[data-tab="documentos"]')?.classList.add('active');
  document.querySelectorAll('.ctr-tab-content').forEach(c=>c.style.display='none');
  const el=document.getElementById('ctr_tabDocumentos'); if(el) el.style.display='block';
  _carregarDocs(id);
}

async function _carregarDocs(contratoId) {
  const grid=document.getElementById('ctr_docGrid');
  if (!grid) return;
  const contrato=_state.lista.find(c=>c.id==contratoId)||_state.contratoAtivo;
  const badge=document.getElementById('ctr_docContratoBadge');
  if (badge&&contrato) badge.textContent=`Contrato: ${contrato.numero_contrato||'#'+contratoId} — ${contrato.nome_contrato||''}`;
  const btnUp=document.getElementById('ctr_btnUploadDoc');
  if (btnUp) { btnUp.disabled=false; btnUp.dataset.contratoId=contratoId; }
  grid.innerHTML='<div class="ctr-doc-loading"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';
  try {
    const d=await _api(`api_contratos.php?acao=listar_docs&contrato_id=${contratoId}`);
    const docs=Array.isArray(d.dados)?d.dados:[];
    _renderDocs(docs,contratoId);
    _atualizarLimiteDocs(docs.length);
  } catch(e) { grid.innerHTML='<div class="ctr-doc-empty"><i class="fas fa-exclamation-circle"></i><p>Erro ao carregar</p></div>'; }
}

function _renderDocs(docs,contratoId) {
  const grid=document.getElementById('ctr_docGrid'); if(!grid) return;
  if (!docs.length) { grid.innerHTML='<div class="ctr-doc-empty"><i class="fas fa-folder-open"></i><p>Nenhum documento enviado</p></div>'; return; }
  const ico={pdf:'fa-file-pdf',doc:'fa-file-word',docx:'fa-file-word',jpg:'fa-file-image',jpeg:'fa-file-image',png:'fa-file-image'};
  grid.innerHTML=docs.map(doc=>{
    const ext=(doc.nome_arquivo||'').split('.').pop().toLowerCase();
    return `<div class="ctr-doc-card"><div class="ctr-doc-icon"><i class="fas ${ico[ext]||'fa-file'}"></i></div><div class="ctr-doc-info"><strong>${_esc(doc.nome_documento)}</strong><small>${_esc(doc.tipo_documento||'')} — ${_fmtDate(doc.data_upload)}</small><small>${_esc(doc.nome_arquivo||'')}</small></div><div class="ctr-doc-acoes"><a href="${window.location.origin}/uploads/contratos/${_esc(doc.nome_arquivo)}" target="_blank" class="btn-ctr-acao btn-ctr-view" title="Visualizar"><i class="fas fa-eye"></i></a><button class="btn-ctr-acao btn-ctr-del-doc" data-id="${doc.id}" data-contrato="${contratoId}"><i class="fas fa-trash"></i></button></div></div>`;
  }).join('');
  grid.querySelectorAll('.btn-ctr-del-doc').forEach(b=>_on(b,'click',()=>_confirmarExclusaoDoc(+b.dataset.id,+b.dataset.contrato)));
}

function _atualizarLimiteDocs(qtd) {
  const lim=document.getElementById('ctr_docLimite');
  const fill=document.getElementById('ctr_docLimiteFill');
  const txt=document.getElementById('ctr_docLimiteText');
  if (!lim) return;
  lim.style.display='flex';
  if (fill) { fill.style.width=Math.min(100,(qtd/4)*100)+'%'; fill.className=`ctr-doc-limite-fill ${qtd>=4?'ctr-limite-cheio':qtd>=3?'ctr-limite-quase':''}`; }
  if (txt) txt.textContent=`${qtd} / 4 documentos`;
  const btnUp=document.getElementById('ctr_btnUploadDoc'); if(btnUp) btnUp.disabled=qtd>=4;
}

function _bindModalDoc() {
  _on(document.getElementById('ctr_btnUploadDoc'),     'click', _abrirModalDoc);
  _on(document.getElementById('ctr_btnFecharModalDoc'),'click', _fecharModalDoc);
  _on(document.getElementById('ctr_btnCancelarDoc'),   'click', _fecharModalDoc);
  _on(document.getElementById('ctr_btnSalvarDoc'),     'click', _salvarDoc);
  _on(document.getElementById('ctr_modalDoc'),         'click', e=>{ if(e.target.id==='ctr_modalDoc') _fecharModalDoc(); });
  const area=document.getElementById('ctr_uploadArea');
  const input=document.getElementById('ctr_docArquivo');
  _on(area,'click',()=>input?.click());
  _on(area,'dragover',e=>{e.preventDefault();area.classList.add('ctr-drag-over');});
  _on(area,'dragleave',()=>area.classList.remove('ctr-drag-over'));
  _on(area,'drop',e=>{e.preventDefault();area.classList.remove('ctr-drag-over');if(e.dataTransfer.files[0])_previewArquivo(e.dataTransfer.files[0]);});
  _on(input,'change',()=>{if(input.files[0])_previewArquivo(input.files[0]);});
  _on(document.getElementById('ctr_btnRemoverArquivo'),'click',_limparArquivo);
}

function _abrirModalDoc() {
  const cid=_state.contratoAtivo?.id||document.getElementById('ctr_btnUploadDoc')?.dataset.contratoId;
  if (!cid) { _toast('Selecione um contrato primeiro','error'); return; }
  document.getElementById('ctr_formDoc')?.reset();
  document.getElementById('ctr_docContratoId').value=cid;
  _limparArquivo();
  document.getElementById('ctr_modalDoc').style.display='flex';
}

function _fecharModalDoc() { document.getElementById('ctr_modalDoc').style.display='none'; }

function _previewArquivo(file) {
  const area=document.getElementById('ctr_uploadArea');
  const prev=document.getElementById('ctr_uploadPreview');
  const ico={pdf:'fa-file-pdf',doc:'fa-file-word',docx:'fa-file-word',jpg:'fa-file-image',jpeg:'fa-file-image',png:'fa-file-image'};
  const ext=file.name.split('.').pop().toLowerCase();
  document.getElementById('ctr_uploadIcon').className=`fas ${ico[ext]||'fa-file'}`;
  document.getElementById('ctr_uploadNome').textContent=file.name;
  document.getElementById('ctr_uploadTamanho').textContent=(file.size/1024/1024).toFixed(2)+' MB';
  area.style.display='none'; prev.style.display='flex';
}

function _limparArquivo() {
  document.getElementById('ctr_uploadArea').style.display='flex';
  document.getElementById('ctr_uploadPreview').style.display='none';
  const i=document.getElementById('ctr_docArquivo'); if(i) i.value='';
}

async function _salvarDoc() {
  const btn=document.getElementById('ctr_btnSalvarDoc');
  const cid=document.getElementById('ctr_docContratoId')?.value;
  const nome=document.getElementById('ctr_docNome')?.value.trim();
  const tipo=document.getElementById('ctr_docTipo')?.value;
  const arq=document.getElementById('ctr_docArquivo')?.files[0];
  if (!nome) { _toast('Informe o nome do documento','error'); return; }
  if (!tipo) { _toast('Selecione o tipo','error'); return; }
  if (!arq)  { _toast('Selecione um arquivo','error'); return; }
  if (arq.size>10*1024*1024) { _toast('Arquivo muito grande. Máx. 10 MB','error'); return; }
  if (!['jpg','jpeg','png','pdf','doc','docx'].includes(arq.name.split('.').pop().toLowerCase())) { _toast('Formato não permitido','error'); return; }
  const fd=new FormData();
  fd.append('acao','upload_doc'); fd.append('contrato_id',cid);
  fd.append('nome_documento',nome); fd.append('tipo_documento',tipo); fd.append('arquivo',arq);
  btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Enviando...';
  try {
    const d=await _api('api_contratos.php',{method:'POST',body:fd});
    if (d.sucesso) { _toast('Documento enviado!','success'); _fecharModalDoc(); _carregarDocs(cid); _carregar(); }
    else _toast(d.mensagem||'Erro ao enviar','error');
  } catch(e) { _toast('Erro de comunicação','error'); }
  finally { btn.disabled=false; btn.innerHTML='<i class="fas fa-upload"></i> Enviar'; }
}

function _confirmarExclusaoDoc(docId,contratoId) {
  _abrirConfirm('Deseja excluir este documento?', async()=>{
    const fd=new FormData(); fd.append('acao','deletar_doc'); fd.append('id',docId);
    const d=await _api('api_contratos.php',{method:'POST',body:fd});
    if (d.sucesso) { _toast('Documento excluído','success'); _carregarDocs(contratoId); _carregar(); }
    else _toast(d.mensagem||'Erro ao excluir','error');
  });
}

// ─── Orçamentos ───────────────────────────────────────────────────────────────
function _irParaOrcamentos(id) {
  _state.contratoAtivo=_state.lista.find(c=>c.id==id)||{id};
  document.querySelectorAll('.ctr-tab').forEach(b=>b.classList.remove('active'));
  document.querySelector('.ctr-tab[data-tab="orcamentos"]')?.classList.add('active');
  document.querySelectorAll('.ctr-tab-content').forEach(c=>c.style.display='none');
  const el=document.getElementById('ctr_tabOrcamentos'); if(el) el.style.display='block';
  _carregarOrcamentos(id);
}

async function _carregarOrcamentos(contratoId) {
  const tbody=document.getElementById('ctr_orcTbody'); if(!tbody) return;
  const contrato=_state.lista.find(c=>c.id==contratoId)||_state.contratoAtivo;
  const badge=document.getElementById('ctr_orcContratoBadge');
  if (badge&&contrato) badge.textContent=`Contrato: ${contrato.numero_contrato||'#'+contratoId} — ${contrato.nome_contrato||''}`;
  const btnN=document.getElementById('ctr_btnNovoOrc');
  if (btnN) { btnN.disabled=false; btnN.dataset.contratoId=contratoId; }
  tbody.innerHTML='<tr><td colspan="7" class="ctr-empty"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';
  try {
    const d=await _api(`api_contratos.php?acao=listar_orc&contrato_id=${contratoId}`);
    const orcs=Array.isArray(d.dados)?d.dados:[];
    _renderOrcamentos(orcs,contratoId,contrato?.valor_total);
    _verificarMinOrcamentos(orcs.length);
  } catch(e) { tbody.innerHTML='<tr><td colspan="7" class="ctr-empty ctr-empty-error">Erro ao carregar</td></tr>'; }
}

function _renderOrcamentos(orcs,contratoId,valorContrato) {
  const tbody=document.getElementById('ctr_orcTbody'); if(!tbody) return;
  if (!orcs.length) { tbody.innerHTML='<tr><td colspan="7" class="ctr-empty">Nenhum orçamento cadastrado</td></tr>'; return; }
  tbody.innerHTML=orcs.map((o,i)=>`
    <tr>
      <td>${i+1}</td>
      <td>${_esc(o.fornecedor)}</td>
      <td>${_esc(o.descricao)}</td>
      <td><strong ${parseFloat(o.valor)>parseFloat(valorContrato||0)?'class="ctr-valor-alto"':''}>${_fmt(o.valor)}</strong>${parseFloat(o.valor)>parseFloat(valorContrato||0)?'<i class="fas fa-exclamation-triangle ctr-ico-warn"></i>':''}</td>
      <td>${o.justificativa?`<span class="ctr-justificativa-text" title="${_esc(o.justificativa)}"><i class="fas fa-comment-alt"></i> Ver</span>`:'—'}</td>
      <td>${_fmtDate(o.data_cadastro)}</td>
      <td><div class="ctr-acoes"><button class="btn-ctr-acao btn-ctr-edit-orc" data-id="${o.id}" data-contrato="${contratoId}"><i class="fas fa-edit"></i></button><button class="btn-ctr-acao btn-ctr-del-orc" data-id="${o.id}" data-contrato="${contratoId}"><i class="fas fa-trash"></i></button></div></td>
    </tr>
  `).join('');
  tbody.querySelectorAll('.btn-ctr-edit-orc').forEach(b=>_on(b,'click',()=>_abrirModalOrc(+b.dataset.id,+b.dataset.contrato)));
  tbody.querySelectorAll('.btn-ctr-del-orc').forEach(b=>_on(b,'click',()=>_confirmarExclusaoOrc(+b.dataset.id,+b.dataset.contrato)));
}

function _verificarMinOrcamentos(qtd) {
  const al=document.getElementById('ctr_orcAlerta');
  const msg=document.getElementById('ctr_orcAlertaMsg');
  if (!al) return;
  if (qtd<3) { msg.textContent=`São necessários pelo menos 3 orçamentos. Você tem ${qtd} de 3.`; al.style.display='flex'; }
  else al.style.display='none';
  const badge=document.getElementById('ctr_badgeOrc');
  if (badge) { badge.textContent=qtd<3?`${qtd}/3`:qtd; badge.style.display=qtd<3?'inline-flex':'none'; }
}

function _bindModalOrc() {
  _on(document.getElementById('ctr_btnNovoOrc'),        'click', ()=>_abrirModalOrc());
  _on(document.getElementById('ctr_btnFecharModalOrc'), 'click', _fecharModalOrc);
  _on(document.getElementById('ctr_btnCancelarOrc'),    'click', _fecharModalOrc);
  _on(document.getElementById('ctr_btnSalvarOrc'),      'click', _salvarOrcamento);
  _on(document.getElementById('ctr_modalOrc'),          'click', e=>{ if(e.target.id==='ctr_modalOrc') _fecharModalOrc(); });
  _on(document.getElementById('ctr_orcValor'), 'input', _verificarJustificativaOrc);
}

async function _abrirModalOrc(id=null,contratoId=null) {
  document.getElementById('ctr_formOrc')?.reset();
  document.getElementById('ctr_orcId').value='';
  document.getElementById('ctr_orcJustificativaGroup').style.display='none';
  const cid=contratoId||_state.contratoAtivo?.id||document.getElementById('ctr_btnNovoOrc')?.dataset.contratoId;
  document.getElementById('ctr_orcContratoId').value=cid||'';
  if (id) {
    document.getElementById('ctr_orcModalTitulo').textContent='Editar Orçamento';
    try {
      const d=await _api(`api_contratos.php?acao=buscar_orc&id=${id}`);
      if (d.sucesso) {
        const o=d.dados;
        document.getElementById('ctr_orcId').value=o.id;
        document.getElementById('ctr_orcFornecedor').value=o.fornecedor;
        document.getElementById('ctr_orcDescricao').value=o.descricao;
        document.getElementById('ctr_orcValor').value=o.valor;
        if (o.justificativa) { document.getElementById('ctr_orcJustificativaGroup').style.display='block'; document.getElementById('ctr_orcJustificativa').value=o.justificativa; }
      }
    } catch(e) { _toast('Erro ao carregar orçamento','error'); return; }
  } else {
    document.getElementById('ctr_orcModalTitulo').textContent='Novo Orçamento';
  }
  document.getElementById('ctr_modalOrc').style.display='flex';
}

function _fecharModalOrc() { document.getElementById('ctr_modalOrc').style.display='none'; }

function _verificarJustificativaOrc() {
  const valOrc=parseFloat(document.getElementById('ctr_orcValor')?.value||0);
  const cid=document.getElementById('ctr_orcContratoId')?.value;
  const c=_state.lista.find(x=>x.id==cid)||_state.contratoAtivo;
  const valC=parseFloat(c?.valor_total||0);
  const g=document.getElementById('ctr_orcJustificativaGroup');
  if (!g) return;
  if (valOrc>valC&&valC>0) g.style.display='block';
  else { g.style.display='none'; const j=document.getElementById('ctr_orcJustificativa'); if(j) j.value=''; }
}

async function _salvarOrcamento() {
  const btn=document.getElementById('ctr_btnSalvarOrc');
  const id=document.getElementById('ctr_orcId')?.value;
  const cid=document.getElementById('ctr_orcContratoId')?.value;
  const forn=document.getElementById('ctr_orcFornecedor')?.value.trim();
  const desc=document.getElementById('ctr_orcDescricao')?.value.trim();
  const val=parseFloat(document.getElementById('ctr_orcValor')?.value||0);
  if (!forn) { _toast('Informe o fornecedor','error'); return; }
  if (!desc)  { _toast('Informe a descrição','error'); return; }
  if (!val||val<=0) { _toast('Informe o valor','error'); return; }
  const g=document.getElementById('ctr_orcJustificativaGroup');
  const just=document.getElementById('ctr_orcJustificativa')?.value.trim();
  if (g?.style.display!=='none'&&!just) { _toast('A justificativa é obrigatória','error'); document.getElementById('ctr_orcJustificativa')?.focus(); return; }
  const fd=new FormData();
  fd.append('acao',id?'atualizar_orc':'cadastrar_orc');
  if (id) fd.append('id',id);
  fd.append('contrato_id',cid); fd.append('fornecedor',forn); fd.append('descricao',desc); fd.append('valor',val); fd.append('justificativa',just||'');
  btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Salvando...';
  try {
    const d=await _api('api_contratos.php',{method:'POST',body:fd});
    if (d.sucesso) { _toast(d.mensagem||'Orçamento salvo!','success'); _fecharModalOrc(); _carregarOrcamentos(cid); }
    else _toast(d.mensagem||'Erro ao salvar','error');
  } catch(e) { _toast('Erro de comunicação','error'); }
  finally { btn.disabled=false; btn.innerHTML='<i class="fas fa-save"></i> Salvar Orçamento'; }
}

function _confirmarExclusaoOrc(orcId,contratoId) {
  _abrirConfirm('Deseja excluir este orçamento?', async()=>{
    const fd=new FormData(); fd.append('acao','deletar_orc'); fd.append('id',orcId);
    const d=await _api('api_contratos.php',{method:'POST',body:fd});
    if (d.sucesso) { _toast('Orçamento excluído','success'); _carregarOrcamentos(contratoId); }
    else _toast(d.mensagem||'Erro','error');
  });
}

// ─── Cancelamento ─────────────────────────────────────────────────────────────
function _confirmarCancelamento(id,numero) {
  _abrirConfirm(`Deseja cancelar o contrato ${numero}?`, async()=>{
    const fd=new FormData(); fd.append('acao','cancelar'); fd.append('id',id);
    const d=await _api('api_contratos.php',{method:'POST',body:fd});
    if (d.sucesso) { _toast('Contrato cancelado','success'); _carregar(); }
    else _toast(d.mensagem||'Erro','error');
  });
}

// ─── Modal Confirmação ────────────────────────────────────────────────────────
function _bindModalConfirm() {
  _on(document.getElementById('ctr_btnFecharConfirm'),    'click', _fecharConfirm);
  _on(document.getElementById('ctr_btnCancelarConfirm'),  'click', _fecharConfirm);
  _on(document.getElementById('ctr_btnConfirmarExclusao'),'click', async()=>{
    if (_state._confirmCallback) { await _state._confirmCallback(); _state._confirmCallback=null; }
    _fecharConfirm();
  });
  _on(document.getElementById('ctr_modalConfirm'),'click',e=>{ if(e.target.id==='ctr_modalConfirm') _fecharConfirm(); });
}

function _abrirConfirm(msg,cb) {
  document.getElementById('ctr_confirmMsg').textContent=msg;
  _state._confirmCallback=cb;
  document.getElementById('ctr_modalConfirm').style.display='flex';
}

function _fecharConfirm() {
  document.getElementById('ctr_modalConfirm').style.display='none';
  _state._confirmCallback=null;
}

// ─── Relatórios ───────────────────────────────────────────────────────────────
async function _gerarRelatorio(tipo) {
  const resultado=document.getElementById('ctr_relResultado');
  if (!resultado) return;
  resultado.style.display='none';
  const params=new URLSearchParams({acao:'relatorio',tipo});
  const configs={
    ativos:        { titulo:'Contratos Ativos',       colunas:['Nº Contrato','Fornecedor','Tipo','Nome','Recorrência','Valor Total','Vencimento','Dias Restantes'] },
    vencimentos:   { titulo:'Vencimentos Próximos',   colunas:['Nº Contrato','Fornecedor','Parcela','Valor','Vencimento','Dias'] },
    por_fornecedor:{ titulo:'Contratos por Fornecedor',colunas:['Fornecedor','CNPJ','Total Contratos','Ativos','Valor Total'] },
    financeiro:    { titulo:'Relatório Financeiro',   colunas:['Nº Contrato','Fornecedor','Valor Contrato','Total Lançado','Total Pago','Pendente'] },
  };
  const cfg=configs[tipo]||{titulo:tipo,colunas:[]};
  _state.relTitulo=cfg.titulo; _state.relColunas=cfg.colunas;
  if (tipo==='ativos') { const t=document.getElementById('ctr_relAtivoTipo')?.value; if(t) params.set('tipo_servico',t); }
  if (tipo==='vencimentos') params.set('dias',document.getElementById('ctr_relVencDias')?.value||'30');
  if (tipo==='financeiro') { params.set('data_ini',document.getElementById('ctr_relFinIni')?.value||''); params.set('data_fim',document.getElementById('ctr_relFinFim')?.value||''); }
  try {
    const d=await _api(`api_contratos.php?${params}`);
    _state.relDados=Array.isArray(d.dados)?d.dados:[];
    document.getElementById('ctr_relTitulo').textContent=_state.relTitulo;
    document.getElementById('ctr_relThead').innerHTML=`<tr>${_state.relColunas.map(c=>`<th>${_esc(c)}</th>`).join('')}</tr>`;
    const tbody=document.getElementById('ctr_relTbody');
    tbody.innerHTML=_state.relDados.length
      ? _state.relDados.map(row=>`<tr>${Object.values(row).map(v=>`<td>${_esc(v??'—')}</td>`).join('')}</tr>`).join('')
      : `<tr><td colspan="${_state.relColunas.length}" class="ctr-empty">Nenhum dado encontrado</td></tr>`;
    const sum=document.getElementById('ctr_relSummary');
    if (d.summary) { sum.innerHTML=Object.entries(d.summary).map(([k,v])=>`<div class="ctr-rel-summary-item"><span>${_esc(k)}</span><strong>${_esc(v)}</strong></div>`).join(''); sum.style.display='flex'; }
    else sum.style.display='none';
    resultado.style.display='block';
    resultado.scrollIntoView({behavior:'smooth',block:'start'});
  } catch(e) { _toast('Erro ao gerar relatório','error'); }
}

function _exportarCSV() {
  if (!_state.relDados.length) return;
  const linhas=[_state.relColunas.join(';'),..._state.relDados.map(row=>Object.values(row).map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(';'))];
  const blob=new Blob(['\uFEFF'+linhas.join('\n')],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=`${_state.relTitulo.replace(/\s+/g,'_')}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

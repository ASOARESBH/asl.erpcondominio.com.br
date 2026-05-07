/**
 * Registro Manual Page Module v2
 * - Busca visitante/prestador por RG/CPF
 * - Seleção obrigatória de unidade e morador para visitante/prestador
 * - Mantém detecção automática de veículo por placa para morador
 */

const API_REGISTROS  = '../api/api_registros.php';
const API_VEICULOS   = '../api/api_veiculos.php';
const API_VISITANTES = '../api/api_visitantes.php';
const API_MORADORES  = '../api/api_moradores.php';
const API_UNIDADES   = '../api/api_unidades.php';

let registrosCache = [];
let veiculosCache  = [];
let salvandoReg    = false;

export function init() {
    console.log('[Registro] Inicializando v2...');

    _setupForm();
    _setupBusca();
    _setupActions();
    _setupMascaraDocumento();
    _setupCascataUnidadeMorador();
    _carregarUnidades();

    atualizarDataHoraAtual();
    carregarVeiculos();
    carregarRegistros();

    window.RegistroPage = {
        buscar:  buscarRegistros,
        excluir: excluirRegistro,
        limpar:  limparFormulario
    };
    console.log('[Registro] Módulo pronto.');
}

export function destroy() {
    console.log('[Registro] Limpando...');
    delete window.RegistroPage;
    registrosCache = [];
    veiculosCache  = [];
    salvandoReg    = false;
}

// ===== MÁSCARA DOCUMENTO =====
function _setupMascaraDocumento() {
    const tipoDoc = document.getElementById('tipoDocRegistro');
    const docInput = document.getElementById('documentoRegistro');
    if (!tipoDoc || !docInput) return;

    tipoDoc.addEventListener('change', () => {
        docInput.value = '';
        docInput.placeholder = tipoDoc.value === 'CPF' ? '000.000.000-00' : 'XX.XXX.XXX-X';
    });

    docInput.addEventListener('input', () => {
        let v = docInput.value.replace(/\D/g, '');
        if (tipoDoc.value === 'CPF') {
            v = v.slice(0, 11);
            if (v.length > 9)      v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4');
            else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3');
            else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, '$1.$2');
        } else {
            v = v.slice(0, 9);
            if (v.length > 8)      v = v.replace(/(\d{2})(\d{3})(\d{3})(\d{1})/, '$1.$2.$3-$4');
            else if (v.length > 5) v = v.replace(/(\d{2})(\d{3})(\d{1,3})/, '$1.$2.$3');
            else if (v.length > 2) v = v.replace(/(\d{2})(\d{1,3})/, '$1.$2');
        }
        docInput.value = v;
    });

    // Buscar ao pressionar Enter no campo documento
    docInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); _buscarVisitantePorDocumento(); }
    });

    // Botão buscar
    const btnBuscar = document.getElementById('btnBuscarDocRegistro');
    if (btnBuscar) btnBuscar.addEventListener('click', _buscarVisitantePorDocumento);
}

// ===== BUSCAR VISITANTE POR DOCUMENTO =====
async function _buscarVisitantePorDocumento() {
    const docInput = document.getElementById('documentoRegistro');
    const doc = docInput?.value.trim() || '';
    if (!doc) {
        mostrarAlerta('error', 'Informe o documento para buscar.');
        return;
    }

    const btnBuscar = document.getElementById('btnBuscarDocRegistro');
    if (btnBuscar) { btnBuscar.disabled = true; btnBuscar.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; }

    try {
        const resp = await fetch(`${API_VISITANTES}?documento=${encodeURIComponent(doc)}`);
        const data = await resp.json();

        const box = document.getElementById('visitanteEncontrado');

        if (data.sucesso && data.dados) {
            const v = data.dados;
            document.getElementById('nomeVisitanteRegistro').value = v.nome_completo || '';
            document.getElementById('visitanteIdRegistro').value   = v.id || '';

            // Preencher placa do veículo se disponível e campo estiver vazio
            const placaInput = document.getElementById('placaRegistro');
            if (placaInput && !placaInput.value && v.placa_veiculo) {
                placaInput.value = v.placa_veiculo;
            }

            if (box) {
                box.style.display = 'flex';
                box.innerHTML = `<i class="fas fa-check-circle"></i>
                    <span>Cadastro encontrado: <strong>${_esc(v.nome_completo)}</strong>
                    — ${_esc(v.tipo_documento)}: ${_esc(v.documento)}
                    ${v.telefone_contato ? '— Tel: ' + _esc(v.telefone_contato) : ''}</span>`;
            }
            console.log(`[Registro] Visitante encontrado: ${v.nome_completo} (ID ${v.id})`);
        } else {
            // Não encontrado — limpar campos e avisar
            document.getElementById('nomeVisitanteRegistro').value = '';
            document.getElementById('visitanteIdRegistro').value   = '';
            if (box) { box.style.display = 'none'; box.innerHTML = ''; }
            mostrarAlerta('warning', 'Visitante não encontrado com este documento. Preencha o nome manualmente ou cadastre-o no módulo Visitantes.');
        }
    } catch (error) {
        console.error('[Registro] Erro ao buscar visitante:', error);
        mostrarAlerta('error', 'Erro ao buscar cadastro do visitante.');
    } finally {
        if (btnBuscar) { btnBuscar.disabled = false; btnBuscar.innerHTML = '<i class="fas fa-search"></i>'; }
    }
}

// ===== CARREGAR UNIDADES =====
async function _carregarUnidades() {
    const sel = document.getElementById('unidadeDestinoRegistro');
    if (!sel) return;
    try {
        const resp = await fetch(API_UNIDADES);
        const data = await resp.json();
        const unidades = data.dados?.itens || data.dados || [];
        sel.innerHTML = '<option value="">Selecione a unidade...</option>';
        unidades.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.nome || u.unidade || u.id;
            opt.textContent = u.nome || u.unidade || u.id;
            sel.appendChild(opt);
        });
    } catch (e) {
        console.warn('[Registro] Não foi possível carregar unidades:', e);
    }
}

// ===== CASCATA UNIDADE → MORADOR =====
function _setupCascataUnidadeMorador() {
    const selUnidade = document.getElementById('unidadeDestinoRegistro');
    if (!selUnidade) return;

    selUnidade.addEventListener('change', () => {
        const unidade = selUnidade.value;
        const selMorador = document.getElementById('moradorDestinoRegistro');
        if (!selMorador) return;

        if (!unidade) {
            selMorador.innerHTML = '<option value="">Selecione a unidade primeiro</option>';
            selMorador.disabled = true;
            return;
        }

        selMorador.innerHTML = '<option value="">Carregando...</option>';
        selMorador.disabled = true;

        fetch(`${API_MORADORES}?unidade=${encodeURIComponent(unidade)}&ativo=1&por_pagina=0`)
            .then(r => r.json())
            .then(data => {
                const moradores = data.dados?.itens || data.dados || [];
                selMorador.innerHTML = '<option value="">Selecione o morador...</option>';
                moradores.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m.id;
                    opt.textContent = m.nome_completo || m.nome;
                    selMorador.appendChild(opt);
                });
                selMorador.disabled = moradores.length === 0;
                if (moradores.length === 0) {
                    selMorador.innerHTML = '<option value="">Nenhum morador nesta unidade</option>';
                }
            })
            .catch(() => {
                selMorador.innerHTML = '<option value="">Erro ao carregar moradores</option>';
                selMorador.disabled = true;
            });
    });
}

// ===== FORM SETUP =====
function _setupForm() {
    const form = document.getElementById('registroForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await salvarRegistro();
    });

    const placaInput = document.getElementById('placaRegistro');
    if (placaInput) {
        placaInput.addEventListener('input', formatarPlacaInput);
        placaInput.addEventListener('blur', detectarVeiculoPorPlaca);
    }

    const tipo = document.getElementById('tipoRegistro');
    if (tipo) tipo.addEventListener('change', onTipoChange);
}

function _setupBusca() {
    const input = document.getElementById('buscaRegistro');
    if (!input) return;
    input.addEventListener('input', () => filtrarRegistros(input.value));
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); buscarRegistros(); }
    });
}

function _setupActions() {
    const btnBuscar = document.getElementById('btnBuscarRegistro');
    if (btnBuscar) btnBuscar.addEventListener('click', buscarRegistros);

    const btnLimpar = document.getElementById('btnLimparRegistro');
    if (btnLimpar) btnLimpar.addEventListener('click', limparFormulario);
}

// ===== LOADING =====
function setLoading(ativo) {
    const el = document.getElementById('loadingRegistros');
    if (el) el.style.display = ativo ? 'block' : 'none';
}

// ===== DATA/HORA =====
function atualizarDataHoraAtual() {
    const input = document.getElementById('dataHoraRegistro');
    if (!input) return;
    const agora = new Date();
    agora.setMinutes(agora.getMinutes() - agora.getTimezoneOffset());
    input.value = agora.toISOString().slice(0, 16);
}

// ===== CARREGAR VEÍCULOS =====
async function carregarVeiculos() {
    try {
        const response = await fetch(API_VEICULOS);
        const data = await response.json();
        veiculosCache = (data.sucesso && Array.isArray(data.dados)) ? data.dados : [];
    } catch (error) {
        console.error('[Registro] Erro ao carregar veiculos:', error);
        veiculosCache = [];
    }
}

// ===== CARREGAR REGISTROS =====
async function carregarRegistros() {
    const tbody = document.querySelector('#tabelaRegistros tbody');
    setLoading(true);
    try {
        const response = await fetch(`${API_REGISTROS}?limite=100`);
        const data = await response.json();
        if (!data.sucesso) {
            renderMensagemTabela(tbody, data.mensagem || 'Erro ao carregar registros.');
            return;
        }
        registrosCache = Array.isArray(data.dados) ? data.dados : [];
        renderRegistros(registrosCache);
    } catch (error) {
        console.error('[Registro] Erro ao carregar registros:', error);
        renderMensagemTabela(tbody, 'Erro de conexão ao carregar registros.');
    } finally {
        setLoading(false);
    }
}

// ===== BUSCAR / FILTRAR =====
function buscarRegistros() {
    filtrarRegistros(document.getElementById('buscaRegistro')?.value || '');
}

function filtrarRegistros(termo) {
    if (!termo?.trim()) { renderRegistros(registrosCache); return; }
    const q = termo.toLowerCase().trim();
    const filtrados = registrosCache.filter(r => {
        return (r.morador_nome || r.nome_visitante || '').toLowerCase().includes(q)
            || (r.placa || '').toLowerCase().includes(q)
            || (r.tipo || '').toLowerCase().includes(q)
            || (r.morador_unidade || r.unidade_destino || '').toLowerCase().includes(q)
            || (r.status || '').toLowerCase().includes(q)
            || (r.modelo || '').toLowerCase().includes(q);
    });
    renderRegistros(filtrados);
}

// ===== RENDER =====
function renderRegistros(registros) {
    const tbody = document.querySelector('#tabelaRegistros tbody');
    if (!tbody) return;
    if (!registros?.length) { renderMensagemTabela(tbody, 'Nenhum registro encontrado.'); return; }

    tbody.innerHTML = registros.map(r => {
        const id       = r.id || 0;
        const dataHora = _esc(r.data_hora_formatada || formatDateTime(r.data_hora) || '-');
        const placa    = _esc(r.placa || '-');
        const modelo   = _esc(r.modelo || '-');
        const cor      = _esc(r.cor || '-');
        const tipo     = _esc(r.tipo || '-');
        const nome     = _esc(r.morador_nome || r.nome_visitante || r.tipo || '-');
        const unidade  = _esc(r.morador_unidade || r.unidade_destino || '-');
        const status   = _esc(r.status || '-');
        const statusClass = classificarStatus(r.status, r.liberado);

        return `
            <tr>
                <td>${dataHora}</td>
                <td><span class="plate-badge">${placa}</span></td>
                <td>${modelo}</td>
                <td>${cor}</td>
                <td>${tipo}</td>
                <td>${nome}</td>
                <td>${unidade}</td>
                <td><span class="status-pill ${statusClass}">${status}</span></td>
                <td>
                    <button class="action-btn delete" type="button" onclick="window.RegistroPage.excluir(${id})" title="Excluir registro">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>`;
    }).join('');
}

function renderMensagemTabela(tbody, msg) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="empty-state">${_esc(msg)}</td></tr>`;
}

// ===== SALVAR =====
async function salvarRegistro() {
    if (salvandoReg) return;
    salvandoReg = true;
    const btn = document.getElementById('btnSalvarRegistro');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; }

    try {
        const dataHoraInput = document.getElementById('dataHoraRegistro')?.value || '';
        const placa         = normalizarPlaca(document.getElementById('placaRegistro')?.value || '');
        const modelo        = (document.getElementById('modeloRegistro')?.value || '').trim();
        const cor           = (document.getElementById('corRegistro')?.value || '').trim();
        const tipo          = (document.getElementById('tipoRegistro')?.value || '').trim();
        const observacao    = (document.getElementById('observacaoRegistro')?.value || '').trim();

        if (!dataHoraInput || !placa || !tipo) {
            mostrarAlerta('error', 'Data/hora, placa e tipo são obrigatórios.');
            return;
        }

        let payload = {
            data_hora:   `${dataHoraInput.replace('T', ' ')}:00`,
            placa,
            modelo,
            cor,
            tipo,
            observacao
        };

        // Campos específicos para Visitante / Prestador
        if (tipo === 'Visitante' || tipo === 'Prestador') {
            const nomeVisitante   = (document.getElementById('nomeVisitanteRegistro')?.value || '').trim();
            const unidadeDestino  = document.getElementById('unidadeDestinoRegistro')?.value || '';
            const moradorDestino  = document.getElementById('moradorDestinoRegistro')?.value || '';
            const diasPermanencia = Number(document.getElementById('diasPermanenciaRegistro')?.value || 1);
            const visitanteId     = document.getElementById('visitanteIdRegistro')?.value || '';
            const documento       = document.getElementById('documentoRegistro')?.value.trim() || '';

            if (!nomeVisitante)  { mostrarAlerta('error', 'Informe o nome do visitante/prestador.'); return; }
            if (!unidadeDestino) { mostrarAlerta('error', 'Selecione a unidade de destino.'); return; }
            if (!moradorDestino) { mostrarAlerta('error', 'Selecione o morador que será visitado.'); return; }

            payload.nome_visitante   = nomeVisitante;
            payload.unidade_destino  = unidadeDestino;
            payload.morador_id       = moradorDestino || null;
            payload.dias_permanencia = diasPermanencia;
            if (visitanteId) payload.visitante_id = visitanteId;
            if (documento)   payload.documento     = documento;
        }

        console.log('[Registro] Payload:', payload);

        const response = await fetch(API_REGISTROS, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!data.sucesso) {
            mostrarAlerta('error', data.mensagem || 'Falha ao registrar acesso.');
            return;
        }

        mostrarAlerta('success', data.mensagem || 'Registro salvo com sucesso.');
        limparFormulario();
        await carregarRegistros();

    } catch (error) {
        console.error('[Registro] Erro ao salvar registro:', error);
        mostrarAlerta('error', 'Erro interno ao salvar registro.');
    } finally {
        salvandoReg = false;
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Registrar Acesso'; }
    }
}

// ===== EXCLUIR =====
async function excluirRegistro(id) {
    if (!confirm('Deseja realmente excluir este registro?')) return;
    try {
        const response = await fetch(API_REGISTROS, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: Number(id) })
        });
        const data = await response.json();
        if (!data.sucesso) { mostrarAlerta('error', data.mensagem || 'Falha ao excluir registro.'); return; }
        mostrarAlerta('success', data.mensagem || 'Registro excluído com sucesso.');
        await carregarRegistros();
    } catch (error) {
        console.error('[Registro] Erro ao excluir registro:', error);
        mostrarAlerta('error', 'Erro de conexão ao excluir registro.');
    }
}

// ===== LIMPAR FORMULÁRIO =====
function limparFormulario() {
    const form = document.getElementById('registroForm');
    if (form) form.reset();

    document.getElementById('moradorId').value           = '';
    document.getElementById('veiculoId').value           = '';
    document.getElementById('visitanteIdRegistro').value = '';

    const extra = document.getElementById('extraCampos');
    if (extra) extra.style.display = 'none';

    const boxVeiculo = document.getElementById('veiculoEncontrado');
    if (boxVeiculo) { boxVeiculo.style.display = 'none'; boxVeiculo.innerHTML = ''; }

    const boxVisitante = document.getElementById('visitanteEncontrado');
    if (boxVisitante) { boxVisitante.style.display = 'none'; boxVisitante.innerHTML = ''; }

    // Reset morador select
    const selMorador = document.getElementById('moradorDestinoRegistro');
    if (selMorador) {
        selMorador.innerHTML = '<option value="">Selecione a unidade primeiro</option>';
        selMorador.disabled = true;
    }

    atualizarDataHoraAtual();
}

// ===== TIPO CHANGE =====
function onTipoChange() {
    const tipo  = document.getElementById('tipoRegistro')?.value || '';
    const extra = document.getElementById('extraCampos');
    if (!extra) return;

    if (tipo === 'Visitante' || tipo === 'Prestador') {
        extra.style.display = 'block';
    } else {
        extra.style.display = 'none';
        // Limpar campos extras
        const ids = ['nomeVisitanteRegistro', 'documentoRegistro', 'diasPermanenciaRegistro'];
        ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        const selUnidade = document.getElementById('unidadeDestinoRegistro');
        if (selUnidade) selUnidade.value = '';
        const selMorador = document.getElementById('moradorDestinoRegistro');
        if (selMorador) { selMorador.innerHTML = '<option value="">Selecione a unidade primeiro</option>'; selMorador.disabled = true; }
        document.getElementById('visitanteIdRegistro').value = '';
        const boxVisitante = document.getElementById('visitanteEncontrado');
        if (boxVisitante) { boxVisitante.style.display = 'none'; boxVisitante.innerHTML = ''; }
    }
}

// ===== PLACA =====
function formatarPlacaInput(e) {
    let v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (v.length > 7) v = v.slice(0, 7);
    if (v.length > 3) v = `${v.slice(0, 3)}-${v.slice(3)}`;
    e.target.value = v;
}

function normalizarPlaca(placa) {
    return String(placa).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function detectarVeiculoPorPlaca() {
    const placaInput = document.getElementById('placaRegistro');
    if (!placaInput) return;

    const placa = normalizarPlaca(placaInput.value);
    if (placa.length < 7) { esconderVeiculoEncontrado(); return; }

    const veiculo = veiculosCache.find(v => normalizarPlaca(v.placa || '') === placa);
    if (!veiculo) { esconderVeiculoEncontrado(); return; }

    document.getElementById('modeloRegistro').value = veiculo.modelo || '';
    document.getElementById('corRegistro').value    = veiculo.cor || '';
    document.getElementById('moradorId').value      = veiculo.morador_id || '';
    document.getElementById('veiculoId').value      = veiculo.id || '';
    document.getElementById('tipoRegistro').value   = 'Morador';

    const box = document.getElementById('veiculoEncontrado');
    if (box) {
        const depInfo = veiculo.dependente_id && veiculo.dependente_nome
            ? `${_esc(veiculo.dependente_nome)}, dependente de ${_esc(veiculo.morador_nome || '-')}`
            : _esc(veiculo.morador_nome || '-');
        box.innerHTML = `<i class="fas fa-check-circle"></i> Veículo cadastrado: ${_esc(veiculo.modelo || '-')}, ${depInfo} (Unidade ${_esc(veiculo.morador_unidade || '-')})`;
        box.style.display = 'block';
    }

    onTipoChange();
}

function esconderVeiculoEncontrado() {
    document.getElementById('moradorId').value = '';
    document.getElementById('veiculoId').value = '';
    const box = document.getElementById('veiculoEncontrado');
    if (box) { box.style.display = 'none'; box.innerHTML = ''; }
}

// ===== STATUS =====
function classificarStatus(status, liberado) {
    const s = String(status || '').toLowerCase();
    if (liberado === 1 || s.includes('liberado') || s.includes('permitido')) return 'status-ok';
    if (s.includes('negado')) return 'status-deny';
    return 'status-warn';
}

// ===== UTILITÁRIOS =====
function formatDateTime(dateTimeRaw) {
    if (!dateTimeRaw) return '-';
    const date = new Date(dateTimeRaw.replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return String(dateTimeRaw);
    const dd = String(date.getDate()).padStart(2, '0');
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const yyyy = date.getFullYear();
    const hh = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}:${ss}`;
}

function mostrarAlerta(tipo, mensagem) {
    const box = document.getElementById('alertBox');
    if (!box) { alert(mensagem); return; }
    const classe = tipo === 'success' ? 'alert-success' : tipo === 'warning' ? 'alert-warning' : 'alert-error';
    const icone  = tipo === 'success' ? 'fa-check-circle' : tipo === 'warning' ? 'fa-exclamation-triangle' : 'fa-exclamation-circle';
    box.innerHTML = `<div class="alert ${classe}"><i class="fas ${icone}"></i> ${_esc(mensagem)}</div>`;
    setTimeout(() => { box.innerHTML = ''; }, 6000);
}

function _esc(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

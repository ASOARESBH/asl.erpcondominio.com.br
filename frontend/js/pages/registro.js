/**
 * Registro Manual Page Module
 */

const API_REGISTROS = '../api/api_registros.php';
const API_VEICULOS = '../api/api_veiculos.php';

let registrosCache = [];
let veiculosCache = [];

export function init() {
    console.log('[Registro] Inicializando...');

    setupForm();
    setupBusca();
    setupActions();

    atualizarDataHoraAtual();
    carregarVeiculos();
    carregarRegistros();

    window.RegistroPage = {
        buscar: buscarRegistros,
        excluir: excluirRegistro,
        limpar: limparFormulario
    };
}

export function destroy() {
    console.log('[Registro] Limpando...');
    delete window.RegistroPage;
    registrosCache = [];
    veiculosCache = [];
}

function setupForm() {
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
    if (tipo) {
        tipo.addEventListener('change', onTipoChange);
    }
}

function setupBusca() {
    const input = document.getElementById('buscaRegistro');
    if (!input) return;

    input.addEventListener('input', () => {
        filtrarRegistros(input.value);
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            buscarRegistros();
        }
    });
}

function setupActions() {
    const btnBuscar = document.getElementById('btnBuscarRegistro');
    if (btnBuscar) btnBuscar.addEventListener('click', buscarRegistros);

    const btnLimpar = document.getElementById('btnLimparRegistro');
    if (btnLimpar) btnLimpar.addEventListener('click', limparFormulario);
}

function setLoading(ativo) {
    const loading = document.getElementById('loadingRegistros');
    if (loading) loading.style.display = ativo ? 'block' : 'none';
}

function atualizarDataHoraAtual() {
    const input = document.getElementById('dataHoraRegistro');
    if (!input) return;

    const agora = new Date();
    agora.setMinutes(agora.getMinutes() - agora.getTimezoneOffset());
    input.value = agora.toISOString().slice(0, 16);
}

async function carregarVeiculos() {
    try {
        const response = await fetch(API_VEICULOS);
        const data = await response.json();

        if (data.sucesso && Array.isArray(data.dados)) {
            veiculosCache = data.dados;
        } else {
            veiculosCache = [];
        }
    } catch (error) {
        console.error('[Registro] Erro ao carregar veiculos:', error);
        veiculosCache = [];
    }
}

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
        renderMensagemTabela(tbody, 'Erro de conexao ao carregar registros.');
    } finally {
        setLoading(false);
    }
}

function buscarRegistros() {
    const termo = document.getElementById('buscaRegistro')?.value || '';
    filtrarRegistros(termo);
}

function filtrarRegistros(termo) {
    if (!termo || !termo.trim()) {
        renderRegistros(registrosCache);
        return;
    }

    const q = termo.toLowerCase().trim();
    const filtrados = registrosCache.filter((r) => {
        const nome = (r.morador_nome || r.nome_visitante || '').toLowerCase();
        const placa = (r.placa || '').toLowerCase();
        const tipo = (r.tipo || '').toLowerCase();
        const unidade = (r.morador_unidade || r.unidade_destino || '').toLowerCase();
        const status = (r.status || '').toLowerCase();
        const modelo = (r.modelo || '').toLowerCase();

        return (
            nome.includes(q) ||
            placa.includes(q) ||
            tipo.includes(q) ||
            unidade.includes(q) ||
            status.includes(q) ||
            modelo.includes(q)
        );
    });

    renderRegistros(filtrados);
}

function renderRegistros(registros) {
    const tbody = document.querySelector('#tabelaRegistros tbody');
    if (!tbody) return;

    if (!registros || registros.length === 0) {
        renderMensagemTabela(tbody, 'Nenhum registro encontrado.');
        return;
    }

    tbody.innerHTML = registros.map((r) => {
        const id = r.id || 0;
        const dataHora = escapeHtml(r.data_hora_formatada || formatDateTime(r.data_hora) || '-');
        const placa = escapeHtml(r.placa || '-');
        const modelo = escapeHtml(r.modelo || '-');
        const cor = escapeHtml(r.cor || '-');
        const tipo = escapeHtml(r.tipo || '-');
        const nome = escapeHtml(r.morador_nome || r.nome_visitante || r.tipo || '-');
        const unidade = escapeHtml(r.morador_unidade || r.unidade_destino || '-');
        const status = escapeHtml(r.status || '-');
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
            </tr>
        `;
    }).join('');
}

function renderMensagemTabela(tbody, mensagem) {
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state">${escapeHtml(mensagem)}</td></tr>`;
}

async function salvarRegistro() {
    const btn = document.getElementById('btnSalvarRegistro');
    if (btn) btn.disabled = true;

    try {
        const dataHoraInput = document.getElementById('dataHoraRegistro')?.value || '';
        const placa = normalizarPlaca(document.getElementById('placaRegistro')?.value || '');
        const modelo = (document.getElementById('modeloRegistro')?.value || '').trim();
        const cor = (document.getElementById('corRegistro')?.value || '').trim();
        const tipo = (document.getElementById('tipoRegistro')?.value || '').trim();
        const nomeVisitante = (document.getElementById('nomeVisitanteRegistro')?.value || '').trim();
        const unidadeDestino = (document.getElementById('unidadeDestinoRegistro')?.value || '').trim();
        const diasPermanencia = Number(document.getElementById('diasPermanenciaRegistro')?.value || 0);
        const observacao = (document.getElementById('observacaoRegistro')?.value || '').trim();

        if (!dataHoraInput || !placa || !tipo) {
            mostrarAlerta('error', 'Data/hora, placa e tipo sao obrigatorios.');
            return;
        }

        if ((tipo === 'Visitante' || tipo === 'Prestador') && !nomeVisitante) {
            mostrarAlerta('error', 'Informe o nome para visitante/prestador.');
            return;
        }

        const payload = {
            data_hora: `${dataHoraInput.replace('T', ' ')}:00`,
            placa,
            modelo,
            cor,
            tipo,
            nome_visitante: nomeVisitante,
            unidade_destino: unidadeDestino,
            dias_permanencia: diasPermanencia,
            observacao
        };

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
        if (btn) btn.disabled = false;
    }
}

async function excluirRegistro(id) {
    if (!confirm('Deseja realmente excluir este registro?')) return;

    try {
        const response = await fetch(API_REGISTROS, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: Number(id) })
        });

        const data = await response.json();

        if (!data.sucesso) {
            mostrarAlerta('error', data.mensagem || 'Falha ao excluir registro.');
            return;
        }

        mostrarAlerta('success', data.mensagem || 'Registro excluido com sucesso.');
        await carregarRegistros();
    } catch (error) {
        console.error('[Registro] Erro ao excluir registro:', error);
        mostrarAlerta('error', 'Erro de conexao ao excluir registro.');
    }
}

function limparFormulario() {
    const form = document.getElementById('registroForm');
    if (form) form.reset();

    document.getElementById('moradorId').value = '';
    document.getElementById('veiculoId').value = '';

    const extra = document.getElementById('extraCampos');
    if (extra) extra.style.display = 'none';

    const box = document.getElementById('veiculoEncontrado');
    if (box) {
        box.style.display = 'none';
        box.innerHTML = '';
    }

    atualizarDataHoraAtual();
}

function onTipoChange() {
    const tipo = document.getElementById('tipoRegistro')?.value || '';
    const extra = document.getElementById('extraCampos');

    if (!extra) return;

    if (tipo === 'Visitante' || tipo === 'Prestador') {
        extra.style.display = 'grid';
    } else {
        extra.style.display = 'none';
        document.getElementById('nomeVisitanteRegistro').value = '';
        document.getElementById('unidadeDestinoRegistro').value = '';
        document.getElementById('diasPermanenciaRegistro').value = '';
    }
}

function formatarPlacaInput(e) {
    let valor = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (valor.length > 7) valor = valor.slice(0, 7);

    if (valor.length > 3) {
        valor = `${valor.slice(0, 3)}-${valor.slice(3)}`;
    }

    e.target.value = valor;
}

function normalizarPlaca(placa) {
    return String(placa).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function detectarVeiculoPorPlaca() {
    const placaInput = document.getElementById('placaRegistro');
    if (!placaInput) return;

    const placa = normalizarPlaca(placaInput.value);
    if (placa.length < 7) {
        esconderVeiculoEncontrado();
        return;
    }

    const veiculo = veiculosCache.find((v) => normalizarPlaca(v.placa || '') === placa);
    if (!veiculo) {
        esconderVeiculoEncontrado();
        return;
    }

    document.getElementById('modeloRegistro').value = veiculo.modelo || '';
    document.getElementById('corRegistro').value = veiculo.cor || '';
    document.getElementById('moradorId').value = veiculo.morador_id || '';
    document.getElementById('veiculoId').value = veiculo.id || '';
    document.getElementById('tipoRegistro').value = 'Morador';

    const box = document.getElementById('veiculoEncontrado');
    if (box) {
        const dependenteInfo = veiculo.dependente_id && veiculo.dependente_nome
            ? `${escapeHtml(veiculo.dependente_nome)}, dependente de ${escapeHtml(veiculo.morador_nome || '-')}`
            : escapeHtml(veiculo.morador_nome || '-');

        const unidadeInfo = escapeHtml(veiculo.morador_unidade || '-');

        box.innerHTML = `<i class="fas fa-check-circle"></i> Veiculo cadastrado: ${escapeHtml(veiculo.modelo || '-')}, ${dependenteInfo} (Unidade ${unidadeInfo})`;
        box.style.display = 'block';
    }

    onTipoChange();
}

function esconderVeiculoEncontrado() {
    document.getElementById('moradorId').value = '';
    document.getElementById('veiculoId').value = '';

    const box = document.getElementById('veiculoEncontrado');
    if (box) {
        box.style.display = 'none';
        box.innerHTML = '';
    }
}

function classificarStatus(status, liberado) {
    const s = String(status || '').toLowerCase();
    if (liberado === 1 || s.includes('liberado') || s.includes('permitido')) return 'status-ok';
    if (s.includes('negado')) return 'status-deny';
    return 'status-warn';
}

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
    if (!box) return;

    const classe = tipo === 'success' ? 'alert-success' : 'alert-error';
    const icone = tipo === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';

    box.innerHTML = `<div class="alert ${classe}"><i class="fas ${icone}"></i> ${escapeHtml(mensagem)}</div>`;

    setTimeout(() => {
        box.innerHTML = '';
    }, 5000);
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

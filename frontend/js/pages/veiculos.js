/**
 * Veiculos Page Module
 */

const API_VEICULOS = '../api/api_veiculos.php';
const API_MORADORES = '../api/api_moradores.php';
const API_DEPENDENTES = '../api/api_dependentes.php';

let veiculosCache = [];
let modoEdicao = false;
let veiculoEditId = null;
let dependentesCache = [];

export function init() {
    console.log('[Veiculos] Inicializando...');

    setupForm();
    setupBusca();
    setupActions();

    carregarMoradores();
    resetForm();
    carregarVeiculos();

    window.VeiculosPage = {
        buscar: buscarVeiculos,
        editar: editarVeiculo,
        excluir: excluirVeiculo,
        cancelarEdicao: resetForm
    };
}

export function destroy() {
    console.log('[Veiculos] Limpando...');
    delete window.VeiculosPage;
    veiculosCache = [];
    modoEdicao = false;
    veiculoEditId = null;
}

function setupForm() {
    const form = document.getElementById('formVeiculo');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await salvarVeiculo();
    });
}

function setupBusca() {
    const inputBusca = document.getElementById('buscaVeiculo');
    if (!inputBusca) return;

    inputBusca.addEventListener('input', () => {
        filtrarVeiculos(inputBusca.value);
    });

    inputBusca.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            buscarVeiculos();
        }
    });
}

function setupActions() {
    const btnBuscar = document.getElementById('btnBuscarVeiculo');
    if (btnBuscar) {
        btnBuscar.addEventListener('click', buscarVeiculos);
    }

    const btnCancelar = document.getElementById('btnCancelarEdicaoVeiculo');
    if (btnCancelar) {
        btnCancelar.addEventListener('click', resetForm);
    }

    const selectMorador = document.getElementById('selectMorador');
    if (selectMorador) {
        selectMorador.addEventListener('change', async () => {
            await onMoradorChange(selectMorador.value);
        });
    }

    const btnDependentes = document.getElementById('btnToggleDependentes');
    if (btnDependentes) {
        btnDependentes.addEventListener('click', togglePainelDependentes);
    }

    const radiosDestino = document.querySelectorAll('input[name="destinoCadastro"]');
    radiosDestino.forEach((radio) => {
        radio.addEventListener('change', aplicarModoVinculo);
    });
}

function setLoading(ativo) {
    const loading = document.getElementById('loadingVeiculos');
    if (loading) {
        loading.style.display = ativo ? 'block' : 'none';
    }
}

async function carregarMoradores() {
    const select = document.getElementById('selectMorador');
    if (!select) return;

    try {
        const response = await fetch(API_MORADORES);
        const data = await response.json();

        select.innerHTML = '<option value="">Selecione um morador</option>';

        if (!data.sucesso || !Array.isArray(data.dados)) {
            return;
        }

        data.dados.forEach((morador) => {
            const id = morador.id || morador.id_morador;
            const nome = morador.nome || morador.nome_completo;
            const unidade = morador.unidade || '';
            if (!id || !nome) return;

            const option = document.createElement('option');
            option.value = String(id);
            option.textContent = unidade ? `${nome} - Unidade ${unidade}` : nome;
            select.appendChild(option);
        });
    } catch (error) {
        console.error('[Veiculos] Erro ao carregar moradores:', error);
    }
}

async function carregarVeiculos() {
    const tbody = document.querySelector('#tabelaVeiculos tbody');
    setLoading(true);

    try {
        const response = await fetch(API_VEICULOS);
        const data = await response.json();

        if (!data.sucesso) {
            renderMensagemTabela(tbody, data.mensagem || 'Erro ao carregar veiculos.');
            return;
        }

        veiculosCache = Array.isArray(data.dados) ? data.dados : [];
        renderVeiculos(veiculosCache);
    } catch (error) {
        console.error('[Veiculos] Erro ao carregar veiculos:', error);
        renderMensagemTabela(tbody, 'Erro de conexao ao carregar dados.');
    } finally {
        setLoading(false);
    }
}

function buscarVeiculos() {
    const termo = document.getElementById('buscaVeiculo')?.value || '';
    filtrarVeiculos(termo);
}

function filtrarVeiculos(termo) {
    if (!termo || !termo.trim()) {
        renderVeiculos(veiculosCache);
        return;
    }

    const termoNormalizado = termo.toLowerCase().trim();
    const filtrados = veiculosCache.filter((veiculo) => {
        const morador = (veiculo.morador_nome || '').toLowerCase();
        const modelo = (veiculo.modelo || '').toLowerCase();
        const placa = (veiculo.placa || '').toLowerCase();
        const tag = (veiculo.tag || '').toLowerCase();
        const cor = (veiculo.cor || '').toLowerCase();
        const tipo = (veiculo.tipo || '').toLowerCase();

        return (
            morador.includes(termoNormalizado) ||
            modelo.includes(termoNormalizado) ||
            placa.includes(termoNormalizado) ||
            tag.includes(termoNormalizado) ||
            cor.includes(termoNormalizado) ||
            tipo.includes(termoNormalizado)
        );
    });

    renderVeiculos(filtrados);
}

function renderVeiculos(veiculos) {
    const tbody = document.querySelector('#tabelaVeiculos tbody');
    if (!tbody) return;

    if (!veiculos || veiculos.length === 0) {
        renderMensagemTabela(tbody, 'Nenhum veiculo encontrado.');
        return;
    }

    tbody.innerHTML = veiculos.map((v) => {
        const id = v.id || '-';
        const morador = escapeHtml(v.morador_nome || '-');
        const modelo = escapeHtml(v.modelo || '-');
        const placa = escapeHtml(v.placa || '-');
        const tag = escapeHtml(v.tag || '-');
        const dependenteNome = escapeHtml(v.dependente_nome || '-');
        const cor = escapeHtml(v.cor || '-');
        const tipo = escapeHtml(v.tipo || '-');

        return `
            <tr>
                <td>${id}</td>
                <td>${morador}</td>
                <td>${modelo}</td>
                <td><span class="plate-badge">${placa}</span></td>
                <td><span class="tag-code">${tag}</span></td>
                <td>${dependenteNome}</td>
                <td>${cor}</td>
                <td>${tipo}</td>
                <td>
                    <button class="action-btn edit" type="button" onclick="window.VeiculosPage.editar(${id})" title="Editar veiculo">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete" type="button" onclick="window.VeiculosPage.excluir(${id})" title="Excluir veiculo">
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

async function salvarVeiculo() {
    const btnSalvar = document.getElementById('btnSalvarVeiculo');
    if (btnSalvar) btnSalvar.disabled = true;

    try {
        const moradorId = Number(document.getElementById('selectMorador')?.value || 0);
        const modelo = (document.getElementById('modelo')?.value || '').trim();
        const placa = normalizarPlaca(document.getElementById('placa')?.value || '');
        const tag = (document.getElementById('tag')?.value || '').trim();
        const cor = (document.getElementById('cor')?.value || '').trim();
        const tipo = (document.getElementById('tipo')?.value || '').trim();
        const destinoCadastro = getDestinoCadastro();
        const dependenteId = Number(document.getElementById('selectDependente')?.value || 0);

        if (!moradorId || !modelo || !placa || !tag) {
            alert('Morador, modelo, placa e TAG RFID sao obrigatorios.');
            return;
        }

        if (!modoEdicao && destinoCadastro === 'dependente' && !dependenteId) {
            alert('Selecione o dependente para vincular o veiculo.');
            return;
        }

        const payload = {
            morador_id: moradorId,
            modelo: modelo,
            placa: placa,
            tag: tag,
            cor: cor,
            tipo: tipo
        };

        let method = 'POST';
        if (modoEdicao && veiculoEditId) {
            method = 'PUT';
            payload.id = veiculoEditId;
        } else if (destinoCadastro === 'dependente' && dependenteId > 0) {
            payload.dependente_id = dependenteId;
        }

        const response = await fetch(API_VEICULOS, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!data.sucesso) {
            alert(`Erro: ${data.mensagem || 'Falha ao salvar veiculo.'}`);
            return;
        }

        alert(modoEdicao ? 'Veiculo atualizado com sucesso.' : 'Veiculo cadastrado com sucesso.');
        resetForm();
        await carregarVeiculos();
    } catch (error) {
        console.error('[Veiculos] Erro ao salvar:', error);
        alert('Erro interno ao salvar veiculo.');
    } finally {
        if (btnSalvar) btnSalvar.disabled = false;
    }
}

function editarVeiculo(id) {
    const veiculo = veiculosCache.find((item) => Number(item.id) === Number(id));
    if (!veiculo) return;

    modoEdicao = true;
    veiculoEditId = Number(id);

    document.getElementById('veiculoId').value = String(veiculoEditId);
    document.getElementById('selectMorador').value = String(veiculo.morador_id || '');
    document.getElementById('modelo').value = veiculo.modelo || '';
    document.getElementById('placa').value = veiculo.placa || '';
    document.getElementById('tag').value = veiculo.tag || '';
    document.getElementById('cor').value = veiculo.cor || '';
    document.getElementById('tipo').value = veiculo.tipo || '';
    preencherPainelDependentesEdicao(veiculo);

    const btnSalvar = document.getElementById('btnSalvarVeiculo');
    if (btnSalvar) {
        btnSalvar.innerHTML = '<i class="fas fa-sync"></i> Atualizar Veiculo';
    }

    const btnCancelar = document.getElementById('btnCancelarEdicaoVeiculo');
    if (btnCancelar) {
        btnCancelar.style.display = 'inline-flex';
    }

    setControlesVinculoEditando(true);

    document.getElementById('formVeiculo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function excluirVeiculo(id) {
    if (!confirm('Deseja realmente excluir este veiculo?')) {
        return;
    }

    try {
        const response = await fetch(API_VEICULOS, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: Number(id) })
        });

        const data = await response.json();

        if (!data.sucesso) {
            alert(`Erro: ${data.mensagem || 'Falha ao excluir veiculo.'}`);
            return;
        }

        if (modoEdicao && Number(veiculoEditId) === Number(id)) {
            resetForm();
        }

        await carregarVeiculos();
    } catch (error) {
        console.error('[Veiculos] Erro ao excluir:', error);
        alert('Erro de conexao ao excluir veiculo.');
    }
}

function resetForm() {
    const form = document.getElementById('formVeiculo');
    if (form) {
        form.reset();
    }

    document.getElementById('veiculoId').value = '';

    modoEdicao = false;
    veiculoEditId = null;
    dependentesCache = [];

    const btnSalvar = document.getElementById('btnSalvarVeiculo');
    if (btnSalvar) {
        btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar Veiculo';
        btnSalvar.disabled = false;
    }

    const btnCancelar = document.getElementById('btnCancelarEdicaoVeiculo');
    if (btnCancelar) {
        btnCancelar.style.display = 'none';
    }

    resetPainelDependentes();
    setControlesVinculoEditando(false);
}

function normalizarPlaca(placa) {
    return String(placa).trim().toUpperCase().replace(/\s+/g, '');
}

async function onMoradorChange(moradorId) {
    if (!moradorId) {
        resetPainelDependentes();
        return;
    }

    await carregarDependentesDoMorador(Number(moradorId));
}

async function carregarDependentesDoMorador(moradorId) {
    const status = document.getElementById('dependentesStatus');
    const btnDependentes = document.getElementById('btnToggleDependentes');
    const selectDependente = document.getElementById('selectDependente');

    dependentesCache = [];
    if (selectDependente) {
        selectDependente.innerHTML = '<option value="">Selecione um dependente</option>';
    }

    try {
        const response = await fetch(`${API_DEPENDENTES}?morador_id=${moradorId}`);
        const data = await response.json();

        if (!data.sucesso || !Array.isArray(data.dados) || data.dados.length === 0) {
            if (status) status.textContent = 'Este morador nao possui dependentes cadastrados';
            if (btnDependentes) btnDependentes.disabled = true;
            esconderPainelDependentes();
            return;
        }

        dependentesCache = data.dados;
        if (status) status.textContent = `${dependentesCache.length} dependente(s) encontrado(s)`;
        if (btnDependentes) btnDependentes.disabled = false;

        dependentesCache.forEach((dep) => {
            const nome = dep.nome_completo || dep.nome || '';
            if (!nome || !selectDependente) return;
            const option = document.createElement('option');
            option.value = String(dep.id);
            option.textContent = nome;
            selectDependente.appendChild(option);
        });
    } catch (error) {
        console.error('[Veiculos] Erro ao carregar dependentes:', error);
        if (status) status.textContent = 'Falha ao carregar dependentes';
        if (btnDependentes) btnDependentes.disabled = true;
        esconderPainelDependentes();
    }
}

function togglePainelDependentes() {
    const panel = document.getElementById('dependentesPanel');
    if (!panel || dependentesCache.length === 0) return;

    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    aplicarModoVinculo();
}

function esconderPainelDependentes() {
    const panel = document.getElementById('dependentesPanel');
    if (panel) panel.style.display = 'none';
    selecionarDestinoCadastro('morador');
    aplicarModoVinculo();
}

function resetPainelDependentes() {
    const status = document.getElementById('dependentesStatus');
    const btnDependentes = document.getElementById('btnToggleDependentes');
    const selectDependente = document.getElementById('selectDependente');

    if (status) status.textContent = 'Selecione um morador';
    if (btnDependentes) btnDependentes.disabled = true;
    if (selectDependente) selectDependente.innerHTML = '<option value="">Selecione um dependente</option>';

    esconderPainelDependentes();
}

function getDestinoCadastro() {
    const selected = document.querySelector('input[name="destinoCadastro"]:checked');
    return selected ? selected.value : 'morador';
}

function selecionarDestinoCadastro(valor) {
    const radio = document.querySelector(`input[name="destinoCadastro"][value="${valor}"]`);
    if (radio) radio.checked = true;
}

function aplicarModoVinculo() {
    const wrap = document.getElementById('dependenteSelectWrap');
    const selectDependente = document.getElementById('selectDependente');
    const modo = getDestinoCadastro();

    const mostrarDependente = modo === 'dependente';
    if (wrap) wrap.style.display = mostrarDependente ? 'block' : 'none';
    if (selectDependente) {
        selectDependente.required = mostrarDependente;
        if (!mostrarDependente) selectDependente.value = '';
    }
}

function setControlesVinculoEditando(editando) {
    const selectMorador = document.getElementById('selectMorador');
    const btnDependentes = document.getElementById('btnToggleDependentes');
    const radios = document.querySelectorAll('input[name="destinoCadastro"]');
    const selectDependente = document.getElementById('selectDependente');

    if (selectMorador) selectMorador.disabled = editando;
    if (btnDependentes) btnDependentes.disabled = editando || dependentesCache.length === 0;
    radios.forEach((radio) => {
        radio.disabled = editando;
    });
    if (selectDependente) selectDependente.disabled = editando;
}

function preencherPainelDependentesEdicao(veiculo) {
    const panel = document.getElementById('dependentesPanel');
    const status = document.getElementById('dependentesStatus');
    const selectDependente = document.getElementById('selectDependente');

    if (!panel || !status || !selectDependente) return;

    panel.style.display = 'block';
    status.textContent = veiculo.dependente_id
        ? 'Veiculo vinculado a dependente (somente leitura na edicao)'
        : 'Veiculo vinculado ao morador (somente leitura na edicao)';

    selectDependente.innerHTML = '<option value="">Selecione um dependente</option>';

    if (veiculo.dependente_id) {
        const option = document.createElement('option');
        option.value = String(veiculo.dependente_id);
        option.textContent = veiculo.dependente_nome || `Dependente #${veiculo.dependente_id}`;
        selectDependente.appendChild(option);
        selectDependente.value = String(veiculo.dependente_id);
        selecionarDestinoCadastro('dependente');
    } else {
        selecionarDestinoCadastro('morador');
    }

    aplicarModoVinculo();
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

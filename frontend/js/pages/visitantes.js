/**
 * Visitantes Page Module
 */

const API_ACESSOS = '../api/api_acessos_visitantes.php';
const API_VISITANTES = '../api/api_visitantes.php';

let acessosCache = [];
let modoEdicao = false;
let acessoIdEdicao = null;

export function init() {
    console.log('[Visitantes] Inicializando...');

    setupForm();
    setupBusca();
    setupActions();
    resetForm();

    carregarAcessos();

    window.VisitantesPage = {
        buscar: buscarVisitantes,
        editar: editarAcesso,
        excluir: excluirAcesso,
        cancelarEdicao: resetForm
    };
}

export function destroy() {
    console.log('[Visitantes] Limpando...');
    delete window.VisitantesPage;
    acessosCache = [];
    modoEdicao = false;
    acessoIdEdicao = null;
}

function setupForm() {
    const form = document.getElementById('visitanteForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await salvarAcesso();
    });
}

function setupBusca() {
    const inputBusca = document.getElementById('searchVisitante');
    if (!inputBusca) return;

    inputBusca.addEventListener('input', () => {
        filtrarVisitantes(inputBusca.value);
    });

    inputBusca.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            buscarVisitantes();
        }
    });
}

function setupActions() {
    const btnBuscar = document.getElementById('btnBuscarVisitante');
    if (btnBuscar) {
        btnBuscar.addEventListener('click', buscarVisitantes);
    }

    const btnCancelar = document.getElementById('btnCancelarEdicao');
    if (btnCancelar) {
        btnCancelar.addEventListener('click', resetForm);
    }
}

function setLoading(ativo) {
    const loading = document.getElementById('loadingVisitantes');
    if (loading) {
        loading.style.display = ativo ? 'block' : 'none';
    }
}

async function carregarAcessos() {
    const tbody = document.querySelector('#tabelaVisitantes tbody');
    setLoading(true);

    try {
        const response = await fetch(API_ACESSOS);
        const data = await response.json();

        if (!data.sucesso) {
            renderMensagemTabela(tbody, data.mensagem || 'Erro ao carregar acessos.');
            return;
        }

        acessosCache = Array.isArray(data.dados) ? data.dados : [];
        renderAcessos(acessosCache);
    } catch (error) {
        console.error('[Visitantes] Erro ao carregar acessos:', error);
        renderMensagemTabela(tbody, 'Erro de conexao ao carregar dados.');
    } finally {
        setLoading(false);
    }
}

function buscarVisitantes() {
    const termo = document.getElementById('searchVisitante')?.value || '';
    filtrarVisitantes(termo);
}

function filtrarVisitantes(termo) {
    if (!termo || !termo.trim()) {
        renderAcessos(acessosCache);
        return;
    }

    const termoNormalizado = termo.toLowerCase().trim();
    const filtrados = acessosCache.filter((acesso) => {
        const nome = (acesso.visitante_nome || '').toLowerCase();
        const documento = String(acesso.documento || acesso.visitante_documento || '').toLowerCase();
        const unidade = (acesso.unidade_destino || '').toLowerCase();
        const placa = (acesso.placa || '').toLowerCase();

        return (
            nome.includes(termoNormalizado) ||
            documento.includes(termoNormalizado) ||
            unidade.includes(termoNormalizado) ||
            placa.includes(termoNormalizado)
        );
    });

    renderAcessos(filtrados);
}

function renderAcessos(acessos) {
    const tbody = document.querySelector('#tabelaVisitantes tbody');
    if (!tbody) return;

    if (!acessos || acessos.length === 0) {
        renderMensagemTabela(tbody, 'Nenhum acesso de visitante encontrado.');
        return;
    }

    tbody.innerHTML = acessos.map((a) => {
        const id = a.id || '-';
        const nome = escapeHtml(a.visitante_nome || '-');
        const documento = escapeHtml(a.documento || a.visitante_documento || '-');
        const unidade = escapeHtml(a.unidade_destino || '-');
        const entrada = formatDate(a.data_inicial);
        const saida = formatDate(a.data_final);

        return `
            <tr>
                <td>${id}</td>
                <td><strong>${nome}</strong></td>
                <td>${documento}</td>
                <td>${unidade}</td>
                <td>${entrada}</td>
                <td>${saida}</td>
                <td>
                    <button class="action-btn edit" type="button" onclick="window.VisitantesPage.editar(${id})" title="Editar acesso">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete" type="button" onclick="window.VisitantesPage.excluir(${id})" title="Excluir acesso">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function renderMensagemTabela(tbody, mensagem) {
    if (!tbody) return;
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">${escapeHtml(mensagem)}</td></tr>`;
}

async function salvarAcesso() {
    const btnSalvar = document.getElementById('btnSalvarVisitante');
    if (btnSalvar) btnSalvar.disabled = true;

    try {
        const nome = (document.getElementById('nomeVisitante')?.value || '').trim();
        const documento = (document.getElementById('documento')?.value || '').trim();
        const unidade = (document.getElementById('unidadeVisitada')?.value || '').trim();
        const entradaRaw = document.getElementById('dataEntrada')?.value;
        const saidaRaw = document.getElementById('dataSaida')?.value;
        const veiculo = (document.getElementById('veiculoVisitante')?.value || '').trim().toUpperCase();

        if (!nome || !documento || !unidade || !entradaRaw || !saidaRaw) {
            alert('Preencha todos os campos obrigatorios.');
            return;
        }

        const dataInicial = toApiDate(entradaRaw);
        const dataFinal = toApiDate(saidaRaw);

        if (dataFinal < dataInicial) {
            alert('A data de saida nao pode ser menor que a data de entrada.');
            return;
        }

        let response;

        if (modoEdicao && acessoIdEdicao) {
            const payloadEdicao = {
                id: acessoIdEdicao,
                data_inicial: dataInicial,
                data_final: dataFinal,
                tipo_acesso: 'portaria',
                ativo: 1
            };

            response = await fetch(API_ACESSOS, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payloadEdicao)
            });
        } else {
            const visitanteId = await obterOuCriarVisitanteId(nome, documento);
            if (!visitanteId) {
                alert('Nao foi possivel identificar o visitante para criar o acesso.');
                return;
            }

            const payloadNovo = {
                visitante_id: visitanteId,
                data_inicial: dataInicial,
                data_final: dataFinal,
                tipo_acesso: 'portaria',
                unidade_destino: unidade,
                placa: veiculo,
                tipo_visitante: 'visitante',
                modelo: '',
                cor: ''
            };

            response = await fetch(API_ACESSOS, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payloadNovo)
            });
        }

        const data = await response.json();

        if (!data.sucesso) {
            alert(`Erro: ${data.mensagem || 'Falha ao salvar acesso.'}`);
            return;
        }

        alert(modoEdicao ? 'Acesso atualizado com sucesso.' : 'Acesso registrado com sucesso.');
        resetForm();
        await carregarAcessos();
    } catch (error) {
        console.error('[Visitantes] Erro ao salvar:', error);
        alert('Erro interno ao salvar acesso.');
    } finally {
        if (btnSalvar) btnSalvar.disabled = false;
    }
}

async function obterOuCriarVisitanteId(nome, documento) {
    const payloadCriacao = {
        nome_completo: nome,
        documento: documento,
        tipo_documento: 'CPF'
    };

    try {
        const resCriar = await fetch(API_VISITANTES, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payloadCriacao)
        });

        const dataCriar = await resCriar.json();

        if (dataCriar.sucesso) {
            return dataCriar?.dados?.id || dataCriar?.id || null;
        }

        const mensagem = (dataCriar.mensagem || '').toLowerCase();
        const pareceDuplicado = mensagem.includes('duplic') || mensagem.includes('ja existe') || mensagem.includes('cadastrad');

        if (!pareceDuplicado) {
            return null;
        }

        const resBusca = await fetch(`${API_VISITANTES}?busca=${encodeURIComponent(documento)}`);
        const dataBusca = await resBusca.json();

        if (!dataBusca.sucesso || !Array.isArray(dataBusca.dados)) {
            return null;
        }

        const visitante = dataBusca.dados.find((v) => String(v.documento || '').trim() === documento);
        return visitante?.id || null;
    } catch (error) {
        console.error('[Visitantes] Erro ao obter/criar visitante:', error);
        return null;
    }
}

function editarAcesso(id) {
    const acesso = acessosCache.find((item) => Number(item.id) === Number(id));
    if (!acesso) return;

    modoEdicao = true;
    acessoIdEdicao = Number(id);

    document.getElementById('acessoId').value = String(acessoIdEdicao);
    document.getElementById('nomeVisitante').value = acesso.visitante_nome || '';
    document.getElementById('documento').value = acesso.documento || acesso.visitante_documento || '';
    document.getElementById('unidadeVisitada').value = acesso.unidade_destino || '';
    document.getElementById('dataEntrada').value = toInputDate(acesso.data_inicial);
    document.getElementById('dataSaida').value = toInputDate(acesso.data_final);
    document.getElementById('veiculoVisitante').value = acesso.placa || '';

    const btnSalvar = document.getElementById('btnSalvarVisitante');
    if (btnSalvar) {
        btnSalvar.innerHTML = '<i class="fas fa-sync"></i> Atualizar Acesso';
    }

    const btnCancelar = document.getElementById('btnCancelarEdicao');
    if (btnCancelar) {
        btnCancelar.style.display = 'inline-flex';
    }

    document.getElementById('visitanteForm')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function excluirAcesso(id) {
    if (!confirm('Deseja realmente excluir este acesso?')) {
        return;
    }

    try {
        const response = await fetch(`${API_ACESSOS}?id=${id}`, { method: 'DELETE' });
        const data = await response.json();

        if (!data.sucesso) {
            alert(`Erro: ${data.mensagem || 'Falha ao excluir acesso.'}`);
            return;
        }

        if (modoEdicao && Number(acessoIdEdicao) === Number(id)) {
            resetForm();
        }

        await carregarAcessos();
    } catch (error) {
        console.error('[Visitantes] Erro ao excluir acesso:', error);
        alert('Erro de conexao ao excluir acesso.');
    }
}

function resetForm() {
    const form = document.getElementById('visitanteForm');
    if (form) {
        form.reset();
    }

    document.getElementById('acessoId').value = '';

    const hoje = new Date().toISOString().slice(0, 10);
    const dataEntrada = document.getElementById('dataEntrada');
    const dataSaida = document.getElementById('dataSaida');
    if (dataEntrada && !dataEntrada.value) dataEntrada.value = hoje;
    if (dataSaida && !dataSaida.value) dataSaida.value = hoje;

    modoEdicao = false;
    acessoIdEdicao = null;

    const btnSalvar = document.getElementById('btnSalvarVisitante');
    if (btnSalvar) {
        btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar Acesso';
        btnSalvar.disabled = false;
    }

    const btnCancelar = document.getElementById('btnCancelarEdicao');
    if (btnCancelar) {
        btnCancelar.style.display = 'none';
    }
}

function formatDate(dateString) {
    if (!dateString) return '-';

    if (dateString.includes('/')) return dateString;

    const datePart = dateString.includes('T') ? dateString.split('T')[0] : dateString;
    const parts = datePart.split('-');

    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }

    return dateString;
}

function toApiDate(inputDate) {
    if (!inputDate) return '';
    return inputDate.split('T')[0];
}

function toInputDate(value) {
    if (!value) return '';
    return value.includes('T') ? value.split('T')[0] : value;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

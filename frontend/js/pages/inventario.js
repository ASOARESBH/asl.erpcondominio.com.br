/**
 * Inventário de Patrimônio - Módulo de Página
 * Gerencia cadastro e controle de itens patrimoniais
 */

let itemEditando = null;
let usuarios = [];

/**
 * Inicializar página
 */
export function init() {
    console.log('[Inventario] Inicializando...');

    carregarUsuarios();
    carregarInventario();
    configurarEnterBusca();

    // Configurar listener do formulário
    document.getElementById('formInventario').addEventListener('submit', handleSubmitForm);

    // Configurar listener do status para mostrar/ocultar campos condicionais
    document.getElementById('status').addEventListener('change', toggleMotivoBaixa);

    // Expor funções globais
    window.InventarioPage = {
        buscarInventario,
        limparBusca,
        editarItem,
        excluirItem,
        limparFormulario
    };

    console.log('[Inventario] ✅ Inicializado');
}

/**
 * Destruir página (cleanup)
 */
export function destroy() {
    console.log('[Inventario] Destruindo...');

    // Remover event listeners
    const form = document.getElementById('formInventario');
    if (form) {
        form.removeEventListener('submit', handleSubmitForm);
    }

    const statusSelect = document.getElementById('status');
    if (statusSelect) {
        statusSelect.removeEventListener('change', toggleMotivoBaixa);
    }

    // Limpar namespace global
    if (window.InventarioPage) {
        delete window.InventarioPage;
    }

    // Limpar dados
    itemEditando = null;
    usuarios = [];

    console.log('[Inventario] ✅ Destruído');
}

// ========== FUNÇÕES DE CARREGAMENTO ==========

function carregarUsuarios() {
    fetch('../api/api_usuarios.php')
        .then(r => r.json())
        .then(data => {
            if (data.sucesso) {
                usuarios = data.dados.filter(u => u.ativo == 1);

                // Preencher select de tutela no formulário
                const selectTutela = document.getElementById('tutelaUsuarioId');
                if (selectTutela) {
                    selectTutela.innerHTML = '<option value="">Sem responsável</option>';
                    usuarios.forEach(u => {
                        const funcao = u.funcao ? ` - ${u.funcao}` : '';
                        selectTutela.innerHTML += `<option value="${u.id}">${u.nome}${funcao}</option>`;
                    });
                }

                // Preencher select de filtro
                const selectFiltro = document.getElementById('filtroTutela');
                if (selectFiltro) {
                    selectFiltro.innerHTML = '<option value="">Todos</option>';
                    usuarios.forEach(u => {
                        selectFiltro.innerHTML += `<option value="${u.id}">${u.nome}</option>`;
                    });
                }

                console.log('[Inventario] ✅ Usuários carregados:', usuarios.length);
            }
        })
        .catch(err => {
            console.error('[Inventario] ❌ Erro ao carregar usuários:', err);
        });
}

function carregarInventario() {
    fetch('../api/api_inventario.php')
        .then(r => r.json())
        .then(data => {
            if (data.sucesso) {
                renderizarTabela(data.dados);
            } else {
                mostrarAlerta('Erro ao carregar inventário', 'error');
            }
        })
        .catch(err => {
            console.error('[Inventario] ❌ Erro:', err);
            mostrarAlerta('Erro ao conectar com o servidor', 'error');
        });
}

function buscarInventario() {
    const params = new URLSearchParams();

    const numeroPatrimonio = document.getElementById('filtroNumeroPatrimonio').value;
    const nf = document.getElementById('filtroNF').value;
    const situacao = document.getElementById('filtroSituacao').value;
    const status = document.getElementById('filtroStatus').value;
    const tutela = document.getElementById('filtroTutela').value;

    if (numeroPatrimonio) params.append('numero_patrimonio', numeroPatrimonio);
    if (nf) params.append('nf', nf);
    if (situacao) params.append('situacao', situacao);
    if (status) params.append('status', status);
    if (tutela) params.append('tutela', tutela);

    fetch(`../api/api_inventario.php?${params.toString()}`)
        .then(r => r.json())
        .then(data => {
            if (data.sucesso) {
                renderizarTabela(data.dados);
                if (data.dados.length === 0) {
                    mostrarAlerta('Nenhum item encontrado com os filtros aplicados', 'error');
                }
            }
        })
        .catch(err => {
            console.error('[Inventario] ❌ Erro na busca:', err);
        });
}

function limparBusca() {
    document.getElementById('filtroNumeroPatrimonio').value = '';
    document.getElementById('filtroNF').value = '';
    document.getElementById('filtroSituacao').value = '';
    document.getElementById('filtroStatus').value = '';
    document.getElementById('filtroTutela').value = '';
    carregarInventario();
}

function configurarEnterBusca() {
    const campos = ['filtroNumeroPatrimonio', 'filtroNF'];
    campos.forEach(id => {
        const campo = document.getElementById(id);
        if (campo) {
            campo.addEventListener('keypress', function (e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    buscarInventario();
                }
            });
        }
    });
}

// ========== RENDERIZAÇÃO ==========

function renderizarTabela(itens) {
    const tbody = document.getElementById('tabelaInventario');
    if (!tbody) return;

    if (itens.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align: center;">Nenhum item cadastrado</td></tr>';
        return;
    }

    tbody.innerHTML = itens.map(item => `
        <tr>
            <td><strong>${item.numero_patrimonio}</strong></td>
            <td>${item.nome_item}</td>
            <td>${item.fabricante || '-'}</td>
            <td>${item.modelo || '-'}</td>
            <td>${item.nf || '-'}</td>
            <td><span class="badge badge-${item.situacao === 'imobilizado' ? 'primary' : 'warning'}">${item.situacao === 'imobilizado' ? 'Imobilizado' : 'Circulante'}</span></td>
            <td>R$ ${parseFloat(item.valor || 0).toFixed(2)}</td>
            <td><span class="badge badge-${item.status === 'ativo' ? 'success' : 'danger'}">${item.status === 'ativo' ? 'Ativo' : 'Inativo'}</span></td>
            <td>${item.tutela_nome || '-'}</td>
            <td>
                <button class="btn-edit" onclick="window.InventarioPage.editarItem(${item.id})"><i class="fas fa-edit"></i></button>
                <button class="btn-delete" onclick="window.InventarioPage.excluirItem(${item.id}, '${item.numero_patrimonio}')"><i class="fas fa-trash"></i></button>
            </td>
        </tr>
    `).join('');
}

// ========== HANDLERS ==========

function handleSubmitForm(e) {
    e.preventDefault();
    salvarItem();
}

function toggleMotivoBaixa() {
    const status = document.getElementById('status').value;
    const campoMotivo = document.getElementById('campoMotivoBaixa');
    const campoData = document.getElementById('campoDataBaixa');
    const motivoInput = document.getElementById('motivoBaixa');

    if (status === 'inativo') {
        if (campoMotivo) campoMotivo.classList.add('show');
        if (campoData) campoData.classList.add('show');
        if (motivoInput) motivoInput.required = true;
    } else {
        if (campoMotivo) campoMotivo.classList.remove('show');
        if (campoData) campoData.classList.remove('show');
        if (motivoInput) {
            motivoInput.required = false;
            motivoInput.value = '';
        }
        const dataBaixaInput = document.getElementById('dataBaixa');
        if (dataBaixaInput) dataBaixaInput.value = '';
    }
}

function salvarItem() {
    const dados = {
        numero_patrimonio: document.getElementById('numeroPatrimonio').value,
        nome_item: document.getElementById('nomeItem').value,
        fabricante: document.getElementById('fabricante').value,
        modelo: document.getElementById('modelo').value,
        numero_serie: document.getElementById('numeroSerie').value,
        nf: document.getElementById('nf').value,
        data_compra: document.getElementById('dataCompra').value,
        situacao: document.getElementById('situacao').value,
        valor: document.getElementById('valor').value,
        status: document.getElementById('status').value,
        motivo_baixa: document.getElementById('motivoBaixa').value,
        data_baixa: document.getElementById('dataBaixa').value,
        tutela_usuario_id: document.getElementById('tutelaUsuarioId').value,
        observacoes: document.getElementById('observacoes').value
    };

    const metodo = itemEditando ? 'PUT' : 'POST';
    if (itemEditando) {
        dados.id = itemEditando;
    }

    fetch('../api/api_inventario.php', {
        method: metodo,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados)
    })
        .then(r => r.json())
        .then(data => {
            if (data.sucesso) {
                mostrarAlerta(data.mensagem, 'success');
                limparFormulario();
                carregarInventario();
            } else {
                mostrarAlerta(data.mensagem, 'error');
            }
        })
        .catch(err => {
            console.error('[Inventario] ❌ Erro:', err);
            mostrarAlerta('Erro ao salvar item', 'error');
        });
}

function editarItem(id) {
    fetch('../api/api_inventario.php')
        .then(r => r.json())
        .then(data => {
            if (data.sucesso) {
                const item = data.dados.find(i => i.id == id);
                if (item) {
                    document.getElementById('itemId').value = item.id;
                    document.getElementById('numeroPatrimonio').value = item.numero_patrimonio;
                    document.getElementById('nomeItem').value = item.nome_item;
                    document.getElementById('fabricante').value = item.fabricante || '';
                    document.getElementById('modelo').value = item.modelo || '';
                    document.getElementById('numeroSerie').value = item.numero_serie || '';
                    document.getElementById('nf').value = item.nf || '';
                    document.getElementById('dataCompra').value = item.data_compra || '';
                    document.getElementById('situacao').value = item.situacao;
                    document.getElementById('valor').value = item.valor || '';
                    document.getElementById('status').value = item.status;
                    document.getElementById('motivoBaixa').value = item.motivo_baixa || '';
                    document.getElementById('dataBaixa').value = item.data_baixa || '';
                    document.getElementById('tutelaUsuarioId').value = item.tutela_usuario_id || '';
                    document.getElementById('observacoes').value = item.observacoes || '';

                    toggleMotivoBaixa();

                    itemEditando = id;
                    document.getElementById('formTitle').textContent = 'Editar Item de Patrimônio';
                    document.getElementById('btnSalvarTexto').textContent = 'Atualizar Item';

                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            }
        })
        .catch(err => {
            console.error('[Inventario] ❌ Erro ao editar:', err);
        });
}

function excluirItem(id, numeroPatrimonio) {
    if (!confirm(`Deseja realmente excluir o patrimônio "${numeroPatrimonio}"?`)) {
        return;
    }

    fetch('../api/api_inventario.php', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id })
    })
        .then(r => r.json())
        .then(data => {
            if (data.sucesso) {
                mostrarAlerta(data.mensagem, 'success');
                carregarInventario();
            } else {
                mostrarAlerta(data.mensagem, 'error');
            }
        })
        .catch(err => {
            console.error('[Inventario] ❌ Erro ao excluir:', err);
        });
}

function limparFormulario() {
    const form = document.getElementById('formInventario');
    if (form) {
        form.reset();
    }
    document.getElementById('itemId').value = '';
    itemEditando = null;
    document.getElementById('formTitle').textContent = 'Novo Item de Patrimônio';
    document.getElementById('btnSalvarTexto').textContent = 'Salvar Item';
    toggleMotivoBaixa();
}

// ========== UTILITÁRIOS ==========

function mostrarAlerta(mensagem, tipo) {
    const container = document.getElementById('alertContainer');
    if (!container) return;

    const div = document.createElement('div');
    div.className = `alert alert-${tipo}`;
    div.innerHTML = `<i class="fas fa-${tipo === 'success' ? 'check-circle' : 'exclamation-circle'}"></i> ${mensagem}`;
    container.appendChild(div);
    setTimeout(() => div.remove(), 5000);
}

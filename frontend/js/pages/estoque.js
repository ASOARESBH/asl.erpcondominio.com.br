/**
 * Gestão de Estoque - Módulo de Página
 * Gerencia produtos, categorias e controle de estoque
 */

let editando = false;

/**
 * Inicializar página
 */
export function init() {
    console.log('[Estoque] Inicializando...');

    carregarDashboard();
    carregarCategorias();
    carregarProdutos();

    // Configurar listener do formulário
    document.getElementById('produtoForm').addEventListener('submit', handleSubmitForm);

    // Expor funções globais
    window.EstoquePage = {
        carregarProdutos,
        editarProduto,
        excluirProduto,
        limparFormulario
    };

    console.log('[Estoque] ✅ Inicializado');
}

/**
 * Destruir página (cleanup)
 */
export function destroy() {
    console.log('[Estoque] Destruindo...');

    // Remover event listeners
    const form = document.getElementById('produtoForm');
    if (form) {
        form.removeEventListener('submit', handleSubmitForm);
    }

    // Limpar namespace global
    if (window.EstoquePage) {
        delete window.EstoquePage;
    }

    // Limpar dados
    editando = false;

    console.log('[Estoque] ✅ Destruído');
}

// ========== FUNÇÕES DE CARREGAMENTO ==========

async function carregarDashboard() {
    try {
        const response = await fetch('../api/api_estoque.php?action=dashboard');
        const data = await response.json();
        if (data.sucesso) {
            const elemTotal = document.getElementById('totalProdutos');
            const elemValor = document.getElementById('valorTotal');
            const elemBaixo = document.getElementById('estoqueBaixo');
            const elemZerado = document.getElementById('estoqueZerado');

            if (elemTotal) elemTotal.textContent = data.dados.total_produtos || 0;
            if (elemValor) elemValor.textContent = 'R$ ' + (data.dados.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
            if (elemBaixo) elemBaixo.textContent = data.dados.produtos_estoque_baixo || 0;
            if (elemZerado) elemZerado.textContent = data.dados.produtos_zerados || 0;

            console.log('[Estoque] ✅ Dashboard carregado');
        }
    } catch (error) {
        console.error('[Estoque] ❌ Erro ao carregar dashboard:', error);
    }
}

async function carregarCategorias() {
    try {
        const response = await fetch('../api/api_estoque.php?action=categorias');
        const data = await response.json();
        if (data.sucesso) {
            const selectCadastro = document.getElementById('categoria_id');
            const selectFiltro = document.getElementById('filtroCategoria');

            if (selectCadastro) {
                selectCadastro.innerHTML = '<option value="">Selecione...</option>';
                data.dados.forEach(cat => {
                    selectCadastro.innerHTML += `<option value="${cat.id}">${cat.nome}</option>`;
                });
            }

            if (selectFiltro) {
                selectFiltro.innerHTML = '<option value="">Todas as categorias</option>';
                data.dados.forEach(cat => {
                    selectFiltro.innerHTML += `<option value="${cat.id}">${cat.nome}</option>`;
                });
            }

            console.log('[Estoque] ✅ Categorias carregadas:', data.dados.length);
        }
    } catch (error) {
        console.error('[Estoque] ❌ Erro ao carregar categorias:', error);
    }
}

async function carregarProdutos() {
    const busca = document.getElementById('busca').value;
    const categoria = document.getElementById('filtroCategoria').value;
    const estoque = document.getElementById('filtroEstoque').value;

    const tbody = document.getElementById('produtosTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="9" class="loading"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';

    try {
        let url = '../api/api_estoque.php?action=produtos';
        if (busca) url += '&busca=' + encodeURIComponent(busca);
        if (categoria) url += '&categoria_id=' + categoria;
        if (estoque === 'baixo') url += '&estoque_baixo=1';
        if (estoque === 'zerado') url += '&estoque_zerado=1';

        const response = await fetch(url);
        const data = await response.json();

        if (data.sucesso && data.dados.length > 0) {
            tbody.innerHTML = '';
            data.dados.forEach(produto => {
                const valorTotal = (produto.preco_unitario * produto.quantidade_estoque).toFixed(2);
                let statusBadge = '<span class="badge badge-success">Normal</span>';

                if (produto.quantidade_estoque == 0) {
                    statusBadge = '<span class="badge badge-danger">Zerado</span>';
                } else if (produto.quantidade_estoque <= produto.estoque_minimo) {
                    statusBadge = '<span class="badge badge-warning">Baixo</span>';
                }

                tbody.innerHTML += `
                    <tr>
                        <td>${produto.codigo}</td>
                        <td>${produto.nome}</td>
                        <td>${produto.categoria_nome || '-'}</td>
                        <td>${produto.unidade_medida}</td>
                        <td>R$ ${parseFloat(produto.preco_unitario).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td>${parseFloat(produto.quantidade_estoque).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td>R$ ${parseFloat(valorTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td>${statusBadge}</td>
                        <td class="action-buttons">
                            <button class="btn btn-sm btn-primary" onclick="window.EstoquePage.editarProduto(${produto.id})"><i class="fas fa-edit"></i></button>
                            <button class="btn btn-sm btn-danger" onclick="window.EstoquePage.excluirProduto(${produto.id}, '${produto.nome.replace(/'/g, "\\'")}')"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            });
            console.log('[Estoque] ✅ Produtos carregados:', data.dados.length);
        } else {
            tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><i class="fas fa-box-open"></i><br>Nenhum produto encontrado</td></tr>';
        }
    } catch (error) {
        console.error('[Estoque] ❌ Erro ao carregar produtos:', error);
        tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><i class="fas fa-exclamation-triangle"></i><br>Erro ao carregar produtos</td></tr>';
    }
}

// ========== HANDLERS ==========

function handleSubmitForm(e) {
    e.preventDefault();
    salvarProduto();
}

async function salvarProduto() {
    const formData = {
        nome: document.getElementById('nome').value,
        categoria_id: document.getElementById('categoria_id').value,
        unidade_medida: document.getElementById('unidade_medida').value,
        descricao: document.getElementById('descricao').value,
        preco_unitario: document.getElementById('preco_unitario').value,
        quantidade_estoque: document.getElementById('quantidade_estoque').value,
        estoque_minimo: document.getElementById('estoque_minimo').value || 0,
        estoque_maximo: document.getElementById('estoque_maximo').value || 0,
        localizacao: document.getElementById('localizacao').value,
        fornecedor: document.getElementById('fornecedor').value
    };

    try {
        let url = '../api/api_estoque.php?action=produtos';
        let method = 'POST';

        if (editando) {
            formData.id = document.getElementById('produtoId').value;
            method = 'PUT';
        }

        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (data.sucesso) {
            mostrarAlerta('success', data.mensagem);
            limparFormulario();
            carregarProdutos();
            carregarDashboard();
        } else {
            mostrarAlerta('error', data.mensagem);
        }
    } catch (error) {
        console.error('[Estoque] ❌ Erro ao salvar produto:', error);
        mostrarAlerta('error', 'Erro ao salvar produto');
    }
}

async function editarProduto(id) {
    try {
        const response = await fetch(`../api/api_estoque.php?action=produto&id=${id}`);
        const data = await response.json();

        if (data.sucesso) {
            const produto = data.dados;
            document.getElementById('produtoId').value = produto.id;
            document.getElementById('nome').value = produto.nome;
            document.getElementById('categoria_id').value = produto.categoria_id;
            document.getElementById('unidade_medida').value = produto.unidade_medida;
            document.getElementById('descricao').value = produto.descricao || '';
            document.getElementById('preco_unitario').value = produto.preco_unitario;
            document.getElementById('quantidade_estoque').value = produto.quantidade_estoque;
            document.getElementById('estoque_minimo').value = produto.estoque_minimo;
            document.getElementById('estoque_maximo').value = produto.estoque_maximo;
            document.getElementById('localizacao').value = produto.localizacao || '';
            document.getElementById('fornecedor').value = produto.fornecedor || '';

            document.getElementById('formTitle').textContent = 'Editar Produto';
            editando = true;

            // Scroll para o formulário
            const form = document.getElementById('produtoForm');
            if (form) {
                form.scrollIntoView({ behavior: 'smooth' });
            }
        }
    } catch (error) {
        console.error('[Estoque] ❌ Erro ao carregar produto:', error);
        mostrarAlerta('error', 'Erro ao carregar produto');
    }
}

async function excluirProduto(id, nome) {
    if (!confirm(`Tem certeza que deseja excluir o produto "${nome}"?`)) return;

    try {
        const response = await fetch(`../api/api_estoque.php?action=produtos&id=${id}`, {
            method: 'DELETE'
        });

        const data = await response.json();

        if (data.sucesso) {
            mostrarAlerta('success', data.mensagem);
            carregarProdutos();
            carregarDashboard();
        } else {
            mostrarAlerta('error', data.mensagem);
        }
    } catch (error) {
        console.error('[Estoque] ❌ Erro ao excluir produto:', error);
        mostrarAlerta('error', 'Erro ao excluir produto');
    }
}

function limparFormulario() {
    const form = document.getElementById('produtoForm');
    if (form) {
        form.reset();
    }
    document.getElementById('produtoId').value = '';
    document.getElementById('formTitle').textContent = 'Cadastrar Produto';
    editando = false;
}

// ========== UTILITÁRIOS ==========

function mostrarAlerta(tipo, mensagem) {
    const container = document.getElementById('alertContainer');
    if (!container) return;

    const div = document.createElement('div');
    div.className = `alert alert-${tipo}`;
    div.innerHTML = `<i class="fas fa-${tipo === 'success' ? 'check-circle' : 'exclamation-circle'}"></i> ${mensagem}`;
    container.appendChild(div);
    setTimeout(() => div.remove(), 5000);
}

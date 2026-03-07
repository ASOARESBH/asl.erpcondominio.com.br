/**
 * Gestão de Estoque - Módulo de Página
 * Gerencia produtos, categorias e controle de estoque
 */

'use strict';

const _listeners = [];
let editando = false;

/**
 * Inicializar página
 */
export function init() {
    console.log('[Estoque] Inicializando módulo...');

    carregarDashboard();
    carregarCategorias();
    carregarProdutos();

    // Configurar listener do formulário
    const form = document.getElementById('produtoForm');
    if (form) {
        const fn = (e) => {
            e.preventDefault();
            salvarProduto();
        };
        form.addEventListener('submit', fn);
        _listeners.push({ el: form, event: 'submit', fn });
    }

    // Expor funções globais para botões de ação na tabela
    window.EstoquePage = {
        carregarProdutos,
        editarProduto,
        excluirProduto,
        limparFormulario
    };

    console.log('[Estoque] ✅ Módulo pronto');
}

/**
 * Destruir página (cleanup)
 */
export function destroy() {
    console.log('[Estoque] Finalizando módulo...');

    // Remover todos os event listeners registrados
    _listeners.forEach(({ el, event, fn }) => {
        if (el) el.removeEventListener(event, fn);
    });
    _listeners.length = 0;

    // Limpar namespace global
    if (window.EstoquePage) {
        delete window.EstoquePage;
    }

    // Reset estado
    editando = false;

    console.log('[Estoque] ✅ Cleanup concluído');
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
        }
    } catch (error) {
        console.error('[Estoque] Erro ao carregar dashboard:', error);
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
        }
    } catch (error) {
        console.error('[Estoque] Erro ao carregar categorias:', error);
    }
}

async function carregarProdutos() {
    const busca = document.getElementById('busca') ? document.getElementById('busca').value : '';
    const categoria = document.getElementById('filtroCategoria') ? document.getElementById('filtroCategoria').value : '';
    const estoque = document.getElementById('filtroEstoque') ? document.getElementById('filtroEstoque').value : '';

    const tbody = document.getElementById('produtosTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="9" class="loading-state"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';

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
                } else if (parseFloat(produto.quantidade_estoque) <= parseFloat(produto.estoque_minimo)) {
                    statusBadge = '<span class="badge badge-warning">Baixo</span>';
                }

                tbody.innerHTML += `
                    <tr>
                        <td><strong>${produto.codigo}</strong></td>
                        <td>${produto.nome}</td>
                        <td><span class="badge badge-info">${produto.categoria_nome || '-'}</span></td>
                        <td>${produto.unidade_medida}</td>
                        <td>R$ ${parseFloat(produto.preco_unitario).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td><strong>${parseFloat(produto.quantidade_estoque).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></td>
                        <td>R$ ${parseFloat(valorTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td>${statusBadge}</td>
                        <td class="action-buttons">
                            <button class="btn btn-sm btn-primary" onclick="window.EstoquePage.editarProduto(${produto.id})" title="Editar"><i class="fas fa-edit"></i></button>
                            <button class="btn btn-sm btn-danger" onclick="window.EstoquePage.excluirProduto(${produto.id}, '${produto.nome.replace(/'/g, "\\'")}')" title="Excluir"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="9" class="empty-state" style="text-align:center; padding: 2rem;"><i class="fas fa-box-open" style="font-size: 2rem; opacity: 0.3;"></i><br>Nenhum produto encontrado</td></tr>';
        }
    } catch (error) {
        console.error('[Estoque] Erro ao carregar produtos:', error);
        tbody.innerHTML = '<tr><td colspan="9" class="empty-state"><i class="fas fa-exclamation-triangle"></i><br>Erro ao carregar produtos</td></tr>';
    }
}

// ========== HANDLERS ==========

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
        console.error('[Estoque] Erro ao salvar produto:', error);
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
            const formCard = document.getElementById('produtoForm').closest('.page-card');
            if (formCard) {
                formCard.scrollIntoView({ behavior: 'smooth' });
            }
        }
    } catch (error) {
        console.error('[Estoque] Erro ao carregar produto:', error);
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
        console.error('[Estoque] Erro ao excluir produto:', error);
        mostrarAlerta('error', 'Erro ao excluir produto');
    }
}

function limparFormulario() {
    const form = document.getElementById('produtoForm');
    if (form) {
        form.reset();
    }
    const idField = document.getElementById('produtoId');
    if (idField) idField.value = '';
    
    const titleField = document.getElementById('formTitle');
    if (titleField) titleField.textContent = 'Cadastrar Produto';
    
    editando = false;
}

// ========== UTILITÁRIOS ==========

function mostrarAlerta(tipo, mensagem) {
    const container = document.getElementById('alertContainer');
    if (!container) return;

    const div = document.createElement('div');
    div.className = `alert alert-${tipo}`;
    div.style.padding = '1rem';
    div.style.borderRadius = '8px';
    div.style.marginBottom = '1rem';
    div.style.display = 'flex';
    div.style.alignItems = 'center';
    div.style.gap = '0.5rem';
    
    if (tipo === 'success') {
        div.style.background = '#f0fdf4';
        div.style.color = '#16a34a';
        div.style.borderLeft = '4px solid #16a34a';
    } else {
        div.style.background = '#fef2f2';
        div.style.color = '#ef4444';
        div.style.borderLeft = '4px solid #ef4444';
    }

    div.innerHTML = `<i class="fas fa-${tipo === 'success' ? 'check-circle' : 'exclamation-circle'}"></i> ${mensagem}`;
    container.appendChild(div);
    setTimeout(() => {
        div.style.opacity = '0';
        div.style.transition = '0.5s';
        setTimeout(() => div.remove(), 500);
    }, 4000);
}

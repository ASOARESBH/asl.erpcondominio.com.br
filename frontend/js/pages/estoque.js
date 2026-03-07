/**
 * Gestão de Estoque - Módulo de Página
 */
'use strict';

const _listeners = [];
let editando = false;

export function init() {
    console.log('[Estoque] Inicializando módulo...');

    carregarDashboard();
    carregarCategorias();
    carregarProdutos();

    const form = document.getElementById('produtoForm');
    if (form) {
        const fn = (e) => {
            e.preventDefault();
            salvarProduto();
        };
        form.addEventListener('submit', fn);
        _listeners.push({ el: form, event: 'submit', fn });
    }

    window.EstoquePage = {
        carregarProdutos,
        editarProduto,
        excluirProduto,
        limparFormulario
    };
}

export function destroy() {
    console.log('[Estoque] Finalizando módulo...');
    _listeners.forEach(({ el, event, fn }) => {
        if (el) el.removeEventListener(event, fn);
    });
    _listeners.length = 0;
    if (window.EstoquePage) delete window.EstoquePage;
    editando = false;
}

async function carregarDashboard() {
    try {
        const response = await fetch('../api/api_estoque.php?action=dashboard');
        const data = await response.json();
        if (data.sucesso) {
            document.getElementById('totalProdutos').textContent = data.dados.total_produtos || 0;
            document.getElementById('valorTotal').textContent = 'R$ ' + (data.dados.valor_total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
            document.getElementById('estoqueBaixo').textContent = data.dados.produtos_estoque_baixo || 0;
            document.getElementById('estoqueZerado').textContent = data.dados.produtos_zerados || 0;
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
    const busca = document.getElementById('busca')?.value || '';
    const categoria = document.getElementById('filtroCategoria')?.value || '';
    const estoque = document.getElementById('filtroEstoque')?.value || '';

    const tbody = document.getElementById('produtosTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 2rem;"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';

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
                let statusBadge = '<span class="badge-est badge-success-est">Normal</span>';

                if (produto.quantidade_estoque == 0) {
                    statusBadge = '<span class="badge-est badge-danger-est">Zerado</span>';
                } else if (parseFloat(produto.quantidade_estoque) <= parseFloat(produto.estoque_minimo)) {
                    statusBadge = '<span class="badge-est badge-warning-est">Baixo</span>';
                }

                tbody.innerHTML += `
                    <tr>
                        <td><strong>${produto.codigo}</strong></td>
                        <td>${produto.nome}</td>
                        <td><span class="badge-est badge-info-est">${produto.categoria_nome || '-'}</span></td>
                        <td>${produto.unidade_medida}</td>
                        <td>R$ ${parseFloat(produto.preco_unitario).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td><strong>${parseFloat(produto.quantidade_estoque).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong></td>
                        <td>R$ ${parseFloat(valorTotal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td>${statusBadge}</td>
                        <td>
                            <button class="btn-est btn-primary-est btn-sm" onclick="window.EstoquePage.editarProduto(${produto.id})" title="Editar"><i class="fas fa-edit"></i></button>
                            <button class="btn-est btn-danger-est btn-sm" onclick="window.EstoquePage.excluirProduto(${produto.id}, '${produto.nome.replace(/'/g, "\\'")}')" title="Excluir"><i class="fas fa-trash"></i></button>
                        </td>
                    </tr>
                `;
            });
        } else {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 2rem; color: #94a3b8;"><i class="fas fa-box-open" style="font-size: 2rem; opacity: 0.3;"></i><br>Nenhum produto encontrado</td></tr>';
        }
    } catch (error) {
        console.error('[Estoque] Erro ao carregar produtos:', error);
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding: 2rem; color: #ef4444;"><i class="fas fa-exclamation-triangle"></i><br>Erro ao carregar produtos</td></tr>';
    }
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
        localizacao: document.getElementById('localizacao').value,
        fornecedor: document.getElementById('fornecedor').value
    };

    try {
        let url = '../api/api_estoque.php?action=produtos';
        let method = editando ? 'PUT' : 'POST';
        if (editando) formData.id = document.getElementById('produtoId').value;

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
            const p = data.dados;
            document.getElementById('produtoId').value = p.id;
            document.getElementById('nome').value = p.nome;
            document.getElementById('categoria_id').value = p.categoria_id;
            document.getElementById('unidade_medida').value = p.unidade_medida;
            document.getElementById('descricao').value = p.descricao || '';
            document.getElementById('preco_unitario').value = p.preco_unitario;
            document.getElementById('quantidade_estoque').value = p.quantidade_estoque;
            document.getElementById('estoque_minimo').value = p.estoque_minimo;
            document.getElementById('localizacao').value = p.localizacao || '';
            document.getElementById('fornecedor').value = p.fornecedor || '';

            document.getElementById('formTitle').textContent = 'Editar Produto';
            editando = true;
            document.getElementById('produtoForm').closest('.card-est').scrollIntoView({ behavior: 'smooth' });
        }
    } catch (error) {
        console.error('[Estoque] Erro ao carregar produto:', error);
    }
}

async function excluirProduto(id, nome) {
    if (!confirm(`Deseja excluir "${nome}"?`)) return;
    try {
        const response = await fetch(`../api/api_estoque.php?action=produtos&id=${id}`, { method: 'DELETE' });
        const data = await response.json();
        if (data.sucesso) {
            mostrarAlerta('success', data.mensagem);
            carregarProdutos();
            carregarDashboard();
        }
    } catch (error) {
        console.error('[Estoque] Erro ao excluir:', error);
    }
}

function limparFormulario() {
    document.getElementById('produtoForm')?.reset();
    document.getElementById('produtoId').value = '';
    document.getElementById('formTitle').textContent = 'Cadastrar Produto';
    editando = false;
}

function mostrarAlerta(tipo, mensagem) {
    const container = document.getElementById('alertContainer');
    if (!container) return;
    const div = document.createElement('div');
    div.style = `padding:1rem; border-radius:8px; margin-bottom:1rem; border-left:4px solid ${tipo==='success'?'#16a34a':'#ef4444'}; background:${tipo==='success'?'#f0fdf4':'#fef2f2'}; color:${tipo==='success'?'#16a34a':'#ef4444'}`;
    div.innerHTML = `<i class="fas fa-${tipo==='success'?'check-circle':'exclamation-circle'}"></i> ${mensagem}`;
    container.appendChild(div);
    setTimeout(() => div.remove(), 4000);
}

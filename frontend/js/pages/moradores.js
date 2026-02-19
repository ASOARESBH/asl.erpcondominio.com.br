/**
 * Moradores Page Module
 */

const API_BASE = '../api/api_moradores.php';

// Store references
let currentTab = 'moradores';

export function init() {
    console.log('[Moradores] Inicializando...');

    // Setup tabs
    setupTabs();

    // Setup forms
    setupForms();

    // Load initial data
    carregarMoradores();
    carregarDependentes();

    // Make functions available globally (for onclick attributes)
    window.MoradoresPage = {
        buscar: buscarMoradores,
        editar: editarMorador,
        excluir: excluirMorador,
        editarDependente: editarDependente,
        excluirDependente: excluirDependente
    };
}

export function destroy() {
    console.log('[Moradores] Limpando...');
    delete window.MoradoresPage;
}

function setupTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            switchTab(tabName);
        });
    });
}

function switchTab(tabName) {
    // Update buttons
    document.querySelectorAll('.tab-button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update content
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `tab-${tabName}`);
    });

    currentTab = tabName;
}

function setupForms() {
    // Morador form
    const moradorForm = document.getElementById('moradorForm');
    if (moradorForm) {
        moradorForm.addEventListener('submit', (e) => {
            e.preventDefault();
            salvarMorador();
        });
    }

    // Dependente form
    const dependenteForm = document.getElementById('dependenteForm');
    if (dependenteForm) {
        dependenteForm.addEventListener('submit', (e) => {
            e.preventDefault();
            salvarDependente();
        });
    }
}

function carregarMoradores() {
    console.log('[Moradores] Carregando lista...');
    const loading = document.getElementById('loadingMoradores');
    const tbody = document.querySelector('#tabelaMoradores tbody');

    if (loading) loading.style.display = 'block';

    fetch('../api/api_moradores.php')
        .then(res => res.json())
        .then(data => {
            if (loading) loading.style.display = 'none';
            if (data.sucesso && tbody) {
                renderMoradores(data.dados || []);
                // Também popular o select de moradores para dependentes
                carregarMoradoresSelect(data.dados || []);
            }
        })
        .catch(err => {
            console.error('[Moradores] Erro:', err);
            if (loading) loading.style.display = 'none';
        });
}

function carregarMoradoresSelect(lista) {
    const select = document.getElementById('moradorSelecionado');
    if (!select) return;

    select.innerHTML = '<option value="">Selecione um morador</option>';
    lista.forEach(m => {
        const id = m.id || m.id_morador;
        const nome = m.nome || m.nome_completo;
        if (id && nome) {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = nome;
            select.appendChild(option);
        }
    });
}

function renderMoradores(moradores) {
    const tbody = document.querySelector('#tabelaMoradores tbody');
    if (!tbody) return;

    if (moradores.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; opacity:0.6;">Nenhum morador cadastrado</td></tr>';
        return;
    }

    tbody.innerHTML = moradores.map(m => `
        <tr>
            <td>${m.id || m.id_morador || '-'}</td>
            <td>${m.nome || m.nome_completo || '-'}</td>
            <td>${m.cpf || '-'}</td>
            <td>${m.unidade || '-'}</td>
            <td>${m.email || '-'}</td>
            <td>
                <button onclick="window.MoradoresPage.editar(${m.id || m.id_morador})" class="btn-editar action-btn edit" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="window.MoradoresPage.excluir(${m.id || m.id_morador})" class="action-btn delete" title="Excluir">
                    <i class="fas fa-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function carregarDependentes() {
    console.log('[Moradores] Carregando dependentes...');
    const tbody = document.querySelector('#tabelaDependentes tbody');
    if (!tbody) return;

    fetch('../api/api_dependentes.php')
        .then(res => res.json())
        .then(data => {
            console.log("Resposta Dependentes:", data); // Diagnóstico
            if (data.sucesso) {
                renderDependentes(data.dados || []);
            }
        })
        .catch(err => {
            console.error('[Moradores] Erro ao carregar dependentes:', err);
        });
}

function renderDependentes(lista) {
    const tbody = document.querySelector('#tabelaDependentes tbody');
    if (!tbody) return;

    if (!lista || lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; opacity:0.6;">Nenhum dependente encontrado</td></tr>';
        return;
    }

    tbody.innerHTML = lista.map(dep => {
        const id = dep.id || dep.dependente_id || "-";
        const nome = dep.nome_completo || dep.nome || "-";
        const morador = dep.morador_nome || dep.nome_morador || "-";
        const parentesco = dep.parentesco || "-";

        return `
            <tr>
                <td>${id}</td>
                <td>${nome}</td>
                <td>${morador}</td>
                <td>${parentesco}</td>
                <td>
                    <button class="btn-editar action-btn edit" onclick="window.MoradoresPage.editarDependente(${id})">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete" onclick="window.MoradoresPage.excluirDependente(${id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function salvarMorador() {
    console.log('[Moradores] Salvando morador...');
    const dados = {
        nome: document.getElementById('nomeCompleto')?.value,
        cpf: document.getElementById('cpf')?.value,
        unidade: document.getElementById('unidade')?.value,
        email: document.getElementById('email')?.value,
        telefone: document.getElementById('telefone')?.value,
        celular: document.getElementById('celular')?.value
    };

    fetch('../api/api_moradores.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados)
    })
        .then(res => res.json())
        .then(data => {
            if (data.sucesso) {
                alert('Morador salvo com sucesso!');
                document.getElementById('moradorForm')?.reset();
                carregarMoradores();
            } else {
                alert('Erro: ' + (data.mensagem || 'Erro desconhecido'));
            }
        })
        .catch(err => {
            console.error('[Moradores] Erro ao salvar:', err);
            alert('Erro ao salvar morador');
        });
}

function salvarDependente() {
    console.log('[Moradores] Salvando dependente...');
    const dados = {
        morador_id: document.getElementById('moradorSelecionado')?.value,
        nome_completo: document.getElementById('nomeDependente')?.value,
        parentesco: document.getElementById('parentesco')?.value
    };

    fetch('../api/api_dependentes.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados)
    })
        .then(res => res.json())
        .then(data => {
            if (data.sucesso) {
                alert('Dependente salvo com sucesso!');
                document.getElementById('dependenteForm')?.reset();
                carregarDependentes();
            } else {
                alert('Erro: ' + (data.mensagem || 'Erro desconhecido'));
            }
        })
        .catch(err => {
            console.error('[Moradores] Erro ao salvar dependente:', err);
        });
}

function buscarMoradores() {
    const termo = document.getElementById('searchMorador')?.value;
    console.log('[Moradores] Buscando:', termo);

    fetch(`../api/api_moradores.php?nome=${encodeURIComponent(termo)}`)
        .then(res => res.json())
        .then(data => {
            if (data.sucesso) {
                renderMoradores(data.dados || []);
            }
        });
}

function editarMorador(id) {
    console.log('[Moradores] Editando:', id);
    // Implementação pendente
}

function editarDependente(id) {
    console.log('[Moradores] Editando dependente:', id);
    // Implementação pendente
}

function excluirMorador(id) {
    if (!confirm('Deseja realmente excluir este morador?')) return;

    fetch('../api/api_moradores.php', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id })
    })
        .then(res => res.json())
        .then(data => {
            if (data.sucesso) {
                carregarMoradores();
            } else {
                alert('Erro ao excluir: ' + data.mensagem);
            }
        });
}

function excluirDependente(id) {
    if (!confirm('Deseja realmente excluir este dependente?')) return;

    fetch('../api/api_dependentes.php', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: id })
    })
        .then(res => res.json())
        .then(data => {
            if (data.sucesso) {
                carregarDependentes();
            } else {
                alert('Erro ao excluir dependente: ' + data.mensagem);
            }
        });
}

'use strict';

const apiUrl = '../api/api_logs_sistema.php';
const state = {
    pagina: 1,
    totalPaginas: 1,
    listeners: []
};

export function init() {
    console.log('[seguranca] Inicializando painel de auditoria...');
    _setupListeners();
    _setDefaultPeriod();
    _carregarTipos();
    _carregarLogs();
    _carregarEstatisticas();
}

export function destroy() {
    state.listeners.forEach(({ el, type, fn }) => el.removeEventListener(type, fn));
    state.listeners = [];
}

function _setupListeners() {
    _bind('#btnBuscar', (event) => {
        event.preventDefault();
        _carregarLogs(1);
    });

    _bind('#btnLimpar', (event) => {
        event.preventDefault();
        _limparFiltros();
    });

    _bind('#btnExportar', (event) => {
        event.preventDefault();
        _exportarCSV();
    });

    _bind('#btnAtualizar', (event) => {
        event.preventDefault();
        _carregarEstatisticas();
        _carregarLogs(1);
    });

    _bind('#btnLimparLogs', (event) => {
        event.preventDefault();
        _confirmarLimpeza();
    });

    ['#filtroUsuario', '#filtroBusca'].forEach(selector => {
        const el = document.querySelector(selector);
        if (el) {
            const fn = (event) => {
                if (event.key === 'Enter') {
                    _carregarLogs(1);
                }
            };
            el.addEventListener('keypress', fn);
            state.listeners.push({ el, type: 'keypress', fn });
        }
    });
}

function _bind(selector, fn) {
    const el = document.querySelector(selector);
    if (!el) return;
    el.addEventListener('click', fn);
    state.listeners.push({ el, type: 'click', fn });
}

function _setDefaultPeriod() {
    const hoje = new Date();
    const inicio = new Date(hoje.getTime() - 29 * 24 * 60 * 60 * 1000);
    const formatDate = date => date.toISOString().split('T')[0];

    const dataInicio = document.getElementById('filtroDataInicio');
    const dataFim = document.getElementById('filtroDataFim');

    if (dataInicio) dataInicio.value = formatDate(inicio);
    if (dataFim) dataFim.value = formatDate(hoje);
}

function _carregarTipos() {
    fetch(`${apiUrl}?action=tipos`)
        .then(res => res.json())
        .then(data => {
            if (!data.sucesso) {
                console.warn('Falha ao carregar tipos de log:', data.mensagem);
                return;
            }

            const filtroTipo = document.getElementById('filtroTipo');
            const tags = document.getElementById('segurancaTags');
            filtroTipo.innerHTML = '<option value="">Todos os tipos</option>';
            tags.innerHTML = '';

            data.dados.forEach(tipo => {
                filtroTipo.innerHTML += `<option value="${tipo.tipo}">${tipo.tipo} (${tipo.total})</option>`;
                const pill = document.createElement('span');
                pill.className = 'seg-pill';
                pill.innerHTML = `<i class="fas fa-tag"></i> ${tipo.tipo}`;
                tags.appendChild(pill);
            });

            document.getElementById('segurancaTipos').textContent = data.dados.length;
        })
        .catch(error => {
            console.error('Erro ao carregar tipos de log:', error);
        });
}

function _carregarLogs(pagina = 1) {
    state.pagina = pagina;
    const loading = document.getElementById('tableLogs');
    const tbody = document.querySelector('#tableLogs tbody');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem;">Carregando registros...</td></tr>';

    const params = new URLSearchParams();
    params.append('pagina', pagina);
    params.append('limite', document.getElementById('filtroLimite').value || '100');

    const tipo = document.getElementById('filtroTipo').value;
    const usuario = document.getElementById('filtroUsuario').value.trim();
    const dataInicio = document.getElementById('filtroDataInicio').value;
    const dataFim = document.getElementById('filtroDataFim').value;
    const busca = document.getElementById('filtroBusca').value.trim();

    if (tipo) params.append('tipo', tipo);
    if (usuario) params.append('usuario', usuario);
    if (dataInicio) params.append('data_inicio', dataInicio);
    if (dataFim) params.append('data_fim', dataFim);
    if (busca) params.append('busca', busca);

    fetch(`${apiUrl}?${params.toString()}`)
        .then(res => res.json())
        .then(data => {
            if (!data.sucesso) {
                _mostrarAlerta('error', data.mensagem || 'Falha ao carregar logs');
                _renderTabela([]);
                _renderPaginacao({ pagina_atual: 1, total_paginas: 1 });
                return;
            }

            _renderTabela(data.dados.logs);
            _renderPaginacao(data.dados.paginacao);
            document.getElementById('segurancaTotal').textContent = data.dados.paginacao.total_registros;
        })
        .catch(error => {
            console.error('Erro ao carregar logs:', error);
            _mostrarAlerta('error', 'Erro ao carregar logs: ' + error.message);
            _renderTabela([]);
        });
}

function _renderTabela(logs) {
    const tbody = document.querySelector('#tableLogs tbody');
    tbody.innerHTML = '';

    if (!logs || logs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding: 2rem; color: #64748b;">Nenhum registro encontrado</td></tr>';
        return;
    }

    logs.forEach(log => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${log.id}</td>
            <td>${log.data_hora_formatada}</td>
            <td><span class="badge ${_badgeClass(log.tipo)}">${log.tipo}</span></td>
            <td style="max-width: 420px; word-break: break-word;">${log.descricao || ''}</td>
            <td>${log.usuario || '<em>Sistema</em>'}</td>
            <td>${log.ip || '-'}</td>
        `;
        tbody.appendChild(tr);
    });
}

function _badgeClass(tipo) {
    const map = {
        'LOGIN_SUCESSO': 'badge-success',
        'LOGIN_FALHA': 'badge-danger',
        'LOGIN_ERRO': 'badge-danger',
        'LOGIN_BLOQUEADO': 'badge-warning',
        'ACESSO_RFID': 'badge-success',
        'ACESSO_NEGADO': 'badge-danger',
        'IP_BLOQUEADO': 'badge-warning',
        'LIMPEZA_LOGS': 'badge-info',
        'OBTER_DADOS_ERRO': 'badge-danger',
        'SESSAO_VERIFICAR': 'badge-info',
        'SESSAO_RENOVADA': 'badge-info',
        'LOGIN_CLIENT_ERROR': 'badge-warning'
    };
    return map[tipo] || 'badge-secondary';
}

function _renderPaginacao(paginacao) {
    state.totalPaginas = paginacao.total_paginas || 1;
    const container = document.getElementById('pagination');
    container.innerHTML = '';

    const criarBotao = (label, page, disabled = false, active = false) => {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.disabled = disabled;
        if (active) btn.classList.add('active');
        btn.addEventListener('click', () => _carregarLogs(page));
        return btn;
    };

    container.appendChild(criarBotao('Anterior', Math.max(1, state.pagina - 1), state.pagina === 1));

    const maxPages = 5;
    let start = Math.max(1, state.pagina - 2);
    let end = Math.min(state.totalPaginas, start + maxPages - 1);
    if (end - start < maxPages - 1) {
        start = Math.max(1, end - maxPages + 1);
    }

    for (let i = start; i <= end; i++) {
        container.appendChild(criarBotao(String(i), i, false, i === state.pagina));
    }

    container.appendChild(criarBotao('Próximo', Math.min(state.totalPaginas, state.pagina + 1), state.pagina === state.totalPaginas));
    const info = document.createElement('span');
    info.style.color = '#64748b';
    info.style.marginLeft = '1rem';
    info.textContent = `Página ${state.pagina} de ${state.totalPaginas}`;
    container.appendChild(info);
}

function _limparFiltros() {
    document.getElementById('filtroTipo').value = '';
    document.getElementById('filtroUsuario').value = '';
    document.getElementById('filtroDataInicio').value = '';
    document.getElementById('filtroDataFim').value = '';
    document.getElementById('filtroBusca').value = '';
    document.getElementById('filtroLimite').value = '100';
    _setDefaultPeriod();
    _carregarLogs(1);
}

function _carregarEstatisticas() {
    const dataInicio = document.getElementById('filtroDataInicio').value || new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const dataFim = document.getElementById('filtroDataFim').value || new Date().toISOString().split('T')[0];

    const formData = new FormData();
    formData.append('data_inicio', dataInicio);
    formData.append('data_fim', dataFim);

    fetch(`${apiUrl}?action=estatisticas`, {
        method: 'POST',
        body: formData
    })
        .then(res => res.json())
        .then(data => {
            if (!data.sucesso) {
                _mostrarAlerta('error', data.mensagem || 'Falha ao carregar estatísticas');
                return;
            }

            const logsPorTipo = data.dados.logs_por_tipo || [];
            const totalLogs = data.dados.total_geral || 0;
            const acessos = logsPorTipo.reduce((count, item) => {
                return count + (item.tipo.includes('ACESSO') || item.tipo.includes('LOGIN') ? parseInt(item.total, 10) : 0);
            }, 0);
            const erros = logsPorTipo.reduce((count, item) => {
                return count + (item.tipo.toUpperCase().includes('ERRO') || item.tipo.toUpperCase().includes('FALHA') ? parseInt(item.total, 10) : 0);
            }, 0);

            document.getElementById('segurancaTotal').textContent = totalLogs;
            document.getElementById('segurancaAcessos').textContent = acessos;
            document.getElementById('segurancaErros').textContent = erros;
        })
        .catch(error => {
            console.error('Erro ao carregar estatísticas:', error);
            _mostrarAlerta('error', 'Erro ao carregar estatísticas');
        });
}

function _exportarCSV() {
    const params = new URLSearchParams();
    params.append('action', 'exportar');

    const tipo = document.getElementById('filtroTipo').value;
    const usuario = document.getElementById('filtroUsuario').value.trim();
    const dataInicio = document.getElementById('filtroDataInicio').value;
    const dataFim = document.getElementById('filtroDataFim').value;
    const busca = document.getElementById('filtroBusca').value.trim();

    if (tipo) params.append('tipo', tipo);
    if (usuario) params.append('usuario', usuario);
    if (dataInicio) params.append('data_inicio', dataInicio);
    if (dataFim) params.append('data_fim', dataFim);
    if (busca) params.append('busca', busca);

    fetch(`${apiUrl}?${params.toString()}`)
        .then(res => res.json())
        .then(data => {
            if (!data.sucesso) {
                _mostrarAlerta('error', data.mensagem || 'Erro ao exportar CSV');
                return;
            }

            const logs = data.dados || [];
            const csvRows = ['ID,Data/Hora,Tipo,Descrição,Usuário,IP'];

            logs.forEach(log => {
                const descricao = (log.descricao || '').replace(/"/g, '""');
                csvRows.push(`"${log.id}","${log.data_hora_formatada}","${log.tipo}","${descricao}","${log.usuario || 'Sistema'}","${log.ip || '-'}"`);
            });

            const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `seguranca_logs_${new Date().toISOString().split('T')[0]}.csv`;
            link.click();
            _mostrarAlerta('success', `${logs.length} logs exportados com sucesso.`);
        })
        .catch(error => {
            console.error('Erro ao exportar CSV:', error);
            _mostrarAlerta('error', 'Erro ao exportar CSV');
        });
}

function _confirmarLimpeza() {
    const dias = prompt('Limpar logs com mais de quantos dias?\n\n(Mínimo: 30 dias)\n(Recomendado: 90 dias)', '90');
    if (dias === null) return;

    const diasInt = parseInt(dias, 10);
    if (isNaN(diasInt) || diasInt < 30) {
        _mostrarAlerta('error', 'Número de dias inválido. Mínimo: 30 dias.');
        return;
    }

    if (!confirm(`Deseja realmente limpar logs com mais de ${diasInt} dias? Esta ação não pode ser desfeita.`)) {
        return;
    }

    fetch(`${apiUrl}?action=limpar`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dias: diasInt })
    })
        .then(res => res.json())
        .then(data => {
            if (!data.sucesso) {
                _mostrarAlerta('error', data.mensagem || 'Erro ao limpar logs');
                return;
            }

            _mostrarAlerta('success', `${data.dados.registros_excluidos} logs antigos limpos com sucesso.`);
            _carregarLogs(1);
            _carregarEstatisticas();
        })
        .catch(error => {
            console.error('Erro ao limpar logs:', error);
            _mostrarAlerta('error', 'Erro ao limpar logs');
        });
}

function _mostrarAlerta(tipo, mensagem) {
    const container = document.querySelector('.page-seguranca');
    if (!container) return;

    const alerta = document.createElement('div');
    alerta.className = `page-alert page-alert-${tipo}`;
    alerta.textContent = mensagem;
    container.insertBefore(alerta, container.querySelector('.page-summary'));

    setTimeout(() => alerta.remove(), 5000);
}

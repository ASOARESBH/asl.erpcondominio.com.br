// ============================================================
// unidades.js — Módulo de Gestão de Unidades
// Associação Serra da Liberdade
// ============================================================
(function () {
    'use strict';

    // ── Estado ────────────────────────────────────────────────
    const state = {
        pagina:     1,
        por_pagina: 50,
        busca:      '',
        bloco:      '',
        ativo:      -1,
        total:      0,
        paginas:    1,
        excluir_id: null,
        editando:   false
    };

    // ── Utilitários ───────────────────────────────────────────
    function toast(msg, tipo) {
        const el = document.getElementById('uni-toast');
        if (!el) return;
        el.textContent = msg;
        el.style.display = 'block';
        el.style.opacity = '1';
        el.style.background = tipo === 'erro' ? '#ef4444' : tipo === 'aviso' ? '#f59e0b' : '#16a34a';
        el.style.color = '#fff';
        clearTimeout(el._timer);
        el._timer = setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.style.display = 'none', 300); }, 3500);
    }

    function loading(show) {
        const el = document.getElementById('uni-loading');
        if (el) el.style.display = show ? 'block' : 'none';
    }

    // ── Carregar KPIs ─────────────────────────────────────────
    function carregarKPIs() {
        fetch('../api/api_unidades.php?por_pagina=9999')
            .then(r => r.json())
            .then(res => {
                if (!res.sucesso) return;
                const itens = res.dados.itens || [];
                const total = res.dados.total || 0;
                const ativas = itens.filter(u => parseInt(u.ativo) === 1).length;
                const comMor = itens.filter(u => parseInt(u.total_moradores) > 0).length;
                const comHid = itens.filter(u => parseInt(u.total_hidrometros) > 0).length;
                document.getElementById('kpi-total').textContent       = total;
                document.getElementById('kpi-ativas').textContent      = ativas;
                document.getElementById('kpi-moradores').textContent   = comMor;
                document.getElementById('kpi-hidrometros').textContent = comHid;
            })
            .catch(() => {});
    }

    // ── Carregar lista de unidades ────────────────────────────
    function carregarUnidades() {
        loading(true);
        const params = new URLSearchParams({
            pagina:     state.pagina,
            por_pagina: state.por_pagina,
            busca:      state.busca,
            bloco:      state.bloco,
            ativo:      state.ativo
        });
        fetch('../api/api_unidades.php?' + params.toString())
            .then(r => r.json())
            .then(res => {
                loading(false);
                if (!res.sucesso) { toast(res.mensagem || 'Erro ao carregar unidades', 'erro'); return; }
                state.total   = res.dados.total;
                state.paginas = res.dados.paginas;
                renderTabela(res.dados.itens || []);
                renderPaginacao();
                carregarKPIs();
            })
            .catch(err => { loading(false); toast('Erro de comunicação com o servidor', 'erro'); console.error(err); });
    }

    // ── Renderizar tabela ─────────────────────────────────────
    function renderTabela(itens) {
        const tbody = document.getElementById('uni-tbody');
        if (!tbody) return;
        if (itens.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:#64748b;padding:32px;">Nenhuma unidade encontrada.</td></tr>';
            return;
        }
        tbody.innerHTML = itens.map(u => {
            const ativo = parseInt(u.ativo) === 1;
            const badgeAtivo = ativo
                ? '<span style="background:#dcfce7;color:#16a34a;padding:3px 10px;border-radius:20px;font-size:.8rem;font-weight:600;">Ativa</span>'
                : '<span style="background:#fee2e2;color:#dc2626;padding:3px 10px;border-radius:20px;font-size:.8rem;font-weight:600;">Inativa</span>';
            const moradores   = parseInt(u.total_moradores)   || 0;
            const hidrometros = parseInt(u.total_hidrometros) || 0;
            return `<tr>
                <td>${u.id}</td>
                <td><strong>${u.nome}</strong></td>
                <td><span style="background:#e0e7ff;color:#3730a3;padding:2px 8px;border-radius:12px;font-size:.8rem;">${u.bloco || '—'}</span></td>
                <td>${u.descricao || '—'}</td>
                <td style="text-align:center;">
                    ${moradores > 0 ? `<span style="background:#dbeafe;color:#1d4ed8;padding:2px 8px;border-radius:12px;font-size:.8rem;font-weight:600;">${moradores}</span>` : '<span style="color:#94a3b8;">0</span>'}
                </td>
                <td style="text-align:center;">
                    ${hidrometros > 0 ? `<span style="background:#ede9fe;color:#6d28d9;padding:2px 8px;border-radius:12px;font-size:.8rem;font-weight:600;">${hidrometros}</span>` : '<span style="color:#94a3b8;">0</span>'}
                </td>
                <td>${badgeAtivo}</td>
                <td style="font-size:.8rem;color:#64748b;">${u.data_cadastro_fmt || '—'}</td>
                <td>
                    <button onclick="window.UnidadesPage.editar(${u.id})" title="Editar"
                        style="background:#2563eb;color:#fff;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;margin-right:4px;">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button onclick="window.UnidadesPage.toggleAtivo(${u.id}, ${ativo ? 0 : 1}, '${u.nome.replace(/'/g, "\\'")}')" title="${ativo ? 'Inativar' : 'Ativar'}"
                        style="background:${ativo ? '#f59e0b' : '#16a34a'};color:#fff;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;margin-right:4px;">
                        <i class="fas fa-${ativo ? 'ban' : 'check'}"></i>
                    </button>
                    <button onclick="window.UnidadesPage.excluir(${u.id}, '${u.nome.replace(/'/g, "\\'")}')" title="Excluir"
                        style="background:#ef4444;color:#fff;border:none;padding:6px 10px;border-radius:6px;cursor:pointer;"
                        ${moradores > 0 || hidrometros > 0 ? 'disabled title="Unidade com vínculos — não pode ser excluída"' : ''}>
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>`;
        }).join('');
    }

    // ── Renderizar paginação ──────────────────────────────────
    function renderPaginacao() {
        const el = document.getElementById('uni-paginacao');
        if (!el) return;
        if (state.paginas <= 1) { el.innerHTML = ''; return; }
        let html = '';
        const btnStyle = (ativo) => `style="padding:6px 12px;border:1px solid ${ativo ? '#1e3a8a' : '#d1d5db'};background:${ativo ? '#1e3a8a' : '#fff'};color:${ativo ? '#fff' : '#374151'};border-radius:6px;cursor:pointer;font-size:.85rem;"`;
        if (state.pagina > 1) html += `<button ${btnStyle(false)} onclick="window.UnidadesPage.irPagina(${state.pagina - 1})"><i class="fas fa-chevron-left"></i></button>`;
        const inicio = Math.max(1, state.pagina - 2);
        const fim    = Math.min(state.paginas, state.pagina + 2);
        for (let i = inicio; i <= fim; i++) {
            html += `<button ${btnStyle(i === state.pagina)} onclick="window.UnidadesPage.irPagina(${i})">${i}</button>`;
        }
        if (state.pagina < state.paginas) html += `<button ${btnStyle(false)} onclick="window.UnidadesPage.irPagina(${state.pagina + 1})"><i class="fas fa-chevron-right"></i></button>`;
        html += `<span style="font-size:.85rem;color:#64748b;margin-left:8px;">Total: ${state.total} unidades</span>`;
        el.innerHTML = html;
    }

    // ── Buscar ────────────────────────────────────────────────
    function buscar() {
        state.busca  = (document.getElementById('uni-busca')?.value || '').trim();
        state.bloco  = document.getElementById('uni-filtro-bloco')?.value || '';
        state.ativo  = parseInt(document.getElementById('uni-filtro-ativo')?.value ?? -1);
        state.pagina = 1;
        carregarUnidades();
    }

    // ── Ir para página ────────────────────────────────────────
    function irPagina(n) {
        state.pagina = n;
        carregarUnidades();
    }

    // ── Editar ────────────────────────────────────────────────
    function editar(id) {
        fetch('../api/api_unidades.php?busca=&por_pagina=9999')
            .then(r => r.json())
            .then(res => {
                if (!res.sucesso) return;
                const u = (res.dados.itens || []).find(x => parseInt(x.id) === parseInt(id));
                if (!u) { toast('Unidade não encontrada', 'erro'); return; }
                document.getElementById('uni-id').value        = u.id;
                document.getElementById('uni-nome').value      = u.nome;
                document.getElementById('uni-descricao').value = u.descricao || '';
                const blocoSel = document.getElementById('uni-bloco');
                if (blocoSel) {
                    for (let opt of blocoSel.options) {
                        if (opt.value === u.bloco) { opt.selected = true; break; }
                    }
                }
                document.getElementById('uni-form-titulo').textContent = 'Editar Unidade';
                state.editando = true;
                document.getElementById('uni-nome').focus();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            });
    }

    // ── Cancelar edição ───────────────────────────────────────
    function cancelarEdicao() {
        document.getElementById('unidadeForm')?.reset();
        document.getElementById('uni-id').value = '';
        document.getElementById('uni-form-titulo').textContent = 'Cadastrar Unidade';
        state.editando = false;
    }

    // ── Toggle ativo/inativo ──────────────────────────────────
    function toggleAtivo(id, novoAtivo, nome) {
        const acao = novoAtivo ? 'ativar' : 'inativar';
        if (!confirm(`Deseja ${acao} a unidade "${nome}"?`)) return;
        fetch('../api/api_unidades.php', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, ativo: novoAtivo })
        })
        .then(r => r.json())
        .then(res => {
            if (res.sucesso) { toast(res.mensagem, 'sucesso'); carregarUnidades(); }
            else toast(res.mensagem || 'Erro ao atualizar status', 'erro');
        })
        .catch(() => toast('Erro de comunicação', 'erro'));
    }

    // ── Excluir ───────────────────────────────────────────────
    function excluir(id, nome) {
        state.excluir_id = id;
        document.getElementById('uni-modal-msg').textContent = `Tem certeza que deseja excluir a unidade "${nome}"? Esta ação não pode ser desfeita.`;
        const modal = document.getElementById('uni-modal-excluir');
        if (modal) modal.style.display = 'flex';
    }

    function fecharModal() {
        const modal = document.getElementById('uni-modal-excluir');
        if (modal) modal.style.display = 'none';
        state.excluir_id = null;
    }

    function confirmarExclusao() {
        if (!state.excluir_id) return;
        fecharModal();
        fetch('../api/api_unidades.php', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: state.excluir_id })
        })
        .then(r => r.json())
        .then(res => {
            if (res.sucesso) { toast(res.mensagem, 'sucesso'); carregarUnidades(); }
            else toast(res.mensagem || 'Erro ao excluir', 'erro');
        })
        .catch(() => toast('Erro de comunicação', 'erro'));
    }

    // ── Auto-popular Gleba 1-187 ──────────────────────────────
    function popularGlebas() {
        const btn = document.getElementById('btn-popular');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Populando...'; }
        fetch('../api/api_unidades.php?acao=popular')
            .then(r => r.json())
            .then(res => {
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-magic"></i> Auto-popular Gleba 1–187'; }
                if (res.sucesso) { toast(`${res.mensagem} — Total: ${res.dados?.total || ''}`, 'sucesso'); carregarUnidades(); }
                else toast(res.mensagem || 'Erro ao popular', 'erro');
            })
            .catch(() => {
                if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-magic"></i> Auto-popular Gleba 1–187'; }
                toast('Erro de comunicação', 'erro');
            });
    }

    // ── Salvar (criar / editar) ───────────────────────────────
    function salvar(e) {
        e.preventDefault();
        const id        = document.getElementById('uni-id').value;
        const nome      = document.getElementById('uni-nome').value.trim();
        const bloco     = document.getElementById('uni-bloco').value;
        const descricao = document.getElementById('uni-descricao').value.trim();

        if (!nome) { toast('Nome da unidade é obrigatório', 'aviso'); return; }

        const metodo = id ? 'PUT' : 'POST';
        const payload = { nome, bloco, descricao };
        if (id) payload.id = parseInt(id);

        fetch('../api/api_unidades.php', {
            method: metodo,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(r => r.json())
        .then(res => {
            if (res.sucesso) {
                toast(res.mensagem, 'sucesso');
                cancelarEdicao();
                carregarUnidades();
            } else {
                toast(res.mensagem || 'Erro ao salvar', 'erro');
            }
        })
        .catch(() => toast('Erro de comunicação com o servidor', 'erro'));
    }

    // ── Bind de eventos ───────────────────────────────────────
    function bindEvents() {
        const form = document.getElementById('unidadeForm');
        if (form) form.addEventListener('submit', salvar);

        const busca = document.getElementById('uni-busca');
        if (busca) busca.addEventListener('keydown', e => { if (e.key === 'Enter') buscar(); });

        // Fechar modal ao clicar fora
        const modal = document.getElementById('uni-modal-excluir');
        if (modal) modal.addEventListener('click', e => { if (e.target === modal) fecharModal(); });
    }

    // ── Init ──────────────────────────────────────────────────
    function init() {
        bindEvents();
        // Auto-popular na primeira carga (garante Gleba 1-187)
        fetch('../api/api_unidades.php?acao=popular').catch(() => {});
        carregarUnidades();
    }

    // ── API pública ───────────────────────────────────────────
    window.UnidadesPage = {
        init,
        buscar,
        irPagina,
        editar,
        cancelarEdicao,
        toggleAtivo,
        excluir,
        fecharModal,
        confirmarExclusao,
        popularGlebas
    };

    // Inicializar quando o DOM estiver pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // Página carregada via AJAX (SPA) — aguardar elemento
        const check = setInterval(() => {
            if (document.getElementById('tabelaUnidades')) {
                clearInterval(check);
                init();
            }
        }, 100);
        setTimeout(() => clearInterval(check), 5000);
    }

    // Expor init/destroy para o AppRouter (ES module pattern)
    window._UnidadesPageInit    = init;
    window._UnidadesPageDestroy = function() { delete window.UnidadesPage; };

})();

// Export para ES module import() do AppRouter
export function init() {
    if (window._UnidadesPageInit) window._UnidadesPageInit();
    else {
        const check = setInterval(() => {
            if (window._UnidadesPageInit) { clearInterval(check); window._UnidadesPageInit(); }
        }, 50);
        setTimeout(() => clearInterval(check), 3000);
    }
}
export function destroy() {
    if (window._UnidadesPageDestroy) window._UnidadesPageDestroy();
}

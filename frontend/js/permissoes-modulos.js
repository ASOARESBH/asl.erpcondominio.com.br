/**
 * permissoes-modulos.js
 * Controle de acesso por módulo — filtra o menu lateral e bloqueia páginas
 * conforme as permissões individuais do usuário logado.
 *
 * Carregado após menu-controller.js no layout-base.html
 */
(function (global) {
    'use strict';

    // Mapeamento: page (menu-controller) → chave do módulo (api_permissoes_modulos)
    const PAGE_TO_MODULO = {
        dashboard:        'dashboard',
        moradores:        'moradores',
        veiculos:         'veiculos',
        visitantes:       'visitantes',
        registro:         'registro_manual',
        acesso:           'controle_acesso',
        relatorios:       'relatorios',
        financeiro:       'financeiro',
        contas_pagar:     'contas_pagar',
        contas_receber:   'contas_receber',
        planos_contas:    'planos_contas',
        configuracao:     'configuracoes',
        manutencao:       'manutencao',
        administrativa:   'administrativo',
        recursos_humanos: 'rh_funcionarios',
        usuarios:         'usuarios'
    };

    // Módulos sempre visíveis (independente de permissão)
    const SEMPRE_VISIVEIS = ['dashboard'];

    // Cache de permissões (carregado uma vez por sessão)
    let _permissoesCache = null;
    let _carregando = false;
    let _callbacks = [];

    /**
     * Carrega as permissões do usuário logado via API.
     * Usa cache sessionStorage para evitar múltiplas requisições.
     */
    function carregarPermissoes(callback) {
        // Verificar cache em memória
        if (_permissoesCache !== null) {
            callback(_permissoesCache);
            return;
        }

        // Verificar cache em sessionStorage
        try {
            const cached = sessionStorage.getItem('_perm_modulos');
            if (cached) {
                _permissoesCache = JSON.parse(cached);
                callback(_permissoesCache);
                return;
            }
        } catch (e) { /* ignorar */ }

        // Enfileirar callback enquanto carrega
        _callbacks.push(callback);
        if (_carregando) return;
        _carregando = true;

        fetch('/api/api_permissoes_modulos.php?acao=minhas_permissoes')
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.json();
            })
            .then(function (data) {
                if (data.sucesso && data.dados) {
                    // A API retorna { modulos: {...}, is_admin: bool }
                    // Normalizar para { is_admin, permissoes }
                    var normalizado = {
                        is_admin:   !!data.dados.is_admin,
                        permissoes: data.dados.modulos || data.dados.permissoes || {}
                    };
                    _permissoesCache = normalizado;
                    try {
                        sessionStorage.setItem('_perm_modulos', JSON.stringify(normalizado));
                    } catch (e) { /* ignorar */ }
                } else {
                    // Em caso de erro, liberar tudo (admin ou sem controle)
                    _permissoesCache = { is_admin: true, permissoes: {} };
                }
                _carregando = false;
                _callbacks.forEach(function (cb) { cb(_permissoesCache); });
                _callbacks = [];
            })
            .catch(function (err) {
                console.warn('[PermissoesModulos] Erro ao carregar permissões:', err);
                // Falha silenciosa: liberar acesso para não bloquear o sistema
                _permissoesCache = { is_admin: true, permissoes: {} };
                _carregando = false;
                _callbacks.forEach(function (cb) { cb(_permissoesCache); });
                _callbacks = [];
            });
    }

    /**
     * Verifica se o usuário tem acesso a um módulo específico.
     * @param {string} page - Chave da página (menu-controller)
     * @param {object} perms - Objeto de permissões retornado pela API
     * @returns {boolean}
     */
    function temAcesso(page, perms) {
        if (!perms) return true; // sem dados = liberar
        if (perms.is_admin) return true; // admin tem tudo
        if (SEMPRE_VISIVEIS.includes(page)) return true;

        const chave = PAGE_TO_MODULO[page];
        if (!chave) return true; // página não mapeada = liberar

        const p = perms.permissoes && perms.permissoes[chave];
        if (!p) return false; // não encontrado = sem acesso
        return !!p.pode_acessar;
    }

    /**
     * Filtra os itens do menu lateral removendo os que o usuário não pode acessar.
     */
    function filtrarMenu(perms) {
        if (!global.MenuController) return;
        if (perms.is_admin) return; // admin: não filtrar nada

        const items = global.MenuController.getItems();
        items.forEach(function (item) {
            if (!temAcesso(item.page, perms)) {
                // Ocultar o item visualmente
                const links = document.querySelectorAll(
                    `.nav-link[data-page="${item.page}"], .nav-item a[data-page="${item.page}"]`
                );
                links.forEach(function (link) {
                    const li = link.closest('li.nav-item') || link.parentElement;
                    if (li) li.style.display = 'none';
                });
            }
        });
    }

    /**
     * Verifica se a página atual está bloqueada para o usuário.
     * Se sim, redireciona para o dashboard com mensagem.
     */
    function verificarPaginaAtual(perms) {
        if (perms.is_admin) return; // admin: sem bloqueio

        const params = new URLSearchParams(window.location.search);
        const pageParam = params.get('page');
        if (!pageParam) return; // sem parâmetro page = não bloquear

        if (!temAcesso(pageParam, perms)) {
            console.warn('[PermissoesModulos] Acesso negado à página:', pageParam);
            // Redirecionar para dashboard com aviso
            const url = window.location.pathname.replace(/[^/]*$/, '') + 'layout-base.html?page=dashboard&acesso_negado=' + encodeURIComponent(pageParam);
            window.location.replace(url);
        }
    }

    /**
     * Exibe banner de "acesso negado" no dashboard se redirecionado.
     */
    function verificarRedirecionamento() {
        const params = new URLSearchParams(window.location.search);
        const negado = params.get('acesso_negado');
        if (!negado) return;

        // Aguardar DOM carregar o conteúdo da página
        setTimeout(function () {
            const container = document.querySelector('.page-content, #page-content, main, .main-content');
            if (!container) return;
            const banner = document.createElement('div');
            banner.style.cssText = [
                'background:#fee2e2', 'color:#b91c1c', 'border:1px solid #f87171',
                'border-radius:8px', 'padding:1rem 1.25rem', 'margin-bottom:1.5rem',
                'display:flex', 'align-items:center', 'gap:0.75rem', 'font-weight:500'
            ].join(';');
            banner.innerHTML = '<i class="fas fa-lock" style="font-size:1.1rem;"></i>' +
                ' Você não tem permissão para acessar o módulo <strong>' + negado + '</strong>. ' +
                'Solicite acesso ao administrador do sistema.';
            container.insertBefore(banner, container.firstChild);
            setTimeout(function () { banner.remove(); }, 8000);
        }, 800);
    }

    /**
     * Invalida o cache de permissões (chamar após salvar permissões de um usuário).
     */
    function invalidarCache() {
        _permissoesCache = null;
        try { sessionStorage.removeItem('_perm_modulos'); } catch (e) { /* ignorar */ }
    }

    /**
     * Inicialização principal.
     */
    function init() {
        // Verificar redirecionamento por acesso negado
        verificarRedirecionamento();

        // Carregar permissões e aplicar filtros
        carregarPermissoes(function (perms) {
            // Filtrar menu lateral
            filtrarMenu(perms);
            // Verificar se a página atual está acessível
            verificarPaginaAtual(perms);
        });

        // Re-aplicar filtro quando o sidebar for recarregado
        document.addEventListener('sidebarLoaded', function () {
            if (_permissoesCache) {
                filtrarMenu(_permissoesCache);
            } else {
                carregarPermissoes(filtrarMenu);
            }
        });
    }

    // Expor API pública
    global.PermissoesModulos = {
        init:             init,
        temAcesso:        function (page) {
            if (!_permissoesCache) return true;
            return temAcesso(page, _permissoesCache);
        },
        invalidarCache:   invalidarCache,
        carregarPermissoes: carregarPermissoes
    };

    // Auto-inicializar
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})(window);

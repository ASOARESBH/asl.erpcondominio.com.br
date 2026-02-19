/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SESSION MANAGER INITIALIZATION - Manual Initialization Script
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Este script deve ser carregado no FINAL do HTML (após todos os scripts)
 * para inicializar o SessionManager de forma controlada e evitar loops.
 * 
 * Uso:
 *   <!-- No final do dashboard.html, após todos os scripts -->
 *   <script src="js/session-manager-init.js"></script>
 */

(function initializeSessionManagerManually() {
    'use strict';

    console.log('[SessionManagerInit] 🚀 Iniciando inicialização manual do SessionManager...');

    // Verificar se SessionManagerCore está disponível
    if (typeof window.SessionManagerCore === 'undefined') {
        console.error('[SessionManagerInit] ❌ SessionManagerCore não encontrado!');
        return;
    }

    // Verificar se já foi inicializado
    if (window.sessionManager && window.sessionManager._initialized) {
        console.log('[SessionManagerInit] ⚠️ SessionManager já foi inicializado');
        return;
    }

    // Obter instância
    const manager = window.SessionManagerCore.getInstance();

    // Marcar como inicializado para evitar múltiplas inicializações
    manager._initialized = true;

    // Função para inicializar
    async function doInitialize() {
        try {
            console.log('[SessionManagerInit] ⏳ Inicializando SessionManager...');
            
            // Inicializar
            await manager.initialize();
            
            // Anexar a window para acesso global
            window.sessionManager = manager;
            
            console.log('[SessionManager] ✅ SessionManager inicializado com sucesso!');
            console.log('[SessionManager] 📊 Usuário:', manager.getUser()?.nome || 'Desconhecido');
            console.log('[SessionManager] ⏱️ Tempo de sessão:', manager.getSessionExpireTime(), 'segundos');
            
            // Disparar evento customizado para notificar outros módulos
            const event = new CustomEvent('sessionManagerReady', {
                detail: { manager: manager }
            });
            document.dispatchEvent(event);
            
            return true;
            
        } catch (erro) {
            console.error('[SessionManagerInit] ❌ Erro ao inicializar SessionManager:', erro);
            return false;
        }
    }

    // Verificar se DOM está pronto
    if (document.readyState === 'loading') {
        // DOM ainda está carregando
        console.log('[SessionManagerInit] ⏳ DOM ainda carregando, aguardando DOMContentLoaded...');
        document.addEventListener('DOMContentLoaded', doInitialize);
    } else {
        // DOM já está pronto
        console.log('[SessionManagerInit] ✅ DOM já pronto, inicializando agora...');
        doInitialize();
    }

    // Exportar função de reinicialização manual
    window.reinitializeSessionManager = async function() {
        console.log('[SessionManagerInit] 🔄 Reinicializando SessionManager...');
        return doInitialize();
    };

})();

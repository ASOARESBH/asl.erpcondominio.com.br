/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INICIALIZAÇÃO MANUAL (NÃO AUTO)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * MUDANÇA IMPORTANTE: SessionManager NÃO inicializa mais automaticamente.
 * Isso evita o loop infinito quando múltiplos módulos tentam usar o manager.
 * 
 * Inicialização manual é feita no final do dashboard.html após todos os
 * scripts serem carregados.
 * 
 * Uso:
 *   // No final do HTML (após todos os scripts)
 *   if (window.SessionManagerCore) {
 *       const manager = SessionManagerCore.getInstance();
 *       await manager.initialize();
 *       window.sessionManager = manager;
 *   }
 */

// Expor classe globalmente para acesso
window.SessionManagerCore = SessionManagerCore;

console.log('[SessionManager] 📄 Script carregado - Aguardando inicialização manual');

// Export para uso em mÃ³dulos (se aplicÃ¡vel)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SessionManagerCore;
}


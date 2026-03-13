/**
 * configuracao.js — Módulo Dashboard de Configurações
 * Atua apenas como "hub" para as sub-páginas (Empresa, Usuários, etc).
 * O carregamento delas é tratado nativamente pelo AppRouter através de atributos data-page.
 */

export function init() {
    console.log('[Configuracao Hub] Inicializando módulo...');
    // A navegação nos cartões interativos é gerenciada automaticamente 
    // pelo listener global no layout-base.html que detecta [data-page].

    // Podemos adicionar pequenos efeitos ou manipulações visuais específicas do hub se necessário
    document.title = "Configurações - Dashboard";
}

export function destroy() {
    console.log('[Configuracao Hub] Destruindo módulo...');
}

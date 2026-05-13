<?php
/**
 * ============================================================
 * RELATORIO DE VEICULOS — GERADOR DE PDF/IMPRESSAO
 * ============================================================
 * Template padrao do sistema ERP Condominio.
 * Identidade visual: azul #1e3a8a / #2563eb + logo da associacao.
 *
 * Filtros aceitos via GET:
 *   filtro     — texto de busca (morador, modelo, placa, tag, cor, tipo)
 *   print      — Se "true", dispara window.print() automaticamente
 *
 * @version 1.0.0
 */
// ── 1. Bootstrap ──────────────────────────────────────────────
require_once 'config.php';
require_once 'auth_helper.php';

$conn    = conectar_banco();
$usuario = verificarAutenticacao(false, 'operador');

// ── 2. Configuracoes regionais ────────────────────────────────
date_default_timezone_set('America/Sao_Paulo');

// ── 3. Dados da empresa ───────────────────────────────────────
$empresa = [];
$res_emp = $conn->query("SELECT razao_social, nome_fantasia, cnpj, logo_url FROM empresa LIMIT 1");
if ($res_emp && $res_emp->num_rows > 0) {
    $empresa = $res_emp->fetch_assoc();
}
$nome_empresa = !empty($empresa['nome_fantasia'])  ? $empresa['nome_fantasia']
              : (!empty($empresa['razao_social'])  ? $empresa['razao_social']
              : 'ASSOCIACAO SERRA DA LIBERDADE');
$cnpj_empresa = !empty($empresa['cnpj']) ? $empresa['cnpj'] : '28.231.106/0001-15';

$protocolo = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$host      = $_SERVER['HTTP_HOST'] ?? 'asl.erpcondominios.com.br';
if (!empty($empresa['logo_url'])) {
    $logo_url = $protocolo . '://' . $host . '/' . ltrim($empresa['logo_url'], '/');
} else {
    $logo_url = $protocolo . '://' . $host . '/assets/images/logo.jpeg';
}

// ── 4. Filtros ────────────────────────────────────────────────
$filtro     = trim($_GET['filtro'] ?? '');
$auto_print = ($_GET['print'] ?? '') === 'true';
$titulo_relatorio = 'Relatorio de Veiculos';

// ── 5. Buscar dados ───────────────────────────────────────────
$veiculos = [];

// Query principal (trazendo unidade do morador e nome do dependente)
$sql = "
    SELECT v.id, v.placa, v.modelo, v.cor, v.tag, v.ativo,
           m.nome as morador_nome, m.unidade as morador_unidade,
           d.nome_completo as dependente_nome
    FROM veiculos v
    INNER JOIN moradores m ON v.morador_id = m.id
    LEFT JOIN dependentes d ON v.dependente_id = d.id
    ORDER BY m.unidade ASC, m.nome ASC, v.modelo ASC
";
$res = $conn->query($sql);

if ($res) {
    while ($row = $res->fetch_assoc()) {
        $veiculos[] = $row;
    }
}

// Aplicar filtro de texto (se houver)
if ($filtro !== '') {
    $filtro_lower = strtolower($filtro);
    $veiculos = array_values(array_filter($veiculos, function($v) use ($filtro_lower) {
        $morador = strtolower($v['morador_nome'] ?? '');
        $unidade = strtolower($v['morador_unidade'] ?? '');
        $modelo  = strtolower($v['modelo'] ?? '');
        $placa   = strtolower($v['placa'] ?? '');
        $tag     = strtolower($v['tag'] ?? '');
        $cor     = strtolower($v['cor'] ?? '');
        $dep     = strtolower($v['dependente_nome'] ?? '');
        
        return strpos($morador, $filtro_lower) !== false
            || strpos($unidade, $filtro_lower) !== false
            || strpos($modelo, $filtro_lower) !== false
            || strpos($placa, $filtro_lower) !== false
            || strpos($tag, $filtro_lower) !== false
            || strpos($cor, $filtro_lower) !== false
            || strpos($dep, $filtro_lower) !== false;
    }));
}

// KPIs
$total_veiculos = count($veiculos);
$total_ativos   = count(array_filter($veiculos, function($v) { return ($v['ativo'] ?? 1) == 1; }));
$total_inativos = $total_veiculos - $total_ativos;
$unidades_unicas = count(array_unique(array_column($veiculos, 'morador_unidade')));

// Data/hora
$data_geracao = date('d/m/Y \a\s H:i');
$operador_nome = $usuario ? ($usuario['nome'] ?? 'Sistema') : 'Sistema';

// ── 6. Funcoes auxiliares ─────────────────────────────────────
function esc($s) { return htmlspecialchars($s ?? '', ENT_QUOTES, 'UTF-8'); }

?><!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title><?= esc($titulo_relatorio) ?> — <?= esc($nome_empresa) ?></title>
<style>
/* ── Reset e base ── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11px; color: #1a1a2e; background: #f0f4f8; }

/* ── Botao de impressao (some ao imprimir) ── */
.btn-print {
    position: fixed; top: 16px; right: 16px; z-index: 9999;
    background: linear-gradient(135deg, #1e3a8a, #2563eb);
    color: #fff; border: none; border-radius: 8px;
    padding: 10px 22px; font-size: 13px; font-weight: 600;
    cursor: pointer; box-shadow: 0 4px 12px rgba(37,99,235,.4);
    display: flex; align-items: center; gap: 8px;
    transition: transform .15s;
}
.btn-print:hover { transform: translateY(-1px); }

/* ── Container principal ── */
.relatorio {
    max-width: 900px; margin: 20px auto; background: #fff;
    border-radius: 12px; overflow: hidden;
    box-shadow: 0 8px 32px rgba(30,58,138,.12);
}

/* ── Cabecalho ── */
.header {
    background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 60%, #3b82f6 100%);
    padding: 24px 32px; display: flex; align-items: center; gap: 20px;
    color: #fff;
}
.header-logo {
    width: 72px; height: 72px; border-radius: 10px; object-fit: contain;
    background: #fff; padding: 4px; flex-shrink: 0;
}
.header-logo-placeholder {
    width: 72px; height: 72px; border-radius: 10px;
    background: rgba(255,255,255,.2); display: flex; align-items: center;
    justify-content: center; font-size: 28px; flex-shrink: 0;
}
.header-info { flex: 1; }
.header-info h1 { font-size: 18px; font-weight: 700; letter-spacing: .5px; }
.header-info p  { font-size: 11px; opacity: .85; margin-top: 2px; }
.header-meta { text-align: right; font-size: 10px; opacity: .8; line-height: 1.7; }
.header-meta strong { font-size: 13px; opacity: 1; display: block; margin-bottom: 2px; }

/* ── Faixa do titulo do relatorio ── */
.titulo-relatorio {
    background: #1e3a8a; color: #fff;
    padding: 10px 32px; font-size: 13px; font-weight: 700;
    letter-spacing: 1px; text-transform: uppercase;
    display: flex; align-items: center; justify-content: space-between;
}
.titulo-relatorio .filtro-info {
    font-size: 10px; font-weight: 400; opacity: .8;
    text-transform: none; letter-spacing: 0;
}

/* ── KPIs ── */
.kpis {
    display: grid; grid-template-columns: repeat(4, 1fr);
    gap: 0; border-bottom: 2px solid #e2e8f0;
}
.kpi {
    padding: 16px 20px; text-align: center;
    border-right: 1px solid #e2e8f0;
}
.kpi:last-child { border-right: none; }
.kpi-valor { font-size: 24px; font-weight: 800; color: #1e3a8a; line-height: 1; }
.kpi-label { font-size: 9px; text-transform: uppercase; letter-spacing: .8px; color: #64748b; margin-top: 4px; }

/* ── Secao ── */
.secao { padding: 0 32px 24px; }
.secao-titulo {
    font-size: 12px; font-weight: 700; color: #1e3a8a;
    text-transform: uppercase; letter-spacing: .8px;
    padding: 16px 0 10px; border-bottom: 2px solid #2563eb;
    margin-bottom: 12px; display: flex; align-items: center; gap: 8px;
}
.secao-titulo::before {
    content: ''; display: inline-block; width: 4px; height: 16px;
    background: linear-gradient(180deg, #2563eb, #1e3a8a);
    border-radius: 2px;
}

/* ── Tabela ── */
table { width: 100%; border-collapse: collapse; font-size: 10px; }
thead tr {
    background: linear-gradient(90deg, #1e3a8a, #2563eb);
    color: #fff;
}
thead th {
    padding: 9px 10px; text-align: left; font-weight: 700;
    font-size: 9px; text-transform: uppercase; letter-spacing: .6px;
    white-space: nowrap;
}
tbody tr { border-bottom: 1px solid #f1f5f9; }
tbody tr:nth-child(even) { background: #f8fafc; }
tbody tr:hover { background: #eff6ff; }
tbody td { padding: 8px 10px; vertical-align: middle; }
.badge {
    display: inline-block; padding: 2px 8px; border-radius: 20px;
    font-size: 9px; font-weight: 700; text-transform: uppercase;
}
.badge-ativo   { background: #dcfce7; color: #166534; }
.badge-inativo { background: #fee2e2; color: #991b1b; }
.unidade-tag {
    background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe;
    padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 9px;
}
.plate-badge {
    background: #f1f5f9; color: #0f172a; border: 1px solid #cbd5e1;
    padding: 2px 6px; border-radius: 4px; font-weight: 700; font-family: monospace;
    font-size: 11px; letter-spacing: 1px;
}
.tag-code {
    font-family: monospace; color: #475569; background: #f8fafc;
    padding: 2px 4px; border-radius: 3px; border: 1px dashed #e2e8f0;
}
.sem-dados { text-align: center; padding: 24px; color: #94a3b8; font-style: italic; }

/* ── Rodape ── */
.rodape {
    background: #1e3a8a; color: rgba(255,255,255,.75);
    padding: 12px 32px; font-size: 9px;
    display: flex; justify-content: space-between; align-items: center;
}
.rodape strong { color: #fff; }

/* ── Impressao ── */
@media print {
    html, body { background: #fff; }
    .btn-print { display: none !important; }
    .relatorio { box-shadow: none; border-radius: 0; margin: 0; max-width: 100%; }
    @page { margin: 10mm 8mm; size: A4; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; }
}
</style>
</head>
<body>

<button class="btn-print" onclick="window.print()">
    &#128438; Imprimir / Salvar PDF
</button>

<div class="relatorio">

    <!-- CABECALHO -->
    <div class="header">
        <?php if ($logo_url): ?>
        <img src="<?= esc($logo_url) ?>" alt="Logo" class="header-logo" onerror="this.style.display='none'">
        <?php else: ?>
        <div class="header-logo-placeholder">&#127968;</div>
        <?php endif; ?>
        <div class="header-info">
            <h1><?= esc($nome_empresa) ?></h1>
            <p>CNPJ: <?= esc($cnpj_empresa) ?></p>
            <p>Sistema ERP Condominio — Modulo de Veiculos</p>
        </div>
        <div class="header-meta">
            <strong><?= esc($titulo_relatorio) ?></strong>
            Gerado em: <?= $data_geracao ?><br>
            Operador: <?= esc($operador_nome) ?><br>
            <?php if ($filtro): ?>Filtro: <?= esc($filtro) ?><?php endif; ?>
        </div>
    </div>

    <!-- TITULO DO RELATORIO -->
    <div class="titulo-relatorio">
        <span>&#128663; <?= esc($titulo_relatorio) ?></span>
        <?php if ($filtro): ?>
        <span class="filtro-info">Filtro aplicado: "<?= esc($filtro) ?>"</span>
        <?php endif; ?>
    </div>

    <!-- KPIs -->
    <div class="kpis">
        <div class="kpi">
            <div class="kpi-valor"><?= $total_veiculos ?></div>
            <div class="kpi-label">Total de Veiculos</div>
        </div>
        <div class="kpi">
            <div class="kpi-valor"><?= $total_ativos ?></div>
            <div class="kpi-label">Veiculos Ativos</div>
        </div>
        <div class="kpi">
            <div class="kpi-valor"><?= $unidades_unicas ?></div>
            <div class="kpi-label">Unidades com Veiculos</div>
        </div>
        <div class="kpi">
            <div class="kpi-valor"><?= $total_inativos ?></div>
            <div class="kpi-label">Veiculos Inativos</div>
        </div>
    </div>

    <!-- CONTEUDO -->
    <div class="secao">
        <div class="secao-titulo">Lista de Veiculos Cadastrados</div>
        <table>
            <thead>
                <tr>
                    <th>Unidade</th>
                    <th>Morador / Proprietario</th>
                    <th>Dependente</th>
                    <th>Modelo</th>
                    <th>Placa</th>
                    <th>Cor</th>
                    <th>TAG RFID</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
            <?php if (empty($veiculos)): ?>
                <tr><td colspan="8" class="sem-dados">Nenhum veiculo encontrado</td></tr>
            <?php else: ?>
                <?php foreach ($veiculos as $v): ?>
                <tr>
                    <td><span class="unidade-tag"><?= esc($v['morador_unidade'] ?? '—') ?></span></td>
                    <td><strong><?= esc($v['morador_nome'] ?? '—') ?></strong></td>
                    <td><?= esc($v['dependente_nome'] ?? '—') ?></td>
                    <td><?= esc($v['modelo'] ?? '—') ?></td>
                    <td><span class="plate-badge"><?= esc($v['placa'] ?? '—') ?></span></td>
                    <td><?= esc($v['cor'] ?? '—') ?></td>
                    <td><span class="tag-code"><?= esc($v['tag'] ?? '—') ?></span></td>
                    <td>
                        <?php if (($v['ativo'] ?? 1) == 1): ?>
                        <span class="badge badge-ativo">Ativo</span>
                        <?php else: ?>
                        <span class="badge badge-inativo">Inativo</span>
                        <?php endif; ?>
                    </td>
                </tr>
                <?php endforeach; ?>
            <?php endif; ?>
            </tbody>
        </table>
        <p style="margin-top:10px;font-size:9px;color:#64748b;text-align:right;">
            Total: <?= count($veiculos) ?> veiculo(s)
        </p>
    </div>

    <!-- RODAPE -->
    <div class="rodape">
        <span><strong><?= esc($nome_empresa) ?></strong> — Sistema ERP Condominio</span>
        <span>Relatorio gerado em <?= $data_geracao ?> por <?= esc($operador_nome) ?></span>
    </div>

</div>

<?php if ($auto_print): ?>
<script>
window.addEventListener('load', function() { setTimeout(function() { window.print(); }, 600); });
</script>
<?php endif; ?>

</body>
</html>

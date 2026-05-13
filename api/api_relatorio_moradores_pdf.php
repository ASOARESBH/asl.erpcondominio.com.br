<?php
/**
 * ============================================================
 * RELATORIO DE MORADORES — GERADOR DE PDF/IMPRESSAO
 * ============================================================
 * Template padrao do sistema ERP Condominio.
 * Identidade visual: azul #1e3a8a / #2563eb + logo da associacao.
 *
 * Filtros aceitos via GET:
 *   tipo       — unidade | dependente | contato | ranking (padrao: unidade)
 *   filtro     — texto de filtro (unidade, nome, CPF...)
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
$tipo       = trim($_GET['tipo']   ?? 'unidade');
$filtro     = trim($_GET['filtro'] ?? '');
$auto_print = ($_GET['print'] ?? '') === 'true';

// Titulos por tipo
$titulos = [
    'unidade'    => 'Moradores por Unidade',
    'dependente' => 'Moradores por Dependente',
    'contato'    => 'Lista de Contatos',
    'ranking'    => 'Ranking de Dependentes por Unidade',
];
$titulo_relatorio = $titulos[$tipo] ?? 'Relatorio de Moradores';

// ── 5. Buscar dados ───────────────────────────────────────────
$moradores   = [];
$dependentes = [];

// Buscar todos os moradores
$sql_mor = "SELECT id, nome, cpf, unidade, email, telefone, celular, ativo FROM moradores ORDER BY unidade ASC, nome ASC";
$res_mor = $conn->query($sql_mor);
if ($res_mor) {
    while ($row = $res_mor->fetch_assoc()) {
        $moradores[] = $row;
    }
}

// Buscar todos os dependentes
$sql_dep = "SELECT d.id, d.nome_completo, d.cpf, d.parentesco, d.email, d.celular,
                   m.nome AS morador_nome, m.unidade AS morador_unidade, m.id AS morador_id
            FROM dependentes d
            INNER JOIN moradores m ON d.morador_id = m.id
            ORDER BY m.unidade ASC, m.nome ASC, d.nome_completo ASC";
$res_dep = $conn->query($sql_dep);
if ($res_dep) {
    while ($row = $res_dep->fetch_assoc()) {
        $dependentes[] = $row;
    }
}

// Aplicar filtro
$filtro_lower = strtolower($filtro);

if ($tipo === 'unidade') {
    if ($filtro !== '') {
        $moradores = array_values(array_filter($moradores, function($m) use ($filtro_lower) {
            return strpos(strtolower($m['unidade'] ?? ''), $filtro_lower) !== false;
        }));
    }
} elseif ($tipo === 'dependente') {
    if ($filtro !== '') {
        $dependentes = array_values(array_filter($dependentes, function($d) use ($filtro_lower) {
            return strpos(strtolower($d['nome_completo'] ?? ''), $filtro_lower) !== false
                || strpos(strtolower($d['cpf'] ?? ''), $filtro_lower) !== false;
        }));
    }
} elseif ($tipo === 'contato') {
    if ($filtro !== '') {
        $moradores = array_values(array_filter($moradores, function($m) use ($filtro_lower) {
            return strpos(strtolower($m['nome'] ?? ''), $filtro_lower) !== false
                || strpos(strtolower($m['unidade'] ?? ''), $filtro_lower) !== false
                || strpos(strtolower($m['email'] ?? ''), $filtro_lower) !== false;
        }));
    }
}

// Montar mapa de dependentes por morador (para unidade e ranking)
$dep_por_morador = [];
foreach ($dependentes as $d) {
    $mid = $d['morador_id'];
    if (!isset($dep_por_morador[$mid])) $dep_por_morador[$mid] = 0;
    $dep_por_morador[$mid]++;
}

// KPIs
$total_moradores   = count($moradores);
$total_dependentes = count($dependentes);
$unidades_com_dep  = count(array_unique(array_column($dependentes, 'morador_unidade')));
$media_dep         = $unidades_com_dep > 0 ? round($total_dependentes / $unidades_com_dep, 1) : 0;

// Data/hora
$data_geracao = date('d/m/Y \a\s H:i');
$operador_nome = $usuario ? ($usuario['nome'] ?? 'Sistema') : 'Sistema';

// ── 6. Funcoes auxiliares ─────────────────────────────────────
function fmt_cpf($cpf) {
    $cpf = preg_replace('/\D/', '', $cpf ?? '');
    if (strlen($cpf) === 11) {
        return substr($cpf,0,3).'.'.substr($cpf,3,3).'.'.substr($cpf,6,3).'-'.substr($cpf,9,2);
    }
    return $cpf ?: '—';
}
function fmt_tel($t) { return $t ?: '—'; }
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
.badge-dep     { background: #dbeafe; color: #1d4ed8; }
.unidade-tag {
    background: #eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe;
    padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 9px;
}
.dep-count {
    background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0;
    padding: 2px 8px; border-radius: 4px; font-weight: 700; font-size: 9px;
    text-align: center;
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
            <p>Sistema ERP Condominio — Modulo de Moradores</p>
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
        <span>&#128101; <?= esc($titulo_relatorio) ?></span>
        <?php if ($filtro): ?>
        <span class="filtro-info">Filtro aplicado: "<?= esc($filtro) ?>"</span>
        <?php endif; ?>
    </div>

    <!-- KPIs -->
    <div class="kpis">
        <div class="kpi">
            <div class="kpi-valor"><?= $total_moradores ?></div>
            <div class="kpi-label">Total de Moradores</div>
        </div>
        <div class="kpi">
            <div class="kpi-valor"><?= $total_dependentes ?></div>
            <div class="kpi-label">Total de Dependentes</div>
        </div>
        <div class="kpi">
            <div class="kpi-valor"><?= $unidades_com_dep ?></div>
            <div class="kpi-label">Unidades com Dep.</div>
        </div>
        <div class="kpi">
            <div class="kpi-valor"><?= $media_dep ?></div>
            <div class="kpi-label">Media Dep./Unidade</div>
        </div>
    </div>

    <!-- CONTEUDO POR TIPO -->
    <?php if ($tipo === 'unidade'): ?>
    <div class="secao">
        <div class="secao-titulo">Moradores por Unidade</div>
        <table>
            <thead>
                <tr>
                    <th>Unidade</th>
                    <th>Morador</th>
                    <th>CPF</th>
                    <th>E-mail</th>
                    <th>Telefone</th>
                    <th>Celular</th>
                    <th>Dep.</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
            <?php if (empty($moradores)): ?>
                <tr><td colspan="8" class="sem-dados">Nenhum morador encontrado</td></tr>
            <?php else: ?>
                <?php foreach ($moradores as $m): ?>
                <tr>
                    <td><span class="unidade-tag"><?= esc($m['unidade'] ?? '—') ?></span></td>
                    <td><strong><?= esc($m['nome'] ?? '—') ?></strong></td>
                    <td><?= fmt_cpf($m['cpf']) ?></td>
                    <td><?= esc($m['email'] ?? '—') ?></td>
                    <td><?= fmt_tel($m['telefone']) ?></td>
                    <td><?= fmt_tel($m['celular']) ?></td>
                    <td><span class="dep-count"><?= $dep_por_morador[$m['id']] ?? 0 ?></span></td>
                    <td>
                        <?php if (($m['ativo'] ?? 1) == 1): ?>
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
            Total: <?= count($moradores) ?> morador(es)
        </p>
    </div>

    <?php elseif ($tipo === 'dependente'): ?>
    <div class="secao">
        <div class="secao-titulo">Moradores por Dependente</div>
        <table>
            <thead>
                <tr>
                    <th>Dependente</th>
                    <th>CPF</th>
                    <th>Parentesco</th>
                    <th>Morador</th>
                    <th>Unidade</th>
                    <th>E-mail</th>
                    <th>Celular</th>
                </tr>
            </thead>
            <tbody>
            <?php if (empty($dependentes)): ?>
                <tr><td colspan="7" class="sem-dados">Nenhum dependente encontrado</td></tr>
            <?php else: ?>
                <?php foreach ($dependentes as $d): ?>
                <tr>
                    <td><strong><?= esc($d['nome_completo'] ?? '—') ?></strong></td>
                    <td><?= fmt_cpf($d['cpf']) ?></td>
                    <td><span class="badge badge-dep"><?= esc($d['parentesco'] ?? '—') ?></span></td>
                    <td><?= esc($d['morador_nome'] ?? '—') ?></td>
                    <td><span class="unidade-tag"><?= esc($d['morador_unidade'] ?? '—') ?></span></td>
                    <td><?= esc($d['email'] ?? '—') ?></td>
                    <td><?= fmt_tel($d['celular']) ?></td>
                </tr>
                <?php endforeach; ?>
            <?php endif; ?>
            </tbody>
        </table>
        <p style="margin-top:10px;font-size:9px;color:#64748b;text-align:right;">
            Total: <?= count($dependentes) ?> dependente(s)
        </p>
    </div>

    <?php elseif ($tipo === 'contato'): ?>
    <div class="secao">
        <div class="secao-titulo">Lista de Contatos</div>
        <table>
            <thead>
                <tr>
                    <th>Unidade</th>
                    <th>Morador</th>
                    <th>CPF</th>
                    <th>E-mail</th>
                    <th>Telefone</th>
                    <th>Celular</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
            <?php if (empty($moradores)): ?>
                <tr><td colspan="7" class="sem-dados">Nenhum morador encontrado</td></tr>
            <?php else: ?>
                <?php foreach ($moradores as $m): ?>
                <tr>
                    <td><span class="unidade-tag"><?= esc($m['unidade'] ?? '—') ?></span></td>
                    <td><strong><?= esc($m['nome'] ?? '—') ?></strong></td>
                    <td><?= fmt_cpf($m['cpf']) ?></td>
                    <td><?= esc($m['email'] ?? '—') ?></td>
                    <td><?= fmt_tel($m['telefone']) ?></td>
                    <td><?= fmt_tel($m['celular']) ?></td>
                    <td>
                        <?php if (($m['ativo'] ?? 1) == 1): ?>
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
            Total: <?= count($moradores) ?> morador(es)
        </p>
    </div>

    <?php elseif ($tipo === 'ranking'): ?>
    <div class="secao">
        <div class="secao-titulo">Ranking de Dependentes por Unidade</div>
        <?php
        // Montar ranking
        $ranking = [];
        foreach ($moradores as $m) {
            $mid = $m['id'];
            $ranking[] = [
                'unidade' => $m['unidade'] ?? '—',
                'nome'    => $m['nome']    ?? '—',
                'total'   => $dep_por_morador[$mid] ?? 0,
            ];
        }
        usort($ranking, function($a, $b) { return $b['total'] - $a['total']; });
        $ranking = array_filter($ranking, function($r) { return $r['total'] > 0; });
        $ranking = array_values($ranking);
        ?>
        <table>
            <thead>
                <tr>
                    <th style="width:50px">Pos.</th>
                    <th>Unidade</th>
                    <th>Morador</th>
                    <th style="width:80px;text-align:center">Dependentes</th>
                    <th>Grafico</th>
                </tr>
            </thead>
            <tbody>
            <?php if (empty($ranking)): ?>
                <tr><td colspan="5" class="sem-dados">Nenhum dado de dependentes encontrado</td></tr>
            <?php else:
                $max_dep = $ranking[0]['total'];
                foreach ($ranking as $i => $r):
                    $pct = $max_dep > 0 ? round(($r['total'] / $max_dep) * 100) : 0;
                    $pos = $i + 1;
                    $medal = $pos === 1 ? '#f59e0b' : ($pos === 2 ? '#94a3b8' : ($pos === 3 ? '#cd7f32' : '#2563eb'));
            ?>
                <tr>
                    <td style="text-align:center">
                        <span style="background:<?= $medal ?>;color:#fff;border-radius:50%;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;font-weight:800;font-size:10px"><?= $pos ?></span>
                    </td>
                    <td><span class="unidade-tag"><?= esc($r['unidade']) ?></span></td>
                    <td><?= esc($r['nome']) ?></td>
                    <td style="text-align:center"><span class="dep-count"><?= $r['total'] ?></span></td>
                    <td>
                        <div style="background:#e2e8f0;border-radius:4px;height:10px;overflow:hidden;">
                            <div style="background:linear-gradient(90deg,#1e3a8a,#2563eb);height:100%;width:<?= $pct ?>%;border-radius:4px;"></div>
                        </div>
                    </td>
                </tr>
            <?php endforeach; endif; ?>
            </tbody>
        </table>
        <p style="margin-top:10px;font-size:9px;color:#64748b;text-align:right;">
            <?= count($ranking) ?> unidade(s) com dependentes
        </p>
    </div>
    <?php endif; ?>

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

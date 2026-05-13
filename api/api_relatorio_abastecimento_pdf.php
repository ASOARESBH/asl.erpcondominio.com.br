<?php
require_once 'config.php';
require_once 'auth_helper.php';

// Iniciar sessão e verificar autenticação (igual ao api_abastecimento.php)
session_start();
verificarAutenticacao(true, 'operador');

// Configurar timezone e idioma
date_default_timezone_set('America/Sao_Paulo');
setlocale(LC_TIME, 'pt_BR.utf-8', 'pt_BR', 'portuguese');

// Obter dados da empresa para o cabeçalho
$sql_empresa = "SELECT * FROM empresa LIMIT 1";
$result_empresa = $conn->query($sql_empresa);
$empresa = $result_empresa->fetch_assoc();

$nome_empresa = $empresa['nome_fantasia'] ?? $empresa['razao_social'] ?? 'ASSOCIAÇÃO SERRA DA LIBERDADE';
$cnpj_empresa = $empresa['cnpj'] ?? '28.231.106/0001-15';
$logo_empresa = !empty($empresa['logo_url']) ? '../' . $empresa['logo_url'] : '../assets/images/logo.jpeg';

// Receber filtros
$veiculo_id = $_GET['veiculo_id'] ?? '';
$data_inicio = $_GET['data_inicio'] ?? '';
$data_fim = $_GET['data_fim'] ?? '';
$combustivel = $_GET['combustivel'] ?? '';

// Montar query com filtros
$where = [];
$params = [];
$types = '';

if (!empty($veiculo_id)) {
    $where[] = "a.veiculo_id = ?";
    $params[] = $veiculo_id;
    $types .= 'i';
}

if (!empty($data_inicio)) {
    $where[] = "DATE(a.data_abastecimento) >= ?";
    $params[] = $data_inicio;
    $types .= 's';
}

if (!empty($data_fim)) {
    $where[] = "DATE(a.data_abastecimento) <= ?";
    $params[] = $data_fim;
    $types .= 's';
}

if (!empty($combustivel)) {
    $where[] = "a.tipo_combustivel = ?";
    $params[] = $combustivel;
    $types .= 's';
}

$whereClause = count($where) > 0 ? 'WHERE ' . implode(' AND ', $where) : '';

$sql = "
    SELECT 
        a.*,
        v.placa as veiculo_placa,
        v.modelo as veiculo_modelo,
        u.nome as operador_nome
    FROM abastecimento_lancamentos a
    INNER JOIN abastecimento_veiculos v ON a.veiculo_id = v.id
    INNER JOIN usuarios u ON a.operador_id = u.id
    $whereClause
    ORDER BY a.data_abastecimento DESC
";

if (count($params) > 0) {
    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $result = $stmt->get_result();
} else {
    $result = $conn->query($sql);
}

$dados = [];
$total_litros = 0;
$total_valor = 0;

while ($row = $result->fetch_assoc()) {
    $dados[] = $row;
    $total_litros += $row['litros'];
    $total_valor += $row['valor'];
}

// Iniciar a classe PDF (usando TCPDF que é comum no PHP ou HTML2PDF via DOMPDF)
// Como não sei qual biblioteca está instalada, vou gerar um HTML e usar window.print() no frontend 
// OU posso verificar as bibliotecas disponíveis.
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Relatório de Abastecimento</title>
    <style>
        :root {
            --primary-color: #0f172a;
            --secondary-color: #1e293b;
            --accent-color: #2563eb;
            --text-color: #334155;
            --light-gray: #f8fafc;
            --border-color: #e2e8f0;
        }
        
        @page {
            size: A4 portrait;
            margin: 15mm;
        }
        
        body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: var(--text-color);
            margin: 0;
            padding: 0;
            background-color: #fff;
            font-size: 12px;
        }
        
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid var(--accent-color);
            padding-bottom: 15px;
            margin-bottom: 20px;
        }
        
        .logo-container {
            width: 150px;
        }
        
        .logo {
            max-width: 100%;
            max-height: 80px;
            object-fit: contain;
        }
        
        .company-info {
            text-align: right;
        }
        
        .company-name {
            font-size: 18px;
            font-weight: bold;
            color: var(--primary-color);
            margin: 0 0 5px 0;
        }
        
        .company-cnpj {
            font-size: 12px;
            color: #64748b;
            margin: 0;
        }
        
        .report-title {
            text-align: center;
            margin-bottom: 20px;
        }
        
        .report-title h2 {
            color: var(--primary-color);
            margin: 0 0 5px 0;
            font-size: 22px;
        }
        
        .report-period {
            color: #64748b;
            font-size: 14px;
        }
        
        .filters-info {
            background-color: var(--light-gray);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            padding: 10px 15px;
            margin-bottom: 20px;
            display: flex;
            flex-wrap: wrap;
            gap: 15px;
        }
        
        .filter-item {
            font-size: 12px;
        }
        
        .filter-label {
            font-weight: bold;
            color: var(--secondary-color);
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
        }
        
        th {
            background-color: var(--accent-color);
            color: white;
            text-align: left;
            padding: 10px 8px;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        td {
            padding: 8px;
            border-bottom: 1px solid var(--border-color);
            font-size: 11px;
        }
        
        tr:nth-child(even) {
            background-color: #f8fafc;
        }
        
        .text-right {
            text-align: right;
        }
        
        .text-center {
            text-align: center;
        }
        
        .summary-box {
            display: flex;
            justify-content: flex-end;
            gap: 20px;
            margin-top: 20px;
            page-break-inside: avoid;
        }
        
        .summary-item {
            background-color: var(--light-gray);
            border: 1px solid var(--border-color);
            border-radius: 6px;
            padding: 15px 20px;
            text-align: center;
            min-width: 150px;
        }
        
        .summary-label {
            display: block;
            font-size: 12px;
            color: #64748b;
            margin-bottom: 5px;
            text-transform: uppercase;
        }
        
        .summary-value {
            display: block;
            font-size: 20px;
            font-weight: bold;
            color: var(--accent-color);
        }
        
        .footer {
            margin-top: 40px;
            padding-top: 15px;
            border-top: 1px solid var(--border-color);
            display: flex;
            justify-content: space-between;
            font-size: 10px;
            color: #94a3b8;
            page-break-inside: avoid;
        }
        
        .badge {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 12px;
            font-size: 10px;
            font-weight: bold;
            background-color: #e2e8f0;
            color: #475569;
        }
        
        .badge-gasolina { background-color: #fee2e2; color: #b91c1c; }
        .badge-alcool { background-color: #dcfce7; color: #15803d; }
        .badge-diesel { background-color: #fef3c7; color: #b45309; }
        
        @media print {
            .no-print {
                display: none !important;
            }
            body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
        }
        
        .print-btn-container {
            text-align: center;
            margin: 20px 0;
        }
        
        .btn-print {
            background-color: var(--accent-color);
            color: white;
            border: none;
            padding: 10px 20px;
            border-radius: 6px;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
            transition: background-color 0.2s;
        }
        
        .btn-print:hover {
            background-color: #1d4ed8;
        }
        
        .btn-print svg {
            width: 18px;
            height: 18px;
        }
    </style>
</head>
<body>
    <div class="no-print print-btn-container">
        <button class="btn-print" onclick="window.print()">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Imprimir / Salvar PDF
        </button>
    </div>

    <div class="header">
        <div class="logo-container">
            <img src="<?= htmlspecialchars($logo_empresa) ?>" alt="Logo" class="logo" onerror="this.src='../assets/images/logo.jpeg'">
        </div>
        <div class="company-info">
            <h1 class="company-name"><?= htmlspecialchars($nome_empresa) ?></h1>
            <p class="company-cnpj">CNPJ: <?= htmlspecialchars($cnpj_empresa) ?></p>
            <p class="company-cnpj">Relatório gerado em: <?= date('d/m/Y \à\s H:i:s') ?></p>
        </div>
    </div>

    <div class="report-title">
        <h2>Relatório de Abastecimento de Veículos</h2>
        <div class="report-period">
            <?php 
            if (!empty($data_inicio) && !empty($data_fim)) {
                echo "Período: " . date('d/m/Y', strtotime($data_inicio)) . " a " . date('d/m/Y', strtotime($data_fim));
            } elseif (!empty($data_inicio)) {
                echo "A partir de: " . date('d/m/Y', strtotime($data_inicio));
            } elseif (!empty($data_fim)) {
                echo "Até: " . date('d/m/Y', strtotime($data_fim));
            } else {
                echo "Período: Completo (Todos os registros)";
            }
            ?>
        </div>
    </div>

    <div class="filters-info">
        <div class="filter-item">
            <span class="filter-label">Veículo:</span> 
            <?php 
            if (!empty($veiculo_id)) {
                $sql_v = "SELECT placa, modelo FROM abastecimento_veiculos WHERE id = ?";
                $stmt_v = $conn->prepare($sql_v);
                $stmt_v->bind_param('i', $veiculo_id);
                $stmt_v->execute();
                $res_v = $stmt_v->get_result()->fetch_assoc();
                echo htmlspecialchars($res_v['placa'] . ' - ' . $res_v['modelo']);
            } else {
                echo "Todos os veículos";
            }
            ?>
        </div>
        <div class="filter-item">
            <span class="filter-label">Combustível:</span> 
            <?= !empty($combustivel) ? htmlspecialchars($combustivel) : 'Todos' ?>
        </div>
        <div class="filter-item">
            <span class="filter-label">Total de Registros:</span> 
            <?= count($dados) ?>
        </div>
    </div>

    <table>
        <thead>
            <tr>
                <th width="12%">Data/Hora</th>
                <th width="15%">Veículo</th>
                <th width="10%">Placa</th>
                <th width="10%">KM</th>
                <th width="10%">Combustível</th>
                <th width="18%">Operador</th>
                <th width="10%" class="text-right">Litros</th>
                <th width="15%" class="text-right">Valor (R$)</th>
            </tr>
        </thead>
        <tbody>
            <?php if (count($dados) > 0): ?>
                <?php foreach ($dados as $row): 
                    $badge_class = '';
                    $tipo = strtolower(remover_acentos($row['tipo_combustivel']));
                    if (strpos($tipo, 'gasolina') !== false) $badge_class = 'badge-gasolina';
                    elseif (strpos($tipo, 'alcool') !== false || strpos($tipo, 'álcool') !== false) $badge_class = 'badge-alcool';
                    elseif (strpos($tipo, 'diesel') !== false) $badge_class = 'badge-diesel';
                ?>
                    <tr>
                        <td><?= date('d/m/Y H:i', strtotime($row['data_abastecimento'])) ?></td>
                        <td><?= htmlspecialchars($row['veiculo_modelo']) ?></td>
                        <td><strong><?= htmlspecialchars($row['veiculo_placa']) ?></strong></td>
                        <td><?= number_format($row['km_abastecimento'], 0, ',', '.') ?> km</td>
                        <td><span class="badge <?= $badge_class ?>"><?= htmlspecialchars($row['tipo_combustivel']) ?></span></td>
                        <td><?= htmlspecialchars($row['operador_nome']) ?></td>
                        <td class="text-right"><?= number_format($row['litros'], 2, ',', '.') ?> L</td>
                        <td class="text-right">R$ <?= number_format($row['valor'], 2, ',', '.') ?></td>
                    </tr>
                <?php endforeach; ?>
            <?php else: ?>
                <tr>
                    <td colspan="8" class="text-center" style="padding: 20px;">Nenhum registro encontrado para os filtros selecionados.</td>
                </tr>
            <?php endif; ?>
        </tbody>
    </table>

    <?php if (count($dados) > 0): ?>
    <div class="summary-box">
        <div class="summary-item">
            <span class="summary-label">Total de Litros</span>
            <span class="summary-value"><?= number_format($total_litros, 2, ',', '.') ?> L</span>
        </div>
        <div class="summary-item">
            <span class="summary-label">Valor Total</span>
            <span class="summary-value">R$ <?= number_format($total_valor, 2, ',', '.') ?></span>
        </div>
    </div>
    <?php endif; ?>

    <div class="footer">
        <div>Sistema ERP Condomínio - Módulo de Abastecimento</div>
        <div>Página 1 de 1</div>
    </div>

    <script>
        // Script para iniciar a impressão automaticamente se houver parâmetro na URL
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('print') && urlParams.get('print') === 'true') {
            setTimeout(() => {
                window.print();
            }, 500);
        }
    </script>
</body>
</html>
<?php
// Função auxiliar
function remover_acentos($string) {
    return preg_replace(array("/(á|à|ã|â|ä)/","/(Á|À|Ã|Â|Ä)/","/(é|è|ê|ë)/","/(É|È|Ê|Ë)/","/(í|ì|î|ï)/","/(Í|Ì|Î|Ï)/","/(ó|ò|õ|ô|ö)/","/(Ó|Ò|Õ|Ô|Ö)/","/(ú|ù|û|ü)/","/(Ú|Ù|Û|Ü)/","/(ñ)/","/(Ñ)/","/(ç)/","/(Ç)/"),explode(" ","a A e E i I o O u U n N c C"),$string);
}
fechar_conexao($conn);
?>

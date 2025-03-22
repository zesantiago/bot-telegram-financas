// Bot de Controle Financeiro com ML, Gastos Compartilhados, Métodos de Pagamento e Bancos
require('dotenv').config();
const { Telegraf } = require('telegraf');
const { google } = require('googleapis');
const moment = require('moment');
moment.locale('pt-br');
const express = require('express');
const bodyParser = require('body-parser');

// Logs de inicialização
console.log('Iniciando o bot de finanças...');

// Configurações do Bot Telegram
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);

// Categorias de despesas e suas palavras-chave (ampliadas para treinamento ML)
const categorias = {
  'mercado': ['mercado', 'supermercado', 'feira', 'frutas', 'alimentos', 'comida', 'hortifruti', 'açougue', 'padaria', 'pão', 'leite', 'carne', 'verdura', 'legume', 'cereal'],
  'transporte': ['transporte', 'gasolina', 'uber', 'táxi', '99', 'cabify', 'ônibus', 'metrô', 'combustível', 'estacionamento', 'pedágio', 'passagem', 'bilhete', 'brt', 'trem'],
  'lazer': ['lazer', 'restaurante', 'cinema', 'teatro', 'show', 'viagem', 'bar', 'bebida', 'cerveja', 'festa', 'passeio', 'ingresso', 'parque', 'shopping', 'lanche', 'netflix', 'streaming'],
  'saúde': ['saúde', 'farmácia', 'remédio', 'médico', 'consulta', 'exame', 'hospital', 'dentista', 'terapia', 'academia', 'vitamina', 'suplemento', 'plano de saúde', 'psicólogo'],
  'educação': ['educação', 'livro', 'curso', 'escola', 'faculdade', 'mensalidade', 'material escolar', 'apostila', 'aula', 'professor', 'treinamento', 'workshop', 'certificado'],
  'moradia': ['moradia', 'aluguel', 'condomínio', 'água', 'luz', 'internet', 'gás', 'iptu', 'reforma', 'mobília', 'móveis', 'decoração', 'cama', 'sofá', 'eletrodomésticos'],
  'vestuário': ['roupa', 'calçado', 'sapato', 'tênis', 'camisa', 'calça', 'vestido', 'acessório', 'bolsa', 'moda'],
  'pet': ['pet', 'animal', 'cachorro', 'gato', 'ração', 'veterinário', 'petshop', 'brinquedo pet', 'remédio pet'],
  'outros': ['outros', 'diverso', 'presente', 'doação', 'serviço']
};

// Categorias de ganhos e suas palavras-chave
const categoriasGanhos = {
  'salário': ['salário', 'salario', 'pagamento', 'contracheque', 'holerite', 'folha', 'remuneração', 'ordenado'],
  'freelance': ['freelance', 'freela', 'projeto', 'job', 'trabalho extra', 'serviço prestado', 'consultoria'],
  'investimentos': ['investimento', 'rendimento', 'dividendo', 'aplicação', 'juros', 'ação', 'renda fixa', 'tesouro', 'aluguel'],
  'presente': ['presente', 'bônus', 'bonus', 'prêmio', 'premio', 'doação', 'regalo', 'gratificação'],
  'reembolso': ['reembolso', 'restituição', 'devolução', 'estorno', 'cashback'],
  'outros': ['outros', 'diverso', 'entrada', 'recebimento']
};

// Métodos de pagamento e suas palavras-chave
const metodosPagamento = {
  'pix': ['pix', 'transferência pix', 'transferencia pix'],
  'dinheiro': ['dinheiro', 'espécie', 'especie', 'cash', 'em mãos', 'em maos'],
  'cartão de crédito': ['cartão de crédito', 'cartao de credito', 'crédito', 'credito', 'credit', 'cc', 'fatura'],
  'cartão de débito': ['cartão de débito', 'cartao de debito', 'débito', 'debito', 'debit'],
  'boleto': ['boleto', 'fatura', 'conta', 'bill'],
  'transferência': ['transferência', 'transferencia', 'ted', 'doc', 'wire', 'bank transfer'],
  'outros': ['outros']
};

// Bancos e suas palavras-chave
const bancos = {
  'itaú': ['itaú', 'itau', 'itaucard'],
  'bradesco': ['bradesco', 'bradcard'],
  'santander': ['santander'],
  'banco do brasil': ['banco do brasil', 'bb'],
  'caixa': ['caixa', 'caixa econômica'],
  'nubank': ['nubank', 'nu'],
  'inter': ['inter', 'banco inter'],
  'c6': ['c6', 'c6bank'],
  'outros': ['outros']
};

// Pessoas para gastos compartilhados
const pessoasCompartilhamento = ['esposa', 'esposo', 'namorada', 'namorado', 'mulher', 'marido', 'companheiro', 'companheira', 'amigo', 'amiga', 'colega', 'parceiro', 'parceira', 'cônjuge', 'conjuge'];

// Mapeamento de meses para números
const mesesMap = {
  'janeiro': 0, 'jan': 0, 'fevereiro': 1, 'fev': 1, 'março': 2, 'mar': 2,
  'abril': 3, 'abr': 3, 'maio': 4, 'mai': 4, 'junho': 5, 'jun': 5,
  'julho': 6, 'jul': 6, 'agosto': 7, 'ago': 7, 'setembro': 8, 'set': 8,
  'outubro': 9, 'out': 9, 'novembro': 10, 'nov': 10, 'dezembro': 11, 'dez': 11
};

// Configuração do Google Sheets
const sheets = google.sheets({ version: 'v4' });
const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;
const RANGE = 'Despesas!A:I'; // Atualizado para incluir método de pagamento e banco

// Autenticação com o Google
async function authorize() {
  // Certifique-se de que a chave privada tenha quebras de linha adequadas
  const privateKey = process.env.GOOGLE_PRIVATE_KEY
    ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : '';

  const auth = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    privateKey,
    ['https://www.googleapis.com/auth/spreadsheets']
  );
  return auth;
}

// ====== MODELO ML PARA CLASSIFICAÇÃO DE CATEGORIAS ======

// Função para calcular similaridade entre strings (algoritmo Jaccard)
function calcularSimilaridade(texto1, texto2) {
  // Normaliza os textos: remove acentos, converte para minúsculas e divide em palavras
  const normalizar = (texto) => {
    return texto.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .split(/\s+/)
      .filter(palavra => palavra.length > 2);
  };

  const palavras1 = new Set(normalizar(texto1));
  const palavras2 = new Set(normalizar(texto2));

  // Cálculo do coeficiente de Jaccard
  const intersecao = new Set([...palavras1].filter(p => palavras2.has(p)));
  const uniao = new Set([...palavras1, ...palavras2]);

  if (uniao.size === 0) return 0;
  return intersecao.size / uniao.size;
}

// Função para classificar categoria usando "ML" (similaridade de texto)
function classificarCategoriaML(texto, tipo) {
  texto = texto.toLowerCase();
  const categoriasAlvo = tipo === 'Ganho' ? categoriasGanhos : categorias;

  // Primeiro vamos verificar palavras-chave diretas
  for (const [categoria, keywords] of Object.entries(categoriasAlvo)) {
    for (const keyword of keywords) {
      if (texto.includes(keyword)) {
        return { categoria, confianca: 0.9 }; // Alta confiança para correspondências diretas
      }
    }
  }

  // Se não encontrar correspondência direta, usa similaridade de texto
  let melhorCategoria = 'outros';
  let maiorSimilaridade = 0;

  for (const [categoria, keywords] of Object.entries(categoriasAlvo)) {
    // Junta todas as palavras-chave da categoria
    const textoCategoria = keywords.join(' ');

    // Calcula similaridade
    const similaridade = calcularSimilaridade(texto, textoCategoria);

    if (similaridade > maiorSimilaridade) {
      maiorSimilaridade = similaridade;
      melhorCategoria = categoria;
    }
  }

  return {
    categoria: melhorCategoria,
    confianca: maiorSimilaridade
  };
}

// ====== PROCESSAMENTO DE GASTOS COMPARTILHADOS ======

// Verifica se a transação é compartilhada e com quem
function verificarCompartilhamento(texto) {
  texto = texto.toLowerCase();

  // Padrões para detectar gastos compartilhados
  const padroesCompartilhamento = [
    'com minha', 'com meu', 'junto com', 'dividido com', 'dividindo com',
    'compartilhado', 'compartilhada', 'dividimos', 'compartilhamos'
  ];

  // Verifica se algum padrão está presente
  const éCompartilhado = padroesCompartilhamento.some(padrao => texto.includes(padrao));

  if (!éCompartilhado) {
    return { compartilhado: false, pessoa: null };
  }

  // Tenta identificar com quem é compartilhado
  let pessoaIdentificada = null;
  for (const pessoa of pessoasCompartilhamento) {
    if (texto.includes(pessoa)) {
      pessoaIdentificada = pessoa;
      break;
    }
  }

  return {
    compartilhado: true,
    pessoa: pessoaIdentificada || 'não especificado'
  };
}

// ====== PROCESSAMENTO DE MÉTODOS DE PAGAMENTO E BANCOS ======

// Função para identificar método de pagamento
function identificarMetodoPagamento(texto) {
  texto = texto.toLowerCase();

  // Verificar métodos específicos mencionados
  for (const [metodo, keywords] of Object.entries(metodosPagamento)) {
    for (const keyword of keywords) {
      if (texto.includes(keyword)) {
        return metodo;
      }
    }
  }

  // Verificar padrões comuns
  if (texto.includes('cartão') || texto.includes('cartao')) {
    if (texto.includes('crédito') || texto.includes('credito')) {
      return 'cartão de crédito';
    } else if (texto.includes('débito') || texto.includes('debito')) {
      return 'cartão de débito';
    } else {
      return 'cartão de crédito'; // Default para menção de cartão
    }
  }

  // Default
  return 'outros';
}

// Função para identificar banco ou cartão
function identificarBanco(texto) {
  texto = texto.toLowerCase();

  // Verificar bancos específicos mencionados
  for (const [banco, keywords] of Object.entries(bancos)) {
    for (const keyword of keywords) {
      if (texto.includes(keyword)) {
        return banco;
      }
    }
  }

  // Default
  return '';
}

// Extrai valor da mensagem
function extrairValor(texto) {
  const regex = /(\d+[.,]?\d*)/g;
  const matches = texto.match(regex);

  if (matches && matches.length > 0) {
    // Substituir vírgula por ponto para formatação numérica
    return parseFloat(matches[0].replace(',', '.'));
  }

  return 0;
}

// Verificar se é uma mensagem de ganho
function isGanho(texto) {
  const padroes = ['recebi', 'ganhei', 'entrou', 'depositou', 'salário', 'salario', 'rendimento', 'recebimento'];
  texto = texto.toLowerCase();

  return padroes.some(padrao => texto.includes(padrao));
}

// Extrair informações de data da consulta
function extrairPeriodo(texto) {
  texto = texto.toLowerCase();
  const anoAtual = moment().year();
  const mesAtual = moment().month();
  let periodo = {
    tipo: 'mes',  // 'mes', 'dia', 'intervalo'
    inicio: null,
    fim: null,
    desc: 'mês atual'
  };

  // Verificar se há referência a um mês específico
  for (const [mes, indice] of Object.entries(mesesMap)) {
    if (texto.includes(mes)) {
      // Verificar se há um ano específico
      const anoMatch = texto.match(/\b(20\d{2})\b/);
      const ano = anoMatch ? parseInt(anoMatch[1]) : anoAtual;

      // Criar data de início (primeiro dia do mês) e fim (último dia do mês)
      periodo.inicio = moment({ year: ano, month: indice, day: 1 }).startOf('day');
      periodo.fim = moment(periodo.inicio).endOf('month');
      periodo.desc = `${mes} de ${ano}`;
      return periodo;
    }
  }

  // Verificar se há referência a hoje
  if (texto.includes('hoje')) {
    const hoje = moment().startOf('day');
    periodo.tipo = 'dia';
    periodo.inicio = hoje;
    periodo.fim = moment(hoje).endOf('day');
    periodo.desc = 'hoje';
    return periodo;
  }

  // Verificar se há referência a ontem
  if (texto.includes('ontem')) {
    const ontem = moment().subtract(1, 'day').startOf('day');
    periodo.tipo = 'dia';
    periodo.inicio = ontem;
    periodo.fim = moment(ontem).endOf('day');
    periodo.desc = 'ontem';
    return periodo;
  }

  // Verificar se há referência a esta semana
  if (texto.includes('esta semana') || texto.includes('nesta semana') || texto.includes('na semana')) {
    periodo.tipo = 'intervalo';
    periodo.inicio = moment().startOf('week');
    periodo.fim = moment().endOf('week');
    periodo.desc = 'esta semana';
    return periodo;
  }

  // Verificar se há referência a este ano
  if (texto.includes('este ano') || texto.includes('neste ano') || texto.includes('no ano')) {
    periodo.tipo = 'intervalo';
    periodo.inicio = moment().startOf('year');
    periodo.fim = moment().endOf('year');
    periodo.desc = 'este ano';
    return periodo;
  }

  // Verificar padrões de data (dia/mês/ano ou dia/mês)
  const dataMatch = texto.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (dataMatch) {
    let dia = parseInt(dataMatch[1]);
    let mes = parseInt(dataMatch[2]) - 1; // Ajuste para o formato do moment (0-11)
    let ano = dataMatch[3] ? parseInt(dataMatch[3]) : anoAtual;

    // Corrigir ano se for abreviado (ex: 23 -> 2023)
    if (ano < 100) ano += 2000;

    const data = moment({ year: ano, month: mes, day: dia });

    if (data.isValid()) {
      periodo.tipo = 'dia';
      periodo.inicio = data.startOf('day');
      periodo.fim = moment(data).endOf('day');
      periodo.desc = data.format('DD/MM/YYYY');
      return periodo;
    }
  }

  // Padrão: mês atual
  periodo.inicio = moment().startOf('month');
  periodo.fim = moment().endOf('month');
  return periodo;
}

// Registrar transação no Google Sheets
async function registrarTransacao(data, categoria, valor, descricao, tipo, infoCompartilhamento = null, metodoPagamento = 'outros', banco = '') {
  const auth = await authorize();
  const dataFormatada = moment(data).format('DD/MM/YYYY');

  // Calcula o valor registrado - se for compartilhado, divide por 2
  const valorRegistrado = infoCompartilhamento && infoCompartilhamento.compartilhado
    ? valor / 2
    : valor;

  // Prepara informação de compartilhamento
  const compartilhamentoInfo = infoCompartilhamento && infoCompartilhamento.compartilhado
    ? `Compartilhado com ${infoCompartilhamento.pessoa}`
    : "";

  // Nova estrutura incluindo método de pagamento e banco
  const values = [
    [dataFormatada, categoria, valorRegistrado, descricao, tipo, compartilhamentoInfo, valor, metodoPagamento, banco]
  ];

  const resource = {
    values,
  };

  try {
    console.log('Tentando registrar transação na planilha:', RANGE);
    const result = await sheets.spreadsheets.values.append({
      auth,
      spreadsheetId: SPREADSHEET_ID,
      range: RANGE,
      valueInputOption: 'USER_ENTERED',
      resource,
    });

    console.log('Transação registrada com sucesso!');
    return result.data;
  } catch (err) {
    console.error(`Erro ao registrar ${tipo.toLowerCase()}:`, err);
    throw err;
  }
}

// Obter todas as transações da planilha
async function obterTransacoes() {
  const auth = await authorize();

  try {
    const response = await sheets.spreadsheets.values.get({
      auth,
      spreadsheetId: SPREADSHEET_ID,
      range: RANGE,
    });

    const rows = response.data.values || [];
    const transacoes = [];

    // Pular primeira linha (cabeçalho)
    for (let i = 1; i < rows.length; i++) {
      if (rows[i] && rows[i].length >= 3) {
        const dataCell = rows[i][0];
        const categoriaCell = rows[i][1];
        const valorCell = rows[i][2];
        const descricaoCell = rows[i][3] || '';
        const tipoCell = rows[i][4] || 'Despesa'; // Default para compatibilidade
        const compartilhamentoCell = rows[i][5] || '';
        const valorOriginalCell = rows[i][6] || valorCell;
        const metodoPagamentoCell = rows[i][7] || 'outros';
        const bancoCell = rows[i][8] || '';

        // Converter data do formato DD/MM/YYYY para objeto Date
        const [dia, mes, ano] = dataCell.split('/').map(num => parseInt(num));
        const data = moment({ year: ano, month: mes - 1, day: dia }); // Ajuste mês (0-11)

        // Converter valor para número
        const valor = parseFloat(valorCell);
        const valorOriginal = parseFloat(valorOriginalCell);

        if (data.isValid() && !isNaN(valor)) {
          transacoes.push({
            data: data,
            categoria: categoriaCell.toLowerCase(),
            valor: valor,
            valorOriginal: valorOriginal,
            descricao: descricaoCell,
            tipo: tipoCell,
            compartilhamento: compartilhamentoCell,
            metodoPagamento: metodoPagamentoCell,
            banco: bancoCell
          });
        }
      }
    }

    return transacoes;
  } catch (err) {
    console.error('Erro ao obter transações:', err);
    throw err;
  }
}

// Filtrar transações por período, tipo e categoria
function filtrarTransacoes(transacoes, periodo, tipo = null, categoria = null, apenasCompartilhadas = false, metodoPagamento = null, banco = null) {
  return transacoes.filter(t => {
    const dataMatch = t.data.isBetween(periodo.inicio, periodo.fim, null, '[]');
    const tipoMatch = tipo ? t.tipo === tipo : true;
    const categoriaMatch = categoria ? t.categoria === categoria.toLowerCase() : true;
    const compartilhamentoMatch = apenasCompartilhadas ? t.compartilhamento !== "" : true;
    const metodoPagamentoMatch = metodoPagamento ? t.metodoPagamento === metodoPagamento : true;
    const bancoMatch = banco ? t.banco === banco : true;

    return dataMatch && tipoMatch && categoriaMatch && compartilhamentoMatch && metodoPagamentoMatch && bancoMatch;
  });
}

// Calcular total de transações
function calcularTotal(transacoes) {
  return transacoes.reduce((acc, t) => acc + t.valor, 0).toFixed(2);
}

// Calcular total original (antes da divisão) de transações
function calcularTotalOriginal(transacoes) {
  return transacoes.reduce((acc, t) => acc + (t.valorOriginal || t.valor), 0).toFixed(2);
}

// Analisar consulta para extrair informações relevantes
function analisarConsulta(texto) {
  texto = texto.toLowerCase();
  let consulta = {
    tipo: null,                  // 'Ganho', 'Despesa', null (ambos)
    categoria: null,             // categoria específica ou null (todas)
    periodo: extrairPeriodo(texto),
    apenasCompartilhadas: texto.includes('compartilhad') || texto.includes('dividid') || texto.includes('conjunt'),
    metodoPagamento: null,       // método de pagamento específico ou null (todos)
    banco: null                  // banco específico ou null (todos)
  };

  // Determinar tipo: ganho ou despesa
  if (texto.includes('ganhei') || texto.includes('recebi') || texto.includes('ganho') ||
    texto.includes('receita') || texto.includes('entrada') || texto.match(/\bganha(r|do)\b/)) {
    consulta.tipo = 'Ganho';
  } else if (texto.includes('gastei') || texto.includes('gasto') || texto.includes('despesa') ||
    texto.includes('saída') || texto.includes('paguei') || texto.match(/\bgasta(r|do)\b/)) {
    consulta.tipo = 'Despesa';
  }

  // Se não for nem ganho nem despesa explicitamente, e for sobre saldo, manter tipo como null
  if (!consulta.tipo && !texto.includes('saldo') && !texto.includes('tenho')) {
    // Assumir despesa como padrão para consultas ambíguas
    consulta.tipo = 'Despesa';
  }

  // Extrair método de pagamento
  for (const [metodo, keywords] of Object.entries(metodosPagamento)) {
    for (const keyword of keywords) {
      if (texto.includes(keyword)) {
        consulta.metodoPagamento = metodo;
        break;
      }
    }
    if (consulta.metodoPagamento) break;
  }

  // Extrair banco
  for (const [nomeBanco, keywords] of Object.entries(bancos)) {
    for (const keyword of keywords) {
      if (texto.includes(keyword)) {
        consulta.banco = nomeBanco;
        break;
      }
    }
    if (consulta.banco) break;
  }

  // Extrair categoria
  // Primeiro, verificar padrões comuns de linguagem
  let match;
  if (consulta.tipo === 'Despesa') {
    match = texto.match(/em\s+(\w+)/) || texto.match(/com\s+(\w+)/) || texto.match(/de\s+(\w+)/);
  } else if (consulta.tipo === 'Ganho') {
    match = texto.match(/com\s+(\w+)/) || texto.match(/de\s+(\w+)/);
  }

  if (match && match[1]) {
    consulta.categoria = match[1];

    // Verificar se a categoria extraída é válida
    const todasCategorias = { ...categorias, ...categoriasGanhos };
    const categoriaEncontrada = Object.keys(todasCategorias).find(cat =>
      cat === consulta.categoria || todasCategorias[cat].includes(consulta.categoria)
    );

    if (categoriaEncontrada) {
      consulta.categoria = categoriaEncontrada;
    }
  }

  return consulta;
}

// Processar consulta e retornar resposta formatada
async function processarConsulta(texto) {
  const consulta = analisarConsulta(texto);
  const transacoes = await obterTransacoes();
  const transacoesFiltradas = filtrarTransacoes(
    transacoes,
    consulta.periodo,
    consulta.tipo,
    consulta.categoria,
    consulta.apenasCompartilhadas,
    consulta.metodoPagamento,
    consulta.banco
  );

  if (transacoesFiltradas.length === 0) {
    // Nenhuma transação encontrada
    let mensagem = `Não encontrei nenhuma `;

    if (consulta.tipo) {
      mensagem += consulta.tipo === 'Ganho' ? 'receita' : 'despesa';
    } else {
      mensagem += 'transação';
    }

    if (consulta.categoria) {
      mensagem += ` na categoria "${consulta.categoria}"`;
    }

    if (consulta.metodoPagamento) {
      mensagem += ` usando ${consulta.metodoPagamento}`;
    }

    if (consulta.banco) {
      mensagem += ` do banco/cartão ${consulta.banco}`;
    }

    if (consulta.apenasCompartilhadas) {
      mensagem += ` compartilhada`;
    }

    mensagem += ` em ${consulta.periodo.desc}.`;
    return mensagem;
  }

  const total = calcularTotal(transacoesFiltradas);
  const totalOriginal = calcularTotalOriginal(transacoesFiltradas);

  // Formatar resposta básica
  let resposta = '';

  if (consulta.tipo) {
    if (consulta.tipo === 'Ganho') {
      resposta += `💰 Você recebeu R$ ${total}`;
    } else {
      resposta += `💸 Você gastou R$ ${total}`;

      // Se houver gastos compartilhados, mostrar o valor total antes da divisão
      if (consulta.apenasCompartilhadas || transacoesFiltradas.some(t => t.compartilhamento !== "")) {
        resposta += ` (valor total antes da divisão: R$ ${totalOriginal})`;
      }
    }
  } else {
    // Consulta de saldo
    const ganhos = filtrarTransacoes(
      transacoes,
      consulta.periodo,
      'Ganho',
      null,
      consulta.apenasCompartilhadas,
      consulta.metodoPagamento,
      consulta.banco
    );

    const despesas = filtrarTransacoes(
      transacoes,
      consulta.periodo,
      'Despesa',
      null,
      consulta.apenasCompartilhadas,
      consulta.metodoPagamento,
      consulta.banco
    );

    const totalGanhos = calcularTotal(ganhos);
    const totalDespesas = calcularTotal(despesas);
    const saldo = (parseFloat(totalGanhos) - parseFloat(totalDespesas)).toFixed(2);

    let emoji = '🟡'; // Neutro
    if (parseFloat(saldo) > 0) emoji = '🟢'; // Positivo
    if (parseFloat(saldo) < 0) emoji = '🔴'; // Negativo

    resposta = `${emoji} *Resumo financeiro`;

    if (consulta.metodoPagamento) {
      resposta += ` (${consulta.metodoPagamento})`;
    }

    if (consulta.banco) {
      resposta += ` (${consulta.banco})`;
    }

    resposta += ` de ${consulta.periodo.desc}:*\n\n` +
      `• Ganhos: R$ ${totalGanhos}\n` +
      `• Despesas: R$ ${totalDespesas}\n` +
      `• Saldo: R$ ${saldo}`;

    if (consulta.apenasCompartilhadas) {
      resposta = `${emoji} *Resumo de gastos compartilhados`;

      if (consulta.metodoPagamento) {
        resposta += ` (${consulta.metodoPagamento})`;
      }

      if (consulta.banco) {
        resposta += ` (${consulta.banco})`;
      }

      resposta += ` em ${consulta.periodo.desc}:*\n\n` +
        `• Sua parte: R$ ${totalDespesas}\n` +
        `• Valor total: R$ ${calcularTotalOriginal(despesas)}`;
    }

    return resposta;
  }

  if (consulta.categoria) {
    resposta += ` na categoria "${consulta.categoria}"`;
  }

  if (consulta.metodoPagamento) {
    resposta += ` usando ${consulta.metodoPagamento}`;
  }

  if (consulta.banco) {
    resposta += ` no banco/cartão ${consulta.banco}`;
  }

  if (consulta.apenasCompartilhadas) {
    resposta += ` (gastos compartilhados)`;
  }

  resposta += ` em ${consulta.periodo.desc}.`;

  // Adicionar detalhes adicionais
  if (transacoesFiltradas.length > 1) {
    resposta += `\n\nForam ${transacoesFiltradas.length} transações no total.`;

    // Adicionar resumo por categorias se não filtrou por categoria
    if (!consulta.categoria && transacoesFiltradas.length >= 3) {
      resposta += '\n\n*Resumo por categorias:*';

      // Agrupar por categoria
      const categorias = {};
      transacoesFiltradas.forEach(t => {
        if (!categorias[t.categoria]) categorias[t.categoria] = 0;
        categorias[t.categoria] += t.valor;
      });

      // Ordenar por valor (maior para menor)
      const categoriasOrdenadas = Object.entries(categorias)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5); // Top 5 categorias

      categoriasOrdenadas.forEach(([cat, val]) => {
        resposta += `\n• ${cat}: R$ ${val.toFixed(2)}`;
      });
    }

    // Adicionar resumo por método de pagamento se não filtrou por método
    if (!consulta.metodoPagamento && transacoesFiltradas.length >= 3) {
      const metodos = {};
      transacoesFiltradas.forEach(t => {
        if (t.metodoPagamento) {
          if (!metodos[t.metodoPagamento]) metodos[t.metodoPagamento] = 0;
          metodos[t.metodoPagamento] += t.valor;
        }
      });

      if (Object.keys(metodos).length > 1) {
        resposta += '\n\n*Por método de pagamento:*';

        const metodosOrdenados = Object.entries(metodos)
          .sort((a, b) => b[1] - a[1]);

        metodosOrdenados.forEach(([metodo, val]) => {
          resposta += `\n• ${metodo}: R$ ${val.toFixed(2)}`;
        });
      }
    }

    // Adicionar resumo por banco se não filtrou por banco
    if (!consulta.banco && transacoesFiltradas.length >= 3) {
      const bancos = {};
      transacoesFiltradas.forEach(t => {
        if (t.banco && t.banco !== '') {
          if (!bancos[t.banco]) bancos[t.banco] = 0;
          bancos[t.banco] += t.valor;
        }
      });

      if (Object.keys(bancos).length > 0) {
        resposta += '\n\n*Por banco/cartão:*';

        const bancosOrdenados = Object.entries(bancos)
          .sort((a, b) => b[1] - a[1]);

        bancosOrdenados.forEach(([banco, val]) => {
          resposta += `\n• ${banco}: R$ ${val.toFixed(2)}`;
        });
      }
    }

    // Adicionar resumo de gastos compartilhados se relevante
    const transacoesCompartilhadas = transacoesFiltradas.filter(t => t.compartilhamento !== "");
    if (transacoesCompartilhadas.length > 0 && !consulta.apenasCompartilhadas) {
      resposta += '\n\n*Gastos compartilhados:*';
      resposta += `\n• Sua parte: R$ ${calcularTotal(transacoesCompartilhadas)}`;
      resposta += `\n• Valor total: R$ ${calcularTotalOriginal(transacoesCompartilhadas)}`;
    }
  }

  return resposta;
}

// Processar mensagens de gastos
bot.hears(/gastei|gasto|comprei|paguei|despesa/i, async (ctx) => {
  const texto = ctx.message.text;

  // Verificar se é uma consulta ou um registro
  if (texto.match(/^quanto|^qual|^como|^total/i)) {
    // É uma consulta
    try {
      const resposta = await processarConsulta(texto);
      ctx.reply(resposta, { parse_mode: 'Markdown' });
    } catch (error) {
      ctx.reply('❌ Não consegui processar sua consulta. Por favor, tente novamente.');
      console.error('Erro ao processar consulta:', error);
    }
    return;
  }

  // É um registro de despesa
  const valor = extrairValor(texto);

  // Verificar se é um gasto compartilhado
  const infoCompartilhamento = verificarCompartilhamento(texto);

  // Usar ML para classificar a categoria
  const classificacaoML = classificarCategoriaML(texto, 'Despesa');
  const categoria = classificacaoML.categoria;
  const confianca = classificacaoML.confianca;

  // Identificar método de pagamento e banco
  const metodoPagamento = identificarMetodoPagamento(texto);
  const banco = identificarBanco(texto);

  const data = new Date();

  if (valor > 0) {
    try {
      await registrarTransacao(
        data,
        categoria,
        valor,
        texto,
        'Despesa',
        infoCompartilhamento,
        metodoPagamento,
        banco
      );

      let mensagem = `✅ Despesa de R$ ${valor.toFixed(2)} registrada\n\n` +
        `🏷️ Categoria: ${categoria}`;

      // Adicionar método de pagamento, se identificado
      if (metodoPagamento !== 'outros') {
        mensagem += `\n💳 Pagamento: ${metodoPagamento}`;
      }

      // Adicionar banco, se identificado
      if (banco !== '') {
        mensagem += `\n🏦 Banco/Cartão: ${banco}`;
      }

      // Adicionar informação sobre compartilhamento, se aplicável
      if (infoCompartilhamento.compartilhado) {
        const valorDividido = (valor / 2).toFixed(2);
        mensagem += `\n👥 Compartilhado com: ${infoCompartilhamento.pessoa}` +
          `\n💰 Valor total: R$ ${valor.toFixed(2)}` +
          `\n💸 Sua parte: R$ ${valorDividido}`;
      }

      // Se a confiança na classificação for baixa, indicar isso na resposta
      if (confianca < 0.3 && !infoCompartilhamento.compartilhado) {
        mensagem += `\n\n(Categorizado automaticamente com base no texto. Use "despesa de mercado" para ser mais específico)`;
      }

      ctx.reply(mensagem);
    } catch (error) {
      ctx.reply('❌ Erro ao registrar despesa. Tente novamente com outro formato ou verifique a configuração da planilha.');
      console.error('Erro detalhado:', error);
    }
  } else {
    ctx.reply('❌ Não consegui identificar o valor da despesa. Por favor, tente novamente.');
  }
});

// Processar mensagens de ganhos
bot.hears(/recebi|ganhei|entrou|depositou|salário|salario|rendimento|recebimento/i, async (ctx) => {
  const texto = ctx.message.text;

  // Verificar se é uma consulta ou um registro
  if (texto.match(/^quanto|^qual|^como|^total/i)) {
    // É uma consulta
    try {
      const resposta = await processarConsulta(texto);
      ctx.reply(resposta, { parse_mode: 'Markdown' });
    } catch (error) {
      ctx.reply('❌ Não consegui processar sua consulta. Por favor, tente novamente.');
      console.error('Erro:', error);
    }
    return;
  }

  // É um registro de ganho
  const valor = extrairValor(texto);

  // Usar ML para classificar a categoria
  const classificacaoML = classificarCategoriaML(texto, 'Ganho');
  const categoria = classificacaoML.categoria;
  const confianca = classificacaoML.confianca;

  // Identificar método de pagamento e banco
  const metodoPagamento = identificarMetodoPagamento(texto);
  const banco = identificarBanco(texto);

  const data = new Date();

  if (valor > 0) {
    try {
      await registrarTransacao(
        data,
        categoria,
        valor,
        texto,
        'Ganho',
        null,
        metodoPagamento,
        banco
      );

      let mensagem = `✅ Ganho de R$ ${valor.toFixed(2)} registrado\n\n` +
        `🏷️ Categoria: ${categoria}`;

      // Adicionar método de pagamento, se identificado
      if (metodoPagamento !== 'outros') {
        mensagem += `\n💳 Método: ${metodoPagamento}`;
      }

      // Adicionar banco, se identificado
      if (banco !== '') {
        mensagem += `\n🏦 Banco: ${banco}`;
      }

      // Se a confiança na classificação for baixa, indicar isso na resposta
      if (confianca < 0.3) {
        mensagem += `\n\n(Categorizado automaticamente com base no texto. Use "recebi de salário" para ser mais específico)`;
      }

      ctx.reply(mensagem);
    } catch (error) {
      ctx.reply('❌ Erro ao registrar ganho. Tente novamente com outro formato ou verifique a configuração da planilha.');
      console.error('Erro detalhado:', error);
    }
  } else {
    ctx.reply('❌ Não consegui identificar o valor do ganho. Por favor, tente novamente.');
  }
});

// Processar consultas sobre gastos compartilhados
bot.hears(/gastos compartilhados|divididos|conjuntos|com minha|com meu/i, async (ctx) => {
  const texto = ctx.message.text;

  // Se não parece ser uma consulta, ignore
  if (!texto.match(/^quanto|^quais|^como|^qual|^total|^gastos/i)) {
    return;
  }

  try {
    // Adicionar flag para filtrar apenas gastos compartilhados
    const textoModificado = texto + " compartilhados";
    const resposta = await processarConsulta(textoModificado);
    ctx.reply(resposta, { parse_mode: 'Markdown' });
  } catch (error) {
    ctx.reply('❌ Não consegui processar sua consulta sobre gastos compartilhados. Por favor, tente novamente.');
    console.error('Erro:', error);
  }
});

// Processar consultas gerais
bot.hears(/quanto|qual o|saldo|total|resumo/i, async (ctx) => {
  const texto = ctx.message.text;

  try {
    const resposta = await processarConsulta(texto);
    ctx.reply(resposta, { parse_mode: 'Markdown' });
  } catch (error) {
    ctx.reply('❌ Não consegui processar sua consulta. Por favor, tente novamente.');
    console.error('Erro:', error);
  }
});

// Adicionar comandos para consultas específicas por método de pagamento
bot.hears(/cartão|cartao|crédito|credito|débito|debito|pix|dinheiro|boleto|transferência|transferencia/i, async (ctx) => {
  const texto = ctx.message.text;

  // Se não parece ser uma consulta, ignore
  if (!texto.match(/^quanto|^quais|^como|^qual|^total|^gastos/i)) {
    return;
  }

  try {
    const resposta = await processarConsulta(texto);
    ctx.reply(resposta, { parse_mode: 'Markdown' });
  } catch (error) {
    ctx.reply('❌ Não consegui processar sua consulta. Por favor, tente novamente.');
    console.error('Erro:', error);
  }
});

// Adicionar comandos para consultas específicas por banco
bot.hears(/nubank|itaú|itau|bradesco|santander|banco do brasil|bb|caixa|inter|c6/i, async (ctx) => {
  const texto = ctx.message.text;

  // Se não parece ser uma consulta, ignore
  if (!texto.match(/^quanto|^quais|^como|^qual|^total|^gastos/i)) {
    return;
  }

  try {
    const resposta = await processarConsulta(texto);
    ctx.reply(resposta, { parse_mode: 'Markdown' });
  } catch (error) {
    ctx.reply('❌ Não consegui processar sua consulta. Por favor, tente novamente.');
    console.error('Erro:', error);
  }
});

// Comandos do Bot
bot.start((ctx) => {
  ctx.reply('Bem-vindo ao Bot de Controle Financeiro! 💰\n\n' +
    'Como usar:\n' +
    '- Para registrar uma despesa, envie uma mensagem como:\n' +
    '  "hoje gastei 300 reais com compras de mercado pelo pix"\n\n' +
    '- Para registrar um gasto compartilhado:\n' +
    '  "gastei 100 reais no restaurante com minha esposa no cartão de crédito do itaú"\n\n' +
    '- Para registrar um ganho, envie uma mensagem como:\n' +
    '  "recebi 2000 reais de salário hoje no banco inter"\n\n' +
    '- Para consultas flexíveis:\n' +
    '  "quanto gastei em mercado em dezembro"\n' +
    '  "quanto gastei no pix este mês"\n' +
    '  "quanto usei o cartão de crédito do nubank"\n' +
    '  "qual o saldo de março/2024"\n' +
    '  "quanto gastei ontem"\n' +
    '  "quanto gastei com transporte esta semana"\n' +
    '  "quanto gastei no dia 15/03"\n' +
    '  "gastos compartilhados do mês"\n' +
    '  "quanto gastei com minha esposa este mês"');
});

bot.help((ctx) => {
  ctx.reply('Comandos disponíveis:\n\n' +
    '- Registrar despesa: "gastei X com Y"\n' +
    '- Especificar método: "gastei X com Y no pix"\n' +
    '- Especificar banco/cartão: "gastei X com Y no cartão nubank"\n' +
    '- Registrar gasto compartilhado: "gastei X com minha esposa"\n' +
    '- Registrar ganho: "recebi X de Y"\n' +
    '- Consultas flexíveis:\n' +
    '  • Por período: "hoje", "ontem", "esta semana", "março", "em 2023"\n' +
    '  • Por categoria: "em mercado", "com transporte", "de salário"\n' +
    '  • Por método: "no pix", "cartão de crédito", "em dinheiro"\n' +
    '  • Por banco: "nubank", "itaú", "banco do brasil"\n' +
    '  • Por tipo: "gastei", "ganhei", "saldo"\n' +
    '  • Gastos compartilhados: "gastos compartilhados", "com minha esposa"\n' +
    '  • Por data específica: "no dia 20/03", "em 15/12/2023"\n' +
    '  • Combinados: "quanto gastei com mercado no pix em dezembro"');
});

// Configurar ambiente web para webhook (em produção) ou polling (em desenvolvimento)
if (process.env.NODE_ENV === 'production') {
  // Modo de produção (webhook)
  const PORT = process.env.PORT || 3000;
  const app = express();

  app.use(bodyParser.json());

  app.get('/', (req, res) => {
    res.send('Bot está funcionando!');
  });

  app.post(`/bot${process.env.TELEGRAM_BOT_TOKEN}`, (req, res) => {
    bot.handleUpdate(req.body, res);
  });

  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });

  // Configure webhook após o servidor iniciar
  if (process.env.URL) {
    bot.telegram.setWebhook(`${process.env.URL}/bot${process.env.TELEGRAM_BOT_TOKEN}`);
    console.log('Webhook configurado!');
  } else {
    console.log('URL não definida, webhook não configurado');
  }
} else {
  // Modo de desenvolvimento (polling)
  bot.launch()
    .then(() => {
      console.log('Bot iniciado localmente com sucesso!');
    })
    .catch((err) => {
      console.error('Erro ao iniciar bot:', err);
    });
}

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
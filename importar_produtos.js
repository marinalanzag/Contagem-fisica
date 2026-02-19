// =============================================================================
// SCRIPT DE IMPORTAÇÃO DE PRODUTOS - CSV → SUPABASE
// =============================================================================
// Uso: node importar_produtos.js
// Lê o arquivo "src/Cadastro de produtos.csv" e insere na tabela "produtos"
// =============================================================================

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Configuração Supabase (mesmas credenciais do .env)
const SUPABASE_URL = 'https://bghgnaecmykalbjjxndu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJnaGduYWVjbXlrYWxiamp4bmR1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMDc0ODksImV4cCI6MjA4NjU4MzQ4OX0.EfSi2eXQsE4h3O5lif9ZWDOUuzG4r9W0_gxJhnO589U';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Tamanho do lote para inserção
const BATCH_SIZE = 500;

function parseCSVLine(line) {
  // Trata campos com aspas (ex: "FECHO CHATO PORTA CADEADO 3"" REF:839")
  const fields = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++; // pula o próximo "
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ';' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

async function garantirColunaCodigoBarras() {
  console.log('🔧 Verificando coluna codigo_barras...');
  const { error } = await supabase.rpc('exec_sql', {
    sql: `ALTER TABLE produtos ADD COLUMN IF NOT EXISTS codigo_barras VARCHAR(50);
          CREATE INDEX IF NOT EXISTS idx_produtos_barras ON produtos(codigo_barras);`
  });

  if (error) {
    console.log('⚠️  Não foi possível criar coluna via RPC (pode já existir). Continuando...');
  } else {
    console.log('✅ Coluna codigo_barras garantida.');
  }
}

async function limparProdutosExistentes() {
  console.log('🗑️  Removendo produtos existentes...');

  // Primeiro verificar se há itens contados vinculados
  const { count } = await supabase
    .from('itens_contados')
    .select('*', { count: 'exact', head: true });

  if (count && count > 0) {
    console.log(`⚠️  Existem ${count} itens contados vinculados a produtos.`);
    console.log('   Removendo itens contados e histórico primeiro...');
    await supabase.from('historico_contagem').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('itens_contados').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  }

  const { error } = await supabase
    .from('produtos')
    .delete()
    .neq('id', 0); // deleta todos

  if (error) {
    console.error('❌ Erro ao limpar produtos:', error.message);
    throw error;
  }
  console.log('✅ Produtos existentes removidos.');
}

async function importarProdutos() {
  console.log('='.repeat(60));
  console.log('  IMPORTAÇÃO DE PRODUTOS - CSV → SUPABASE');
  console.log('='.repeat(60));
  console.log('');

  // 1. Ler CSV
  const csvPath = path.join(__dirname, 'src', 'Cadastro de produtos.csv');

  if (!fs.existsSync(csvPath)) {
    console.error(`❌ Arquivo não encontrado: ${csvPath}`);
    process.exit(1);
  }

  const conteudo = fs.readFileSync(csvPath, 'utf-8');
  const linhas = conteudo.split('\n').filter(l => l.trim() !== '');

  console.log(`📄 Arquivo: ${csvPath}`);
  console.log(`📊 Total de linhas (com cabeçalho): ${linhas.length}`);
  console.log('');

  // 2. Parsear cabeçalho
  const cabecalho = parseCSVLine(linhas[0]);
  console.log(`📋 Colunas: ${cabecalho.join(' | ')}`);
  console.log('');

  // 3. Parsear dados
  const produtos = [];
  const erros = [];

  for (let i = 1; i < linhas.length; i++) {
    const campos = parseCSVLine(linhas[i]);

    if (campos.length < 3) {
      erros.push({ linha: i + 1, motivo: 'Menos de 3 campos', conteudo: linhas[i] });
      continue;
    }

    const ean = campos[0] || null;
    const descricao = campos[1];
    const codigoInterno = campos[2];

    if (!descricao || !codigoInterno) {
      erros.push({ linha: i + 1, motivo: 'Descrição ou código vazio', conteudo: linhas[i] });
      continue;
    }

    produtos.push({
      codigo: codigoInterno,
      descricao: descricao,
      codigo_barras: ean,
      unidade_padrao: 'UN',
      ativo: true
    });
  }

  console.log(`✅ Produtos válidos: ${produtos.length}`);
  if (erros.length > 0) {
    console.log(`⚠️  Linhas com erro: ${erros.length}`);
    erros.slice(0, 5).forEach(e => {
      console.log(`   Linha ${e.linha}: ${e.motivo}`);
    });
    if (erros.length > 5) console.log(`   ... e mais ${erros.length - 5} erros`);
  }
  console.log('');

  // 4. Garantir coluna codigo_barras
  await garantirColunaCodigoBarras();

  // 5. Limpar produtos existentes
  await limparProdutosExistentes();

  // 6. Inserir em lotes
  console.log('');
  console.log(`📦 Inserindo ${produtos.length} produtos em lotes de ${BATCH_SIZE}...`);

  let inseridos = 0;
  let errosInsercao = 0;

  for (let i = 0; i < produtos.length; i += BATCH_SIZE) {
    const lote = produtos.slice(i, i + BATCH_SIZE);
    const loteNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalLotes = Math.ceil(produtos.length / BATCH_SIZE);

    const { error } = await supabase
      .from('produtos')
      .insert(lote);

    if (error) {
      console.error(`❌ Erro no lote ${loteNum}: ${error.message}`);
      errosInsercao += lote.length;

      // Tentar inserir um por um para identificar o problema
      for (const produto of lote) {
        const { error: errIndividual } = await supabase
          .from('produtos')
          .insert(produto);

        if (errIndividual) {
          console.error(`   ❌ Produto ${produto.codigo}: ${errIndividual.message}`);
        } else {
          inseridos++;
        }
      }
    } else {
      inseridos += lote.length;
    }

    const progresso = Math.round((Math.min(i + BATCH_SIZE, produtos.length) / produtos.length) * 100);
    process.stdout.write(`\r   Progresso: ${progresso}% (lote ${loteNum}/${totalLotes}) - ${inseridos} inseridos`);
  }

  console.log('');
  console.log('');
  console.log('='.repeat(60));
  console.log(`  ✅ IMPORTAÇÃO CONCLUÍDA`);
  console.log(`  📊 Produtos inseridos: ${inseridos}`);
  if (errosInsercao > 0) {
    console.log(`  ⚠️  Erros de inserção: ${errosInsercao}`);
  }
  console.log('='.repeat(60));

  // 7. Verificar contagem final no banco
  const { count } = await supabase
    .from('produtos')
    .select('*', { count: 'exact', head: true });

  console.log(`\n📊 Total de produtos no banco: ${count}`);
}

// Executar
importarProdutos().catch(err => {
  console.error('❌ Erro fatal:', err);
  process.exit(1);
});

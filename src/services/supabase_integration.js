// =============================================================================
// INTEGRAÇÃO SUPABASE - SISTEMA DE CONTAGEM
// =============================================================================

import { createClient } from '@supabase/supabase-js';

// 1. SETUP CLIENTE SUPABASE
// =============================================================================

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY;

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 2. FUNÇÕES DE AUTENTICAÇÃO
// =============================================================================

/**
 * Cria um novo usuário e inicia uma sessão de contagem
 */
export const iniciarSessao = async (nomeUsuario) => {
  try {
    // 1. Inserir/atualizar usuário
    const { data: usuario, error: erroUsuario } = await supabase
      .from('usuarios')
      .upsert(
        { nome: nomeUsuario },
        { onConflict: 'nome' }
      )
      .select('id')
      .single();

    if (erroUsuario) throw erroUsuario;

    // 2. Criar nova sessão
    const { data: sessao, error: erroSessao } = await supabase
      .from('sessoes_contagem')
      .insert({
        usuario_id: usuario.id,
        status: 'ativa'
      })
      .select('id')
      .single();

    if (erroSessao) throw erroSessao;

    return {
      sucesso: true,
      usuario_id: usuario.id,
      sessao_id: sessao.id
    };
  } catch (erro) {
    console.error('Erro ao iniciar sessão:', erro);
    return {
      sucesso: false,
      erro: erro.message
    };
  }
};

// 3. FUNÇÕES DE CONTAGEM
// =============================================================================

/**
 * Adiciona quantidade com sincronização em tempo real
 * Utiliza a função RPC do banco para evitar race conditions
 */
export const adicionarQuantidade = async (
  sessionId,
  productId,
  quantity,
  userId
) => {
  try {
    const { data, error } = await supabase.rpc(
      'adicionar_quantidade',
      {
        p_sessao_id: sessionId,
        p_produto_id: productId,
        p_quantidade: parseFloat(quantity),
        p_usuario_id: userId
      }
    );

    if (error) throw error;

    return {
      sucesso: data.sucesso,
      dados: data
    };
  } catch (erro) {
    console.error('Erro ao adicionar quantidade:', erro);
    return {
      sucesso: false,
      erro: erro.message
    };
  }
};

/**
 * Corrige a quantidade (substitui em vez de somar)
 */
export const corrigirQuantidade = async (
  itemId,
  novaQuantidade,
  userId
) => {
  try {
    const { data, error } = await supabase.rpc(
      'corrigir_quantidade',
      {
        p_item_id: itemId,
        p_nova_quantidade: parseFloat(novaQuantidade),
        p_usuario_id: userId
      }
    );

    if (error) throw error;

    return {
      sucesso: data.sucesso,
      dados: data
    };
  } catch (erro) {
    console.error('Erro ao corrigir quantidade:', erro);
    return {
      sucesso: false,
      erro: erro.message
    };
  }
};

/**
 * Remove um item da contagem
 */
export const removerItemContado = async (itemId, userId) => {
  try {
    const { data, error } = await supabase.rpc(
      'remover_item_contado',
      {
        p_item_id: itemId,
        p_usuario_id: userId
      }
    );

    if (error) throw error;

    return {
      sucesso: data.sucesso
    };
  } catch (erro) {
    console.error('Erro ao remover item:', erro);
    return {
      sucesso: false,
      erro: erro.message
    };
  }
};

// 4. FUNÇÕES DE BUSCA
// =============================================================================

/**
 * Busca produtos por código ou descrição
 */
export const buscarProdutos = async (termoBusca, limite = 20) => {
  try {
    const termo = `%${termoBusca.toUpperCase()}%`;

    const { data, error } = await supabase
      .from('produtos')
      .select('id, codigo, descricao, categoria, unidade_padrao')
      .eq('ativo', true)
      .or(`codigo.ilike.${termo},descricao.ilike.${termo}`)
      .limit(limite);

    if (error) throw error;

    return {
      sucesso: true,
      dados: data
    };
  } catch (erro) {
    console.error('Erro ao buscar produtos:', erro);
    return {
      sucesso: false,
      dados: []
    };
  }
};

/**
 * Obtém todos os itens contados de uma sessão em tempo real
 */
export const obterItensContados = async (sessionId) => {
  try {
    const { data, error } = await supabase
      .from('itens_contados')
      .select(`
        id,
        produto_id,
        quantidade_total,
        numero_registros,
        ultima_atualizacao,
        produtos:produto_id (
          id,
          codigo,
          descricao,
          categoria,
          unidade_padrao
        ),
        usuarios:atualizado_por (
          nome
        )
      `)
      .eq('sessao_id', sessionId)
      .order('ultima_atualizacao', { ascending: false });

    if (error) throw error;

    // Transformar em formato amigável
    const itens = data.map(item => ({
      id: item.id,
      produto_id: item.produto_id,
      codigo: item.produtos.codigo,
      descricao: item.produtos.descricao,
      categoria: item.produtos.categoria,
      unidade: item.produtos.unidade_padrao,
      quantidade: item.quantidade_total,
      numRegistros: item.numero_registros,
      ultimaAtualizacao: item.ultima_atualizacao,
      atualizadoPor: item.usuarios.nome
    }));

    return {
      sucesso: true,
      dados: itens
    };
  } catch (erro) {
    console.error('Erro ao obter itens:', erro);
    return {
      sucesso: false,
      dados: []
    };
  }
};

// Buscar todos os itens do usuário (todas as sessões)
export const obterTodosItensUsuario = async (userId) => {
  try {
    // 1. Buscar todas as sessões do usuário
    const { data: sessoes, error: erroSessoes } = await supabase
      .from('sessoes_contagem')
      .select('id')
      .eq('usuario_id', userId);

    if (erroSessoes) throw erroSessoes;
    if (!sessoes || sessoes.length === 0) return { sucesso: true, dados: [] };

    const sessaoIds = sessoes.map(s => s.id);

    // 2. Buscar todos os itens de todas as sessões
    const { data, error } = await supabase
      .from('itens_contados')
      .select(`
        id,
        produto_id,
        quantidade_total,
        numero_registros,
        ultima_atualizacao,
        produtos:produto_id (
          id,
          codigo,
          descricao,
          categoria,
          unidade_padrao
        ),
        usuarios:atualizado_por (
          nome
        )
      `)
      .in('sessao_id', sessaoIds)
      .order('ultima_atualizacao', { ascending: false });

    if (error) throw error;

    const itens = data.map(item => ({
      id: item.id,
      produto_id: item.produto_id,
      codigo: item.produtos.codigo,
      descricao: item.produtos.descricao,
      categoria: item.produtos.categoria,
      unidade: item.produtos.unidade_padrao,
      quantidade: item.quantidade_total,
      numRegistros: item.numero_registros,
      ultimaAtualizacao: item.ultima_atualizacao,
      atualizadoPor: item.usuarios?.nome
    }));

    return { sucesso: true, dados: itens };
  } catch (erro) {
    console.error('Erro ao obter itens do usuário:', erro);
    return { sucesso: false, dados: [] };
  }
};

// 5. FUNÇÕES DE RELATÓRIO
// =============================================================================

/**
 * Gera relatório completo formatado para exportação
 */
export const gerarRelatorio = async (sessionId) => {
  try {
    const { data, error } = await supabase
      .from('itens_contados')
      .select(`
        quantidade_total,
        numero_registros,
        ultima_atualizacao,
        produtos:produto_id (
          codigo,
          descricao,
          categoria,
          unidade_padrao,
          codigo_barras
        ),
        usuarios:atualizado_por (
          nome
        )
      `)
      .eq('sessao_id', sessionId)
      .order('produtos.codigo', { referencedTable: 'produtos' });

    if (error) throw error;

    // Transformar em formato de relatório
    const relatorio = data.map(item => ({
      codigo: item.produtos.codigo,
      descricao: item.produtos.descricao,
      categoria: item.produtos.categoria,
      unidade: item.produtos.unidade_padrao,
      codigoBarras: item.produtos.codigo_barras || '',
      quantidade: item.quantidade_total,
      numRegistros: item.numero_registros,
      ultimaAtualizacao: item.ultima_atualizacao,
      atualizadoPor: item.usuarios.nome
    }));

    // Calcular totais
    const totais = {
      totalItens: relatorio.length,
      totalUnidades: relatorio.reduce((sum, r) => sum + r.quantidade, 0),
      totalRegistros: relatorio.reduce((sum, r) => sum + r.numRegistros, 0)
    };

    return {
      sucesso: true,
      dados: relatorio,
      totais
    };
  } catch (erro) {
    console.error('Erro ao gerar relatório:', erro);
    return {
      sucesso: false,
      dados: [],
      totais: {}
    };
  }
};

/**
 * Obtém histórico de operações de uma sessão (auditoria)
 */
export const obterHistorico = async (sessionId) => {
  try {
    const { data, error } = await supabase
      .from('historico_contagem')
      .select(`
        id,
        timestamp,
        operacao,
        quantidade_adicionada,
        usuarios:usuario_id (
          nome
        ),
        itens_contados:item_contado_id (
          produtos:produto_id (
            codigo,
            descricao
          )
        )
      `)
      .eq('itens_contados.sessao_id', sessionId)
      .order('timestamp', { ascending: false })
      .limit(100);

    if (error) throw error;

    return {
      sucesso: true,
      dados: data
    };
  } catch (erro) {
    console.error('Erro ao obter histórico:', erro);
    return {
      sucesso: false,
      dados: []
    };
  }
};

// 6. FUNÇÕES DE SINCRONIZAÇÃO EM TEMPO REAL
// =============================================================================

/**
 * Hook para sincronizar dados em tempo real
 * Use dentro de um useEffect
 */
export const subscriberAtualizacoes = (sessionId, callback) => {
  const subscription = supabase
    .from(`itens_contados:sessao_id=eq.${sessionId}`)
    .on('*', (payload) => {
      console.log('Atualização em tempo real:', payload);
      callback(payload);
    })
    .subscribe();

  // Retornar função para desinscrever
  return () => supabase.removeSubscription(subscription);
};

// 7. FUNÇÕES DE EXPORTAÇÃO
// =============================================================================

/**
 * Exporta relatório como CSV
 */
export const exportarCSV = (relatorio, nomeUsuario, dataContagem) => {
  const headers = [
    'CÓDIGO',
    'DESCRIÇÃO',
    'QUANTIDADE',
    'UNIDADE',
    'CATEGORIA',
    'NÚM. REGISTROS'
  ];

  const rows = relatorio.map(r => [
    r.codigo,
    `"${r.descricao}"`,
    r.quantidade.toString().replace('.', ','),
    r.unidade,
    r.categoria,
    r.numRegistros
  ]);

  const csvContent = [
    ['RELATÓRIO DE CONTAGEM DE ESTOQUE'],
    [],
    ['Usuário:', nomeUsuario],
    ['Data:', dataContagem.toLocaleDateString('pt-BR')],
    ['Hora:', dataContagem.toLocaleTimeString('pt-BR')],
    ['Total de Itens:', relatorio.length],
    ['Total de Unidades:', relatorio.reduce((s, r) => s + r.quantidade, 0).toFixed(2)],
    [],
    headers,
    ...rows
  ]
    .map(row => row.join(';'))
    .join('\n');

  // Download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `contagem_${nomeUsuario}_${dataContagem.toISOString().split('T')[0]}.csv`;
  link.click();
};

/**
 * Exporta relatório como JSON
 */
export const exportarJSON = (relatorio, nomeUsuario, dataContagem, totais) => {
  const exportData = {
    meta: {
      usuario: nomeUsuario,
      data: dataContagem.toLocaleDateString('pt-BR'),
      hora: dataContagem.toLocaleTimeString('pt-BR'),
      dataISO: dataContagem.toISOString(),
      totalItens: totais.totalItens,
      totalUnidades: totais.totalUnidades,
      totalRegistros: totais.totalRegistros
    },
    dados: relatorio
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: 'application/json'
  });

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `contagem_${nomeUsuario}_${dataContagem.toISOString().split('T')[0]}.json`;
  link.click();
};

// 8. FUNÇÕES AVANÇADAS
// =============================================================================

/**
 * Finaliza uma sessão de contagem
 */
export const finalizarSessao = async (sessionId) => {
  try {
    const { data, error } = await supabase
      .from('sessoes_contagem')
      .update({
        status: 'concluida',
        data_fim: new Date().toISOString()
      })
      .eq('id', sessionId)
      .select();

    if (error) throw error;

    return {
      sucesso: true,
      dados: data[0]
    };
  } catch (erro) {
    console.error('Erro ao finalizar sessão:', erro);
    return {
      sucesso: false,
      erro: erro.message
    };
  }
};

/**
 * Obtém análise de performance de contadores
 */
export const obterAnaliseContadores = async () => {
  try {
    const { data, error } = await supabase
      .from('analise_contadores')
      .select('*');

    if (error) throw error;

    return {
      sucesso: true,
      dados: data
    };
  } catch (erro) {
    console.error('Erro ao obter análise:', erro);
    return {
      sucesso: false,
      dados: []
    };
  }
};

/**
 * Importa produtos de um arquivo CSV/JSON
 */
export const importarProdutos = async (produtos) => {
  try {
    // Validar dados
    const produtosValidos = produtos.map(p => ({
      codigo: p.codigo || `UNKNOWN_${Date.now()}`,
      descricao: p.descricao || '',
      categoria: p.categoria || 'SEM CATEGORIA',
      unidade_padrao: p.unidade_padrao || 'UN'
    }));

    const { data, error } = await supabase
      .from('produtos')
      .upsert(produtosValidos, { onConflict: 'codigo' })
      .select();

    if (error) throw error;

    return {
      sucesso: true,
      totalImportado: data.length
    };
  } catch (erro) {
    console.error('Erro ao importar produtos:', erro);
    return {
      sucesso: false,
      erro: erro.message
    };
  }
};

// =============================================================================
// EXEMPLO DE USO
// =============================================================================

/*
// 1. Iniciar sessão
const { usuario_id, sessao_id } = await iniciarSessao('João Silva');

// 2. Buscar produtos
const { dados: produtos } = await buscarProdutos('ADUBO');

// 3. Adicionar quantidade
await adicionarQuantidade(sessao_id, 1, 5.5, usuario_id);

// 4. Obter itens contados
const { dados: itens } = await obterItensContados(sessao_id);

// 5. Gerar relatório
const { dados: relatorio, totais } = await gerarRelatorio(sessao_id);

// 6. Exportar
exportarCSV(relatorio, 'João Silva', new Date());

// 7. Finalizar
await finalizarSessao(sessao_id);
*/

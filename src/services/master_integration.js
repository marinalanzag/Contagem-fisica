// =============================================================================
// INTEGRAÇÃO SUPABASE MASTER - RELATÓRIOS E GERENCIAMENTO
// =============================================================================

import { supabase } from './supabase_integration';

// 1. FUNÇÕES PARA OBTER SESSÕES
// =============================================================================

/**
 * Obtém todas as sessões com filtros opcionais
 */
export const obterTodasSessoes = async (filtros = {}) => {
  try {
    let query = supabase
      .from('sessoes_contagem')
      .select(`
        id,
        usuario_id,
        data_inicio,
        data_fim,
        status,
        total_itens_contados,
        total_unidades_contadas,
        usuarios:usuario_id (
          id,
          nome,
          email
        )
      `);

    // Aplicar filtros
    if (filtros.status && filtros.status !== 'todas') {
      query = query.eq('status', filtros.status);
    }

    if (filtros.dataInicio) {
      query = query.gte('data_inicio', filtros.dataInicio);
    }

    if (filtros.dataFim) {
      query = query.lte('data_inicio', filtros.dataFim);
    }

    const { data, error } = await query.order('data_inicio', { ascending: false });

    if (error) throw error;

    return {
      sucesso: true,
      dados: data.map(s => ({
        id: s.id,
        usuario: {
          id: s.usuarios.id,
          nome: s.usuarios.nome,
          email: s.usuarios.email
        },
        dataInicio: new Date(s.data_inicio),
        dataFim: s.data_fim ? new Date(s.data_fim) : null,
        status: s.status,
        totalItens: s.total_itens_contados,
        totalUnidades: s.total_unidades_contadas
      }))
    };
  } catch (erro) {
    console.error('Erro ao obter sessões:', erro);
    return {
      sucesso: false,
      dados: [],
      erro: erro.message
    };
  }
};

/**
 * Obtém sessões ativas no momento
 */
export const obterSessoesAtivas = async () => {
  try {
    const { data, error } = await supabase
      .from('sessoes_contagem')
      .select(`
        id,
        usuario_id,
        data_inicio,
        status,
        total_itens_contados,
        total_unidades_contadas,
        usuarios:usuario_id (
          nome
        )
      `)
      .eq('status', 'ativa')
      .order('data_inicio', { ascending: false });

    if (error) throw error;

    return {
      sucesso: true,
      dados: data
    };
  } catch (erro) {
    console.error('Erro ao obter sessões ativas:', erro);
    return {
      sucesso: false,
      dados: []
    };
  }
};

/**
 * Obtém uma sessão específica com todos seus itens
 */
export const obterSessaoDetalhada = async (sessionId) => {
  try {
    const { data, error } = await supabase
      .from('sessoes_contagem')
      .select(`
        id,
        usuario_id,
        data_inicio,
        data_fim,
        status,
        total_itens_contados,
        total_unidades_contadas,
        observacoes,
        usuarios:usuario_id (
          nome,
          email
        ),
        itens_contados (
          id,
          produto_id,
          quantidade_total,
          numero_registros,
          ultima_atualizacao,
          produtos:produto_id (
            codigo,
            descricao,
            categoria,
            unidade_padrao
          )
        )
      `)
      .eq('id', sessionId)
      .single();

    if (error) throw error;

    return {
      sucesso: true,
      dados: {
        ...data,
        itens: data.itens_contados
      }
    };
  } catch (erro) {
    console.error('Erro ao obter sessão detalhada:', erro);
    return {
      sucesso: false,
      erro: erro.message
    };
  }
};

// 2. FUNÇÕES PARA RELATÓRIO CONSOLIDADO
// =============================================================================

/**
 * Gera relatório consolidado de TODAS as sessões de contagem
 * Soma as quantidades de cada produto de todas as sessões
 */
export const gerarRelatorioConsolidado = async (filtros = {}) => {
  try {
    // 1. Obter todas as sessões relevantes
    let querySessoes = supabase
      .from('sessoes_contagem')
      .select('id, usuario_id, usuarios:usuario_id(nome)');

    // Filtros de data
    if (filtros.dataInicio) {
      querySessoes = querySessoes.gte('data_inicio', filtros.dataInicio);
    }
    if (filtros.dataFim) {
      querySessoes = querySessoes.lte('data_inicio', filtros.dataFim);
    }

    const { data: sessoes, error: erroSessoes } = await querySessoes;
    if (erroSessoes) throw erroSessoes;

    const sessoesIds = sessoes.map(s => s.id);

    // 2. Obter todos os itens contados nestas sessões
    const { data: itensContados, error: erroItens } = await supabase
      .from('itens_contados')
      .select(`
        id,
        sessao_id,
        produto_id,
        quantidade_total,
        numero_registros,
        ultima_atualizacao,
        produtos:produto_id (
          codigo,
          descricao,
          categoria,
          unidade_padrao
        ),
        sessoes_contagem:sessao_id (
          usuarios:usuario_id (
            nome
          )
        )
      `)
      .in('sessao_id', sessoesIds);

    if (erroItens) throw erroItens;

    // 3. Consolidar os dados (agrupar por produto)
    const mapProdutos = new Map();

    itensContados.forEach(item => {
      const chave = item.produto_id;
      const usuario = item.sessoes_contagem.usuarios.nome;

      if (mapProdutos.has(chave)) {
        const produtoExistente = mapProdutos.get(chave);
        mapProdutos.set(chave, {
          ...produtoExistente,
          quantidade_total: produtoExistente.quantidade_total + item.quantidade_total,
          numero_registros: produtoExistente.numero_registros + item.numero_registros,
          contadores: [...new Set([...produtoExistente.contadores, usuario])],
          ultima_atualizacao: item.ultima_atualizacao > produtoExistente.ultima_atualizacao
            ? item.ultima_atualizacao
            : produtoExistente.ultima_atualizacao
        });
      } else {
        mapProdutos.set(chave, {
          produto_id: item.produto_id,
          codigo: item.produtos.codigo,
          descricao: item.produtos.descricao,
          categoria: item.produtos.categoria,
          unidade: item.produtos.unidade_padrao,
          quantidade_total: item.quantidade_total,
          numero_registros: item.numero_registros,
          contadores: [usuario],
          ultima_atualizacao: item.ultima_atualizacao
        });
      }
    });

    // 4. Converter para array e ordenar
    const relatorio = Array.from(mapProdutos.values())
      .sort((a, b) => a.codigo.localeCompare(b.codigo));

    // 5. Calcular totais
    const totais = {
      totalItensUnicos: relatorio.length,
      totalUnidades: relatorio.reduce((sum, r) => sum + r.quantidade_total, 0),
      totalRegistros: relatorio.reduce((sum, r) => sum + r.numero_registros, 0),
      totalContadores: new Set(relatorio.flatMap(r => r.contadores)).size,
      totalSessoes: sessoes.length
    };

    return {
      sucesso: true,
      dados: relatorio,
      totais
    };
  } catch (erro) {
    console.error('Erro ao gerar relatório consolidado:', erro);
    return {
      sucesso: false,
      dados: [],
      totais: {},
      erro: erro.message
    };
  }
};

/**
 * Gera relatório consolidado POR CATEGORIA
 */
export const gerarRelatorioConsolidadoPorCategoria = async () => {
  try {
    const { data, error } = await supabase
      .from('itens_contados')
      .select(`
        quantidade_total,
        produtos:produto_id (
          categoria
        )
      `);

    if (error) throw error;

    // Agrupar por categoria
    const porCategoria = new Map();

    data.forEach(item => {
      const categoria = item.produtos.categoria;
      if (!porCategoria.has(categoria)) {
        porCategoria.set(categoria, 0);
      }
      porCategoria.set(categoria, porCategoria.get(categoria) + item.quantidade_total);
    });

    const resultado = Array.from(porCategoria.entries())
      .map(([categoria, total]) => ({
        categoria,
        total,
        percentual: (total / data.reduce((s, i) => s + i.quantidade_total, 0)) * 100
      }))
      .sort((a, b) => b.total - a.total);

    return {
      sucesso: true,
      dados: resultado
    };
  } catch (erro) {
    console.error('Erro ao gerar relatório por categoria:', erro);
    return {
      sucesso: false,
      dados: []
    };
  }
};

/**
 * Gera relatório por contador (performance individual)
 */
export const gerarRelatorioContadores = async () => {
  try {
    const { data, error } = await supabase
      .from('sessoes_contagem')
      .select(`
        id,
        total_itens_contados,
        total_unidades_contadas,
        data_inicio,
        data_fim,
        status,
        usuarios:usuario_id (
          nome
        )
      `);

    if (error) throw error;

    // Agregar por contador
    const mapContadores = new Map();

    data.forEach(sessao => {
      const nome = sessao.usuarios.nome;
      const duracao = sessao.data_fim
        ? (new Date(sessao.data_fim) - new Date(sessao.data_inicio)) / 60000
        : (Date.now() - new Date(sessao.data_inicio)) / 60000;

      if (mapContadores.has(nome)) {
        const contador = mapContadores.get(nome);
        mapContadores.set(nome, {
          ...contador,
          totalSessoes: contador.totalSessoes + 1,
          totalItens: contador.totalItens + sessao.total_itens_contados,
          totalUnidades: contador.totalUnidades + sessao.total_unidades_contadas,
          tempoTotal: contador.tempoTotal + duracao
        });
      } else {
        mapContadores.set(nome, {
          nome,
          totalSessoes: 1,
          totalItens: sessao.total_itens_contados,
          totalUnidades: sessao.total_unidades_contadas,
          tempoTotal: duracao,
          mediaItensParaSessao: sessao.total_itens_contados,
          mediaUnidadesParaSessao: sessao.total_unidades_contadas
        });
      }
    });

    // Calcular médias
    const resultado = Array.from(mapContadores.values())
      .map(c => ({
        ...c,
        mediaItensParaSessao: (c.totalItens / c.totalSessoes).toFixed(1),
        mediaUnidadesParaSessao: (c.totalUnidades / c.totalSessoes).toFixed(1),
        velocidadeItensMinuto: (c.totalItens / c.tempoTotal).toFixed(2),
        velocidadeUnidadesMinuto: (c.totalUnidades / c.tempoTotal).toFixed(2)
      }))
      .sort((a, b) => b.totalUnidades - a.totalUnidades);

    return {
      sucesso: true,
      dados: resultado
    };
  } catch (erro) {
    console.error('Erro ao gerar relatório de contadores:', erro);
    return {
      sucesso: false,
      dados: []
    };
  }
};

// 3. FUNÇÕES DE EXPORTAÇÃO
// =============================================================================

/**
 * Exporta relatório consolidado como CSV
 */
export const exportarConsolidadoCSV = (relatorio, totais) => {
  const headers = ['CÓDIGO', 'DESCRIÇÃO', 'CATEGORIA', 'QUANTIDADE', 'UNIDADE', 'NÚM. REGISTROS', 'CONTADORES'];

  const rows = relatorio.map(item => [
    item.codigo,
    `"${item.descricao}"`,
    item.categoria,
    item.quantidade_total.toString().replace('.', ','),
    item.unidade,
    item.numero_registros,
    `"${item.contadores.join(', ')}"`
  ]);

  const rodape = [
    [],
    ['TOTAL', '', '', totais.totalUnidades.toFixed(2).replace('.', ','), '', totais.totalRegistros, totais.totalContadores]
  ];

  const csvContent = [
    ['RELATÓRIO CONSOLIDADO DE CONTAGEM - ' + new Date().toLocaleDateString('pt-BR')],
    [],
    ['Data/Hora de Geração:', new Date().toLocaleString('pt-BR')],
    ['Total de Itens Únicos:', totais.totalItensUnicos],
    ['Total de Unidades Contadas:', totais.totalUnidades.toFixed(2)],
    ['Total de Registros:', totais.totalRegistros],
    ['Total de Contadores:', totais.totalContadores],
    ['Total de Sessões:', totais.totalSessoes],
    [],
    headers,
    ...rows,
    ...rodape
  ]
    .map(row => row.join(';'))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `relatorio_consolidado_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
};

/**
 * Exporta relatório consolidado como JSON
 */
export const exportarConsolidadoJSON = (relatorio, totais) => {
  const exportData = {
    meta: {
      tipoRelatorio: 'CONSOLIDADO',
      dataGeracao: new Date().toLocaleDateString('pt-BR'),
      horaGeracao: new Date().toLocaleTimeString('pt-BR'),
      dataISO: new Date().toISOString(),
      ...totais
    },
    items: relatorio
  };

  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: 'application/json'
  });

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `relatorio_consolidado_${new Date().toISOString().split('T')[0]}.json`;
  link.click();
};

/**
 * Exporta análise de contadores como CSV
 */
export const exportarAnaliseScontadoresCSV = (analise) => {
  const headers = ['CONTADOR', 'TOTAL SESSÕES', 'TOTAL ITENS', 'TOTAL UNIDADES', 'TEMPO TOTAL (min)', 
                   'MÉDIA ITENS/SESSÃO', 'MÉDIA UNIDADES/SESSÃO', 'ITENS/MIN', 'UNIDADES/MIN'];

  const rows = analise.map(c => [
    c.nome,
    c.totalSessoes,
    c.totalItens,
    c.totalUnidades.toFixed(2).replace('.', ','),
    c.tempoTotal.toFixed(1).replace('.', ','),
    c.mediaItensParaSessao.replace('.', ','),
    c.mediaUnidadesParaSessao.replace('.', ','),
    c.velocidadeItensMinuto.replace('.', ','),
    c.velocidadeUnidadesMinuto.replace('.', ',')
  ]);

  const csvContent = [
    ['ANÁLISE DE PERFORMANCE DOS CONTADORES'],
    [],
    ['Data:', new Date().toLocaleDateString('pt-BR')],
    ['Hora:', new Date().toLocaleTimeString('pt-BR')],
    [],
    headers,
    ...rows
  ]
    .map(row => row.join(';'))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `analise_contadores_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
};

// 4. FUNÇÕES DE ESTATÍSTICAS
// =============================================================================

/**
 * Obtém estatísticas gerais da contagem
 */
export const obterEstatisticasGerais = async () => {
  try {
    // Total de sessões
    const { count: totalSessoes, error: erroSessoes } = await supabase
      .from('sessoes_contagem')
      .select('*', { count: 'exact', head: true });

    // Total de itens contados
    const { data: dataItens, error: erroItens } = await supabase
      .from('itens_contados')
      .select('quantidade_total');

    const totalUnidades = dataItens.reduce((s, i) => s + i.quantidade_total, 0);

    // Usuários únicos
    const { data: dataUsuarios, error: erroUsuarios } = await supabase
      .from('sessoes_contagem')
      .select('usuario_id', { distinct: true });

    if (erroSessoes || erroItens || erroUsuarios) throw new Error('Erro ao obter estatísticas');

    return {
      sucesso: true,
      dados: {
        totalSessoes,
        totalItensUnicos: dataItens.length,
        totalUnidades,
        totalContadores: dataUsuarios.length,
        mediaUnidadesPorSessao: (totalUnidades / totalSessoes).toFixed(2),
        mediaItensParaContador: (dataItens.length / dataUsuarios.length).toFixed(2)
      }
    };
  } catch (erro) {
    console.error('Erro ao obter estatísticas:', erro);
    return {
      sucesso: false,
      dados: {}
    };
  }
};

// 5. FUNÇÕES AVANÇADAS
// =============================================================================

/**
 * Compara contagem com SPED (identifica discrepâncias)
 * Será integrada com dados do arquivo XML do SPED depois
 */
export const compararComSPED = async (spedData) => {
  try {
    // 1. Obter dados da contagem consolidada
    const { dados: contagem } = await gerarRelatorioConsolidado();

    // 2. Comparar com dados do SPED
    const discrepancias = [];

    contagem.forEach(itemContado => {
      const itemSPED = spedData.find(s => s.codigo === itemContado.codigo);

      if (!itemSPED) {
        discrepancias.push({
          tipo: 'ITEM_NÃO_ENCONTRADO_SPED',
          codigo: itemContado.codigo,
          descricao: itemContado.descricao,
          quantidadeContagem: itemContado.quantidade_total,
          quantidadeSPED: 0,
          diferenca: itemContado.quantidade_total,
          percentualDiferenca: 100
        });
      } else {
        const diferenca = itemContado.quantidade_total - itemSPED.quantidade;
        const percentual = (diferenca / itemSPED.quantidade) * 100;

        if (Math.abs(diferenca) > 0.01) { // Tolerância de arredondamento
          discrepancias.push({
            tipo: 'DISCREPÂNCIA',
            codigo: itemContado.codigo,
            descricao: itemContado.descricao,
            quantidadeContagem: itemContado.quantidade_total,
            quantidadeSPED: itemSPED.quantidade,
            diferenca,
            percentualDiferenca: percentual.toFixed(2)
          });
        }
      }
    });

    return {
      sucesso: true,
      discrepancias: discrepancias.sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca)),
      totalDiscrepancias: discrepancias.length,
      cobertura: ((contagem.length - discrepancias.filter(d => d.tipo === 'ITEM_NÃO_ENCONTRADO_SPED').length) / contagem.length * 100).toFixed(2)
    };
  } catch (erro) {
    console.error('Erro ao comparar com SPED:', erro);
    return {
      sucesso: false,
      discrepancias: []
    };
  }
};

// =============================================================================
// EXEMPLO DE USO
// =============================================================================

/*
// 1. Obter todas as sessões
const { dados: sessoes } = await obterTodasSessoes();

// 2. Gerar relatório consolidado
const { dados: relatorio, totais } = await gerarRelatorioConsolidado();

// 3. Exportar
exportarConsolidadoCSV(relatorio, totais);
exportarConsolidadoJSON(relatorio, totais);

// 4. Obter análise de contadores
const { dados: analise } = await gerarRelatorioContadores();

// 5. Obter estatísticas
const { dados: stats } = await obterEstatisticasGerais();

// 6. Comparar com SPED (quando tiver dados)
const { discrepancias } = await compararComSPED(spedData);
*/

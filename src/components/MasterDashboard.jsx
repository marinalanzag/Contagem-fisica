import React, { useState, useEffect } from 'react';
import {
  Users, Download, BarChart3, Eye, Filter, RefreshCw,
  LogOut, TrendingUp, FileText, AlertCircle, CheckCircle
} from 'lucide-react';
import { supabase } from '../services/supabase_integration';
import * as XLSX from 'xlsx';

const MasterDashboard = () => {
  // Estados de autenticação
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');

  // Estados de dados
  const [sessoes, setSessoes] = useState([]);
  const [relatorioConsolidado, setRelatorioConsolidado] = useState([]);
  const [usuariosAtivos, setUsuariosAtivos] = useState([]);

  // Estados da UI
  const [abaAtiva, setAbaAtiva] = useState('dashboard');
  const [sessaoSelecionada, setSessaoSelecionada] = useState(null);
  const [showDetalhes, setShowDetalhes] = useState(false);
  const [filtro, setFiltro] = useState({ status: 'todas' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isLoggedIn) {
      carregarDados();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);

  const carregarDados = async () => {
    setLoading(true);
    try {
      // 1. Buscar sessões com dados do usuário
      const { data: sessoesData, error: erroSessoes } = await supabase
        .from('sessoes_contagem')
        .select(`
          id,
          data_inicio,
          data_fim,
          status,
          total_itens_contados,
          total_unidades_contadas,
          usuarios:usuario_id (id, nome)
        `)
        .order('data_inicio', { ascending: false });

      if (erroSessoes) throw erroSessoes;

      // 2. Para cada sessão, buscar os itens contados
      const sessoesCompletas = await Promise.all(
        (sessoesData || []).map(async (sessao) => {
          const { data: itensData } = await supabase
            .from('itens_contados')
            .select(`
              id,
              quantidade_total,
              produtos:produto_id (codigo, descricao, categoria, codigo_barras)
            `)
            .eq('sessao_id', sessao.id);

          return {
            id: sessao.id,
            usuario: sessao.usuarios || { id: null, nome: 'Desconhecido' },
            dataInicio: new Date(sessao.data_inicio),
            dataFim: sessao.data_fim ? new Date(sessao.data_fim) : null,
            status: sessao.status,
            totalItens: sessao.total_itens_contados || 0,
            totalUnidades: sessao.total_unidades_contadas || 0,
            itens: (itensData || []).map(item => ({
              codigo: item.produtos?.codigo || '?',
              descricao: item.produtos?.descricao || '?',
              categoria: item.produtos?.categoria || '?',
              codigoBarras: item.produtos?.codigo_barras || '',
              quantidade: item.quantidade_total || 0
            }))
          };
        })
      );

      setSessoes(sessoesCompletas);
      setUsuariosAtivos(sessoesCompletas.filter(s => s.status === 'ativa'));
      gerarRelatorioConsolidado(sessoesCompletas);
    } catch (erro) {
      console.error('Erro ao carregar dados:', erro);
    }
    setLoading(false);
  };

  const gerarRelatorioConsolidado = (sessoesData) => {
    const mapItens = new Map();

    sessoesData.forEach(sessao => {
      sessao.itens.forEach(item => {
        const chave = item.codigo;
        if (mapItens.has(chave)) {
          const itemExistente = mapItens.get(chave);
          mapItens.set(chave, {
            ...itemExistente,
            quantidade: itemExistente.quantidade + item.quantidade,
            usuarios: [...new Set([...itemExistente.usuarios, sessao.usuario.nome])]
          });
        } else {
          mapItens.set(chave, {
            codigo: item.codigo,
            descricao: item.descricao,
            categoria: item.categoria,
            codigoBarras: item.codigoBarras || '',
            quantidade: item.quantidade,
            usuarios: [sessao.usuario.nome]
          });
        }
      });
    });

    const relatorio = Array.from(mapItens.values()).sort((a, b) =>
      a.codigo.localeCompare(b.codigo)
    );

    setRelatorioConsolidado(relatorio);
  };

  // Login Master
  const handleLoginMaster = (e) => {
    e.preventDefault();
    if (passwordInput === '1234') {
      setIsLoggedIn(true);
      setPasswordInput('');
    } else {
      alert('Senha incorreta!');
    }
  };

  // Logout
  const handleLogout = () => {
    setIsLoggedIn(false);
    setAbaAtiva('dashboard');
  };

  // Atualizar dados
  const handleRefresh = () => {
    carregarDados();
  };

  // Sessões filtradas
  const sessoesFiltradas = sessoes.filter(s => {
    if (filtro.status === 'todas') return true;
    return s.status === filtro.status;
  });

  // Exportar relatório consolidado
  const exportarRelatorioCSV = () => {
    const headers = ['CÓDIGO', 'DESCRIÇÃO', 'QUANTIDADE', 'CATEGORIA', 'CONTADORES'];
    const rows = relatorioConsolidado.map(r => [
      r.codigo,
      `"${r.descricao}"`,
      r.quantidade.toString().replace('.', ','),
      r.categoria,
      `"${r.usuarios.join(', ')}"`
    ]);

    const csvContent = [
      ['RELATÓRIO CONSOLIDADO DE CONTAGEM - ' + new Date().toLocaleDateString('pt-BR')],
      [],
      ['Data/Hora:', new Date().toLocaleString('pt-BR')],
      ['Total de Itens:', relatorioConsolidado.length],
      ['Total de Unidades:', relatorioConsolidado.reduce((s, r) => s + r.quantidade, 0).toFixed(2)],
      ['Sessões Ativas:', usuariosAtivos.length],
      ['Sessões Concluídas:', sessoes.filter(s => s.status === 'concluida').length],
      [],
      headers,
      ...rows
    ]
      .map(row => row.join(';'))
      .join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio_consolidado_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // Exportar relatório JSON
  const exportarRelatorioJSON = () => {
    const exportData = {
      meta: {
        data: new Date().toLocaleDateString('pt-BR'),
        hora: new Date().toLocaleTimeString('pt-BR'),
        dataISO: new Date().toISOString(),
        totalItens: relatorioConsolidado.length,
        totalUnidades: relatorioConsolidado.reduce((s, r) => s + r.quantidade, 0),
        totalSessoes: sessoes.length,
        sessoesAtivas: usuariosAtivos.length,
        sessoesConcluidas: sessoes.filter(s => s.status === 'concluida').length
      },
      sessoes: sessoes.map(s => ({
        id: s.id,
        usuario: s.usuario.nome,
        dataInicio: s.dataInicio.toISOString(),
        dataFim: s.dataFim ? s.dataFim.toISOString() : null,
        status: s.status,
        totalItens: s.totalItens,
        totalUnidades: s.totalUnidades
      })),
      itemsConsolidados: relatorioConsolidado
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio_consolidado_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  };

  // Exportar relatório Inventário (Excel)
  const exportarInventarioXLSX = () => {
    const dados = relatorioConsolidado.map(r => ({
      'CÓDIGO INTERNO': r.codigo,
      'CÓDIGO EAN': r.codigoBarras || '',
      'DESCRIÇÃO': r.descricao,
      'QUANTIDADE': r.quantidade
    }));

    const ws = XLSX.utils.json_to_sheet(dados);

    // Ajustar largura das colunas
    ws['!cols'] = [
      { wch: 15 },  // CÓDIGO INTERNO
      { wch: 18 },  // CÓDIGO EAN
      { wch: 50 },  // DESCRIÇÃO
      { wch: 15 },  // QUANTIDADE
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Inventário');
    XLSX.writeFile(wb, `inventario_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  // Tela de login
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">👨‍💼</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-800">Acesso Master</h1>
            <p className="text-gray-600 mt-2">Relatórios e Gerenciamento</p>
          </div>

          <form onSubmit={handleLoginMaster} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Senha de Acesso
              </label>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Digite a senha"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none"
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-2">Demo: use "1234"</p>
            </div>

            <button
              type="submit"
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-lg transition duration-200"
            >
              Acessar Dashboard
            </button>
          </form>

          <div className="mt-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
            <p className="text-xs text-yellow-700">
              <strong>⚠️ Acesso Restrito:</strong> Apenas usuários autorizados. Todas as ações serão registradas em log.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Dashboard Master
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Dashboard Master</h1>
            <p className="text-sm text-gray-600">👨‍💼 Gerenciamento de Contagens</p>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition disabled:opacity-50"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
              <span className="text-sm font-medium">Atualizar</span>
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 text-red-700 hover:bg-red-50 rounded-lg transition"
            >
              <LogOut size={18} />
              <span className="text-sm font-medium">Sair</span>
            </button>
          </div>
        </div>

        {/* Abas */}
        <div className="border-t border-gray-200">
          <div className="max-w-7xl mx-auto px-4 flex gap-8">
            <button
              onClick={() => setAbaAtiva('dashboard')}
              className={`py-3 px-2 font-medium border-b-2 transition ${
                abaAtiva === 'dashboard'
                  ? 'border-red-600 text-red-600'
                  : 'border-transparent text-gray-600 hover:text-gray-800'
              }`}
            >
              <span className="flex items-center gap-2">
                <BarChart3 size={18} />
                Dashboard
              </span>
            </button>
            <button
              onClick={() => setAbaAtiva('sessoes')}
              className={`py-3 px-2 font-medium border-b-2 transition ${
                abaAtiva === 'sessoes'
                  ? 'border-red-600 text-red-600'
                  : 'border-transparent text-gray-600 hover:text-gray-800'
              }`}
            >
              <span className="flex items-center gap-2">
                <Users size={18} />
                Sessões ({sessoes.length})
              </span>
            </button>
            <button
              onClick={() => setAbaAtiva('relatorio')}
              className={`py-3 px-2 font-medium border-b-2 transition ${
                abaAtiva === 'relatorio'
                  ? 'border-red-600 text-red-600'
                  : 'border-transparent text-gray-600 hover:text-gray-800'
              }`}
            >
              <span className="flex items-center gap-2">
                <FileText size={18} />
                Relatório Consolidado
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4">
        {loading && (
          <div className="text-center py-8 text-gray-500">Carregando dados do Supabase...</div>
        )}

        {/* ABA: DASHBOARD */}
        {abaAtiva === 'dashboard' && !loading && (
          <div className="space-y-6">
            {/* Cards de Resumo */}
            <div className="grid md:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm">Total de Itens</p>
                    <p className="text-3xl font-bold text-gray-800">
                      {relatorioConsolidado.length}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                    <FileText size={24} className="text-blue-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm">Total Contado</p>
                    <p className="text-3xl font-bold text-gray-800">
                      {relatorioConsolidado.reduce((s, r) => s + r.quantidade, 0).toFixed(1)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">unidades</p>
                  </div>
                  <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                    <TrendingUp size={24} className="text-green-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm">Sessões Ativas</p>
                    <p className="text-3xl font-bold text-gray-800">
                      {usuariosAtivos.length}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                    <AlertCircle size={24} className="text-yellow-600" />
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm">Sessões Concluídas</p>
                    <p className="text-3xl font-bold text-gray-800">
                      {sessoes.filter(s => s.status === 'concluida').length}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                    <CheckCircle size={24} className="text-purple-600" />
                  </div>
                </div>
              </div>
            </div>

            {/* Contadores Ativos */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">
                👥 Contadores Ativos Agora
              </h2>
              <div className="space-y-3">
                {usuariosAtivos.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">Nenhum contador ativo no momento</p>
                ) : (
                  usuariosAtivos.map(sessao => (
                    <div key={sessao.id} className="p-4 bg-gradient-to-r from-yellow-50 to-orange-50 rounded-lg border border-yellow-200 flex justify-between items-center">
                      <div>
                        <p className="font-bold text-gray-800">{sessao.usuario.nome}</p>
                        <p className="text-sm text-gray-600">
                          {sessao.totalItens} itens • {sessao.totalUnidades.toFixed(1)} unidades
                        </p>
                        <p className="text-xs text-gray-500">
                          Iniciado há {Math.round((Date.now() - sessao.dataInicio) / 60000)} minutos
                        </p>
                      </div>
                      <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Resumo por Categoria */}
            {relatorioConsolidado.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-bold text-gray-800 mb-4">
                  📊 Resumo por Categoria
                </h2>
                <div className="space-y-3">
                  {(() => {
                    const porCategoria = new Map();
                    const totalGeral = relatorioConsolidado.reduce((s, r) => s + r.quantidade, 0);
                    relatorioConsolidado.forEach(item => {
                      porCategoria.set(item.categoria, (porCategoria.get(item.categoria) || 0) + item.quantidade);
                    });

                    return Array.from(porCategoria.entries())
                      .sort((a, b) => b[1] - a[1])
                      .map(([categoria, total]) => {
                        const percentual = totalGeral > 0 ? (total / totalGeral) * 100 : 0;
                        return (
                          <div key={categoria}>
                            <div className="flex justify-between items-center mb-2">
                              <p className="font-medium text-gray-800">{categoria}</p>
                              <p className="font-bold text-gray-800">{total.toFixed(1)} un. ({percentual.toFixed(1)}%)</p>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full"
                                style={{ width: `${percentual}%` }}
                              />
                            </div>
                          </div>
                        );
                      });
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ABA: SESSÕES */}
        {abaAtiva === 'sessoes' && !loading && (
          <div className="space-y-6">
            {/* Filtros */}
            <div className="bg-white rounded-lg shadow p-4 flex gap-4 flex-wrap items-end">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={filtro.status}
                  onChange={(e) => setFiltro({ ...filtro, status: e.target.value })}
                  className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                >
                  <option value="todas">Todas</option>
                  <option value="ativa">Ativas</option>
                  <option value="concluida">Concluídas</option>
                </select>
              </div>
              <button
                onClick={() => {}}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition text-sm flex items-center gap-2"
              >
                <Filter size={16} />
                Filtrar
              </button>
            </div>

            {/* Tabela de Sessões */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 border-b-2 border-gray-300">
                  <tr>
                    <th className="px-4 py-3 text-left font-bold text-gray-800">Usuário</th>
                    <th className="px-4 py-3 text-left font-bold text-gray-800">Status</th>
                    <th className="px-4 py-3 text-right font-bold text-gray-800">Itens</th>
                    <th className="px-4 py-3 text-right font-bold text-gray-800">Unidades</th>
                    <th className="px-4 py-3 text-left font-bold text-gray-800">Início</th>
                    <th className="px-4 py-3 text-left font-bold text-gray-800">Fim</th>
                    <th className="px-4 py-3 text-center font-bold text-gray-800">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {sessoesFiltradas.map((sessao) => (
                    <tr key={sessao.id} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-800">{sessao.usuario.nome}</td>
                      <td className="px-4 py-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                          sessao.status === 'ativa'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {sessao.status === 'ativa' ? '🔴 Ativa' : '✓ Concluída'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-gray-800">{sessao.totalItens}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-800">{sessao.totalUnidades.toFixed(1)}</td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {sessao.dataInicio.toLocaleString('pt-BR')}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {sessao.dataFim ? sessao.dataFim.toLocaleString('pt-BR') : '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => {
                            setSessaoSelecionada(sessao);
                            setShowDetalhes(true);
                          }}
                          className="text-red-600 hover:text-red-800 font-medium text-xs flex items-center gap-1 justify-center"
                        >
                          <Eye size={14} />
                          Ver
                        </button>
                      </td>
                    </tr>
                  ))}
                  {sessoesFiltradas.length === 0 && (
                    <tr>
                      <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                        Nenhuma sessão encontrada
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ABA: RELATÓRIO CONSOLIDADO */}
        {abaAtiva === 'relatorio' && !loading && (
          <div className="space-y-6">
            {/* Cabeçalho com Exportação */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">Relatório Consolidado</h2>
                  <p className="text-sm text-gray-600">
                    Consolidação de todas as contagens
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={exportarRelatorioCSV}
                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-lg transition flex items-center gap-2"
                  >
                    <Download size={18} />
                    CSV
                  </button>
                  <button
                    onClick={exportarRelatorioJSON}
                    className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-lg transition flex items-center gap-2"
                  >
                    <Download size={18} />
                    JSON
                  </button>
                  <button
                    onClick={exportarInventarioXLSX}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg transition flex items-center gap-2"
                  >
                    <FileText size={18} />
                    Inventário
                  </button>
                </div>
              </div>

              {/* Dados Resumo */}
              <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div>
                  <p className="text-xs text-gray-600">Total de Itens Únicos</p>
                  <p className="text-2xl font-bold text-gray-800">{relatorioConsolidado.length}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Total de Unidades Contadas</p>
                  <p className="text-2xl font-bold text-gray-800">
                    {relatorioConsolidado.reduce((s, r) => s + r.quantidade, 0).toFixed(1)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Contadores Envolvidos</p>
                  <p className="text-2xl font-bold text-gray-800">
                    {new Set(sessoes.map(s => s.usuario.nome)).size}
                  </p>
                </div>
              </div>
            </div>

            {/* Tabela Consolidada */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 border-b-2 border-gray-300">
                  <tr>
                    <th className="px-4 py-3 text-left font-bold text-gray-800">Código</th>
                    <th className="px-4 py-3 text-left font-bold text-gray-800">Descrição</th>
                    <th className="px-4 py-3 text-left font-bold text-gray-800">Categoria</th>
                    <th className="px-4 py-3 text-right font-bold text-gray-800 w-28">Quantidade</th>
                    <th className="px-4 py-3 text-left font-bold text-gray-800">Contadores</th>
                  </tr>
                </thead>
                <tbody>
                  {relatorioConsolidado.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="px-4 py-3 font-bold text-red-600">{item.codigo}</td>
                      <td className="px-4 py-3 text-gray-800">{item.descricao}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{item.categoria}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-800">
                        <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                          {item.quantidade.toFixed(2)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        <div className="flex flex-wrap gap-1">
                          {item.usuarios.map(user => (
                            <span key={user} className="bg-gray-200 text-gray-800 px-2 py-1 rounded text-xs">
                              {user}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {relatorioConsolidado.length === 0 && (
                    <tr>
                      <td colSpan="5" className="px-4 py-8 text-center text-gray-500">
                        Nenhum dado de contagem encontrado
                      </td>
                    </tr>
                  )}
                </tbody>
                {relatorioConsolidado.length > 0 && (
                  <tfoot className="bg-gray-100 border-t-2 border-gray-300">
                    <tr>
                      <td colSpan="3" className="px-4 py-3 font-bold text-gray-800">TOTAL</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-800">
                        <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full">
                          {relatorioConsolidado.reduce((s, r) => s + r.quantidade, 0).toFixed(2)}
                        </span>
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Detalhes da Sessão */}
      {showDetalhes && sessaoSelecionada && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-96 overflow-y-auto">
            <div className="sticky top-0 bg-gray-100 border-b border-gray-200 p-6 flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-800">
                Detalhes da Sessão - {sessaoSelecionada.usuario.nome}
              </h3>
              <button
                onClick={() => setShowDetalhes(false)}
                className="text-gray-600 hover:text-gray-800 font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-600">Usuário</p>
                  <p className="font-bold text-gray-800">{sessaoSelecionada.usuario.nome}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Status</p>
                  <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                    sessaoSelecionada.status === 'ativa'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {sessaoSelecionada.status === 'ativa' ? '🔴 Ativa' : '✓ Concluída'}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Itens Contados</p>
                  <p className="font-bold text-gray-800">{sessaoSelecionada.totalItens}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-600">Total Unidades</p>
                  <p className="font-bold text-gray-800">{sessaoSelecionada.totalUnidades.toFixed(1)}</p>
                </div>
              </div>

              {/* Itens */}
              <div>
                <h4 className="font-bold text-gray-800 mb-3">Itens Contados</h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {sessaoSelecionada.itens.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">Nenhum item contado nesta sessão</p>
                  ) : (
                    sessaoSelecionada.itens.map((item, idx) => (
                      <div key={idx} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-bold text-red-600">{item.codigo}</p>
                            <p className="text-sm text-gray-600">{item.descricao}</p>
                            <p className="text-xs text-gray-500">{item.categoria}</p>
                          </div>
                          <p className="font-bold text-gray-800">{item.quantidade.toFixed(1)} un.</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <button
                onClick={() => setShowDetalhes(false)}
                className="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded-lg transition"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MasterDashboard;

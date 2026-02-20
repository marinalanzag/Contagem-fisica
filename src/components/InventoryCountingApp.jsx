import React, { useState, useEffect, useRef } from 'react';
import { Plus, Download, LogOut, Trash2, Camera, X, Link } from 'lucide-react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  iniciarSessao,
  adicionarQuantidade,
  corrigirQuantidade,
  removerItemContado,
  obterTodosItensUsuario,
  gerarRelatorio,
  finalizarSessao,
  supabase
} from '../services/supabase_integration';

const CONTADORES = [
  'Adriane','Amanda','Arthur','Carlão','Cida',
  'Claudiano','Eulinho','Fernanda','Guilherme','Gustavo',
  'Iêssa','Ivo','Jéssica','Juliene','Márcio',
  'Marina','Michele','Patricia','Renato','Ruan','Werisson'
];

const InventoryCountingApp = () => {
  // Estados de autenticação e usuário
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [userName, setUserName] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Estados de dados
  const [products, setProducts] = useState([]);
  const [countedItems, setCountedItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [quantity, setQuantity] = useState('');

  // Estados da UI
  const [showReport, setShowReport] = useState(false);
  const [reportData, setReportData] = useState([]);
  const [syncStatus, setSyncStatus] = useState('synced');
  const [lastSync, setLastSync] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scannerMessage, setScannerMessage] = useState('');
  const [pendingBarcode, setPendingBarcode] = useState(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkSearchTerm, setLinkSearchTerm] = useState('');

  const searchInputRef = useRef(null);
  const quantityInputRef = useRef(null);
  const scannerRef = useRef(null);

  // Restaurar sessão do localStorage ao iniciar
  useEffect(() => {
    const saved = localStorage.getItem('contagem_sessao');
    if (saved) {
      try {
        const { usuario_id, sessao_id, nome } = JSON.parse(saved);
        setUserId(usuario_id);
        setSessionId(sessao_id);
        setUserName(nome);
        setIsLoggedIn(true);
      } catch {
        localStorage.removeItem('contagem_sessao');
      }
    }
  }, []);

  // Buscar produtos sob demanda (para 15k+ itens)
  useEffect(() => {
    if (!searchTerm || searchTerm.length < 2) {
      setProducts([]);
      return;
    }
    const timer = setTimeout(() => buscarProdutosPorTermo(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const buscarProdutosPorTermo = async (termo) => {
    const { data, error } = await supabase
      .from('produtos')
      .select('id, codigo, descricao, categoria, unidade_padrao, codigo_barras')
      .eq('ativo', true)
      .or(`codigo.ilike.%${termo}%,descricao.ilike.%${termo}%,codigo_barras.eq.${termo}`)
      .order('codigo')
      .limit(30);

    if (!error && data) {
      setProducts(data.map(p => ({
        id: p.id,
        code: p.codigo,
        description: p.descricao,
        category: p.categoria,
        unit: p.unidade_padrao,
        barcode: p.codigo_barras || ''
      })));
    }
  };

  const buscarPorCodigoBarras = async (barcode) => {
    const { data, error } = await supabase
      .from('produtos')
      .select('id, codigo, descricao, categoria, unidade_padrao, codigo_barras')
      .or(`codigo_barras.eq.${barcode},codigo.eq.${barcode}`)
      .limit(1)
      .single();

    if (!error && data) {
      return {
        id: data.id,
        code: data.codigo,
        description: data.descricao,
        category: data.categoria,
        unit: data.unidade_padrao,
        barcode: data.codigo_barras || ''
      };
    }
    return null;
  };

  // Carregar todos os itens do usuário (todas as sessões)
  useEffect(() => {
    if (userId) {
      carregarItensContados();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const carregarItensContados = async () => {
    if (!userId) return;
    const resultado = await obterTodosItensUsuario(userId);
    if (resultado.sucesso) {
      setCountedItems(resultado.dados);
      setLastSync(new Date());
    }
  };

  // Produtos já vêm filtrados do Supabase
  const filteredProducts = products;

  // Login - tenta retomar sessão ativa ou cria uma nova
  const handleLogin = async (e, nomeOverride) => {
    e.preventDefault();
    const nome = nomeOverride || userName;
    if (!nome.trim()) return;

    setUserName(nome);
    setLoginLoading(true);
    setLoginError('');

    try {
      // 1. Buscar usuário existente
      const { data: usuario } = await supabase
        .from('usuarios')
        .select('id')
        .eq('nome', nome.trim())
        .single();

      if (usuario) {
        // 2. Verificar se tem sessão ativa
        const { data: sessaoAtiva } = await supabase
          .from('sessoes_contagem')
          .select('id')
          .eq('usuario_id', usuario.id)
          .eq('status', 'ativa')
          .order('data_inicio', { ascending: false })
          .limit(1)
          .single();

        if (sessaoAtiva) {
          // Retomar sessão existente
          setUserId(usuario.id);
          setSessionId(sessaoAtiva.id);
          setIsLoggedIn(true);
          localStorage.setItem('contagem_sessao', JSON.stringify({
            usuario_id: usuario.id,
            sessao_id: sessaoAtiva.id,
            nome: nome.trim()
          }));
          setLoginLoading(false);
          setTimeout(() => searchInputRef.current?.focus(), 100);
          return;
        }
      }

      // 3. Sem sessão ativa - criar nova
      const resultado = await iniciarSessao(nome.trim());

      if (resultado.sucesso) {
        setUserId(resultado.usuario_id);
        setSessionId(resultado.sessao_id);
        setIsLoggedIn(true);
        localStorage.setItem('contagem_sessao', JSON.stringify({
          usuario_id: resultado.usuario_id,
          sessao_id: resultado.sessao_id,
          nome: nome.trim()
        }));
        setTimeout(() => searchInputRef.current?.focus(), 100);
      } else {
        setLoginError('Erro ao iniciar sessão. Verifique sua conexão.');
      }
    } catch {
      setLoginError('Erro ao conectar. Verifique sua conexão.');
    }

    setLoginLoading(false);
  };

  // Logout - mostrar modal de confirmação
  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  // Pausar sessão (sair sem finalizar - pode retomar depois)
  const handlePauseSession = () => {
    setShowLogoutConfirm(false);
    setIsLoggedIn(false);
    setUserId(null);
    setSessionId(null);
    setUserName('');
    setCountedItems([]);
    setReportData([]);
    setShowReport(false);
    // Mantém localStorage para poder retomar
  };

  // Finalizar sessão (encerrar definitivamente)
  const handleFinalizeSession = async () => {
    if (sessionId) {
      await finalizarSessao(sessionId);
    }
    setShowLogoutConfirm(false);
    setIsLoggedIn(false);
    setUserId(null);
    setSessionId(null);
    setUserName('');
    setCountedItems([]);
    setReportData([]);
    setShowReport(false);
    localStorage.removeItem('contagem_sessao');
  };

  // Abrir scanner de código de barras
  const openScanner = () => {
    setScannerMessage('');
    setPendingBarcode(null);
    setShowScanner(true);
    setTimeout(() => {
      const formatsBarcode = [
        Html5QrcodeSupportedFormats.EAN_13,
        Html5QrcodeSupportedFormats.EAN_8,
        Html5QrcodeSupportedFormats.CODE_128,
        Html5QrcodeSupportedFormats.CODE_39,
        Html5QrcodeSupportedFormats.UPC_A,
        Html5QrcodeSupportedFormats.UPC_E,
        Html5QrcodeSupportedFormats.ITF,
        Html5QrcodeSupportedFormats.CODABAR,
      ];
      const html5Qrcode = new Html5Qrcode('barcode-reader', { formatsToSupport: formatsBarcode });
      scannerRef.current = html5Qrcode;
      html5Qrcode.start(
        { facingMode: 'environment' },
        {
          fps: 15,
          qrbox: (viewfinderWidth, viewfinderHeight) => ({
            width: Math.floor(viewfinderWidth * 0.85),
            height: Math.floor(viewfinderHeight * 0.3),
          }),
        },
        (decodedText) => {
          html5Qrcode.stop().then(async () => {
            scannerRef.current = null;
            const product = await buscarPorCodigoBarras(decodedText);
            if (product) {
              setShowScanner(false);
              setSelectedProduct(product);
              setSearchTerm('');
              setTimeout(() => quantityInputRef.current?.focus(), 100);
            } else {
              setPendingBarcode(decodedText);
              setScannerMessage(`Código "${decodedText}" não vinculado a nenhum produto.`);
            }
          }).catch(() => {});
        },
        () => {}
      ).catch(() => {
        setScannerMessage('Não foi possível acessar a câmera. Verifique as permissões.');
      });
    }, 300);
  };

  // Fechar scanner
  const closeScanner = () => {
    if (scannerRef.current) {
      scannerRef.current.stop().then(() => {
        scannerRef.current = null;
      }).catch(() => {});
    }
    setShowScanner(false);
    setScannerMessage('');
    setPendingBarcode(null);
  };

  // Abrir modal para vincular barcode a produto
  const openLinkModal = () => {
    setShowScanner(false);
    setLinkSearchTerm('');
    setShowLinkModal(true);
  };

  // Vincular barcode ao produto selecionado
  const handleLinkBarcode = async (product) => {
    if (!pendingBarcode) return;

    const { error } = await supabase
      .from('produtos')
      .update({ codigo_barras: pendingBarcode })
      .eq('id', product.id);

    if (!error) {
      setShowLinkModal(false);
      setSelectedProduct({ ...product, barcode: pendingBarcode });
      setPendingBarcode(null);
      setTimeout(() => quantityInputRef.current?.focus(), 100);
    } else {
      alert('Erro ao vincular código de barras.');
    }
  };

  // Produtos filtrados para modal de vinculação (busca no Supabase)
  const [linkProducts, setLinkProducts] = useState([]);

  useEffect(() => {
    if (!linkSearchTerm || linkSearchTerm.length < 2) {
      setLinkProducts([]);
      return;
    }
    const timer = setTimeout(async () => {
      const { data, error } = await supabase
        .from('produtos')
        .select('id, codigo, descricao, categoria, unidade_padrao, codigo_barras')
        .eq('ativo', true)
        .or(`codigo.ilike.%${linkSearchTerm}%,descricao.ilike.%${linkSearchTerm}%`)
        .order('codigo')
        .limit(30);

      if (!error && data) {
        setLinkProducts(data.map(p => ({
          id: p.id,
          code: p.codigo,
          description: p.descricao,
          category: p.categoria,
          unit: p.unidade_padrao,
          barcode: p.codigo_barras || ''
        })));
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [linkSearchTerm]);

  const linkFilteredProducts = linkProducts;

  // Adicionar/atualizar contagem
  const handleAddQuantity = async (e) => {
    e.preventDefault();
    if (!selectedProduct || !quantity) return;

    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty < 0) {
      alert('Digite uma quantidade válida');
      return;
    }

    setSyncStatus('syncing');

    const resultado = await adicionarQuantidade(sessionId, selectedProduct.id, qty, userId);

    if (resultado.sucesso) {
      await carregarItensContados();
      setSyncStatus('synced');
      setQuantity('');
      setSelectedProduct(null);
      setSearchTerm('');
      setTimeout(() => searchInputRef.current?.focus(), 100);
    } else {
      setSyncStatus('synced');
      alert('Erro ao salvar contagem. Tente novamente.');
    }
  };

  // Remover item da contagem
  const handleRemoveItem = async (itemId) => {
    setSyncStatus('syncing');
    const resultado = await removerItemContado(itemId, userId);
    if (resultado.sucesso) {
      await carregarItensContados();
    }
    setSyncStatus('synced');
  };

  // Corrigir quantidade de um item
  const handleCorrectQuantity = async (item) => {
    const newQty = prompt('Digite a nova quantidade:', item.quantidade);
    if (newQty !== null) {
      const qty = parseFloat(newQty);
      if (!isNaN(qty) && qty >= 0) {
        setSyncStatus('syncing');
        const resultado = await corrigirQuantidade(item.id, qty, userId);
        if (resultado.sucesso) {
          await carregarItensContados();
        }
        setSyncStatus('synced');
      }
    }
  };

  // Gerar relatório
  const handleGenerateReport = async () => {
    const resultado = await gerarRelatorio(sessionId);
    if (resultado.sucesso) {
      setReportData(resultado.dados.map(r => ({
        code: r.codigo,
        description: r.descricao,
        quantity: r.quantidade,
        unit: r.unidade || 'UN',
        category: r.categoria,
        barcode: r.codigoBarras || ''
      })));
      setShowReport(true);
    }
  };

  // Exportar relatório como CSV
  const handleExportCSV = () => {
    const headers = ['CÓDIGO', 'CÓD. BARRAS', 'DESCRIÇÃO', 'QUANTIDADE', 'UNIDADE', 'CATEGORIA'];
    const rows = reportData.map(r => [
      r.code,
      r.barcode || '',
      `"${r.description}"`,
      r.quantity.toString().replace('.', ','),
      r.unit,
      r.category
    ]);

    const csvContent = [
      headers.join(';'),
      `Usuário;${userName}`,
      `Data;${new Date().toLocaleDateString('pt-BR')}`,
      `Hora;${new Date().toLocaleTimeString('pt-BR')}`,
      `Total de Itens;${reportData.length}`,
      '',
      ...rows.map(r => r.join(';'))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `contagem_${userName}_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  // Exportar relatório como JSON
  const handleExportJSON = () => {
    const exportData = {
      meta: {
        usuario: userName,
        data: new Date().toLocaleDateString('pt-BR'),
        hora: new Date().toLocaleTimeString('pt-BR'),
        totalItens: reportData.length,
        totalUnidades: reportData.reduce((sum, r) => sum + r.quantity, 0)
      },
      dados: reportData
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `contagem_${userName}_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
  };

  // Limpar contagem
  const handleClearCounting = async () => {
    setSyncStatus('syncing');
    for (const item of countedItems) {
      await removerItemContado(item.id, userId);
    }
    await carregarItensContados();
    setShowClearConfirm(false);
    setSyncStatus('synced');
  };

  // Totais calculados
  const totalItems = countedItems.length;
  const totalUnits = countedItems.reduce((sum, item) => sum + item.quantidade, 0);

  // Tela de login
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl text-white">📦</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-800">Contagem de Estoque</h1>
            <p className="text-gray-600 mt-2">O FAZENDEIRO LTDA</p>
          </div>

          <p className="text-sm font-medium text-gray-700 mb-3 text-center">
            Selecione seu nome para iniciar
          </p>

          {loginError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 mb-3">
              {loginError}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
            {CONTADORES.map(nome => (
              <button
                key={nome}
                onClick={() => {
                  setUserName(nome);
                  handleLogin({ preventDefault: () => {}, target: null }, nome);
                }}
                disabled={loginLoading}
                className="px-3 py-3 bg-green-50 hover:bg-green-500 hover:text-white border border-green-200 hover:border-green-500 disabled:opacity-50 text-gray-800 text-sm font-medium rounded-lg transition duration-150 text-center"
              >
                {loginLoading && userName === nome ? '...' : nome}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Tela principal
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Contagem Física</h1>
            <p className="text-sm text-gray-600">👤 {userName}</p>
          </div>

          <div className="flex items-center gap-4">
            <div className={`text-xs px-2 py-1 rounded-full ${
              syncStatus === 'synced' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
            }`}>
              {syncStatus === 'syncing' ? '⟳ Sincronizando...' : '✓ Sincronizado'}
            </div>
            {lastSync && (
              <div className="text-xs text-gray-500">
                Última sincronização: {lastSync.toLocaleTimeString('pt-BR')}
              </div>
            )}
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
            >
              <LogOut size={18} />
              <span className="text-sm font-medium">Sair</span>
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4">
        {!showReport ? (
          <div className="grid md:grid-cols-3 gap-6">
            {/* Painel de entrada */}
            <div className="md:col-span-2 space-y-6">
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-bold text-gray-800 mb-4">Buscar e Registrar Item</h2>

                <form onSubmit={handleAddQuantity} className="space-y-4">
                  {/* Busca de produto */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Código ou Descrição do Produto
                    </label>
                    <div className="relative">
                      <div className="flex gap-2">
                        <input
                          ref={searchInputRef}
                          type="text"
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          placeholder="Digite o código ou descrição..."
                          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          onClick={openScanner}
                          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition flex items-center gap-2"
                          title="Escanear código de barras"
                        >
                          <Camera size={20} />
                          <span className="hidden sm:inline text-sm font-medium">Escanear</span>
                        </button>
                      </div>

                      {/* Dropdown de produtos */}
                      {searchTerm && searchTerm.length >= 2 && filteredProducts.length > 0 && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
                          {filteredProducts.map(product => (
                            <button
                              key={product.id}
                              type="button"
                              onClick={() => {
                                setSelectedProduct(product);
                                setSearchTerm('');
                                setTimeout(() => quantityInputRef.current?.focus(), 100);
                              }}
                              className="w-full text-left px-4 py-3 hover:bg-green-50 border-b border-gray-100 last:border-b-0 transition"
                            >
                              <div className="font-medium text-gray-800">{product.code}</div>
                              <div className="text-sm text-gray-600">{product.description}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Produto selecionado */}
                  {selectedProduct && (
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="font-medium text-gray-800">{selectedProduct.code}</div>
                      <div className="text-sm text-gray-600 mt-1">{selectedProduct.description}</div>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProduct(null);
                          setSearchTerm('');
                          setTimeout(() => searchInputRef.current?.focus(), 100);
                        }}
                        className="text-xs text-green-600 hover:text-green-700 mt-2 font-medium"
                      >
                        Trocar Item
                      </button>
                    </div>
                  )}

                  {/* Entrada de quantidade */}
                  {selectedProduct && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Quantidade Contada
                      </label>
                      <div className="flex gap-2">
                        <input
                          ref={quantityInputRef}
                          type="number"
                          value={quantity}
                          onChange={(e) => setQuantity(e.target.value)}
                          placeholder="0"
                          step="0.01"
                          min="0"
                          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
                          autoFocus
                        />
                        <button
                          type="submit"
                          disabled={!quantity}
                          className="px-6 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-bold rounded-lg transition flex items-center gap-2"
                        >
                          <Plus size={20} />
                          Adicionar
                        </button>
                      </div>
                    </div>
                  )}
                </form>

                {/* Stats */}
                <div className="mt-6 p-4 bg-gray-50 rounded-lg grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-2xl font-bold text-green-600">
                      {totalItems}
                    </div>
                    <div className="text-sm text-gray-600">Produtos Contados</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-blue-600">
                      {totalUnits.toFixed(1)}
                    </div>
                    <div className="text-sm text-gray-600">Total de Unidades</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Painel de itens contados */}
            <div className="bg-white rounded-lg shadow p-6 h-fit">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Itens Contados ({totalItems})</h2>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {countedItems.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-8">
                    Nenhum item contado ainda
                  </p>
                ) : (
                  countedItems.map(item => (
                    <div key={item.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200 hover:border-green-300 transition group">
                      <div className="flex justify-between items-start mb-1">
                        <div className="flex-1">
                          <div className="text-xs font-bold text-green-600">{item.codigo}</div>
                          <div className="text-xs text-gray-600 line-clamp-2">{item.descricao}</div>
                        </div>
                        <div className="text-right ml-2">
                          <div className="font-bold text-gray-800">{item.quantidade.toFixed(1)}</div>
                          <div className="text-xs text-gray-500">{item.unidade || 'un.'}</div>
                        </div>
                      </div>
                      <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition">
                        <button
                          onClick={() => handleCorrectQuantity(item)}
                          className="flex-1 text-xs py-1 px-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded transition"
                        >
                          Corrigir
                        </button>
                        <button
                          onClick={() => handleRemoveItem(item.id)}
                          className="flex-1 text-xs py-1 px-2 bg-red-100 hover:bg-red-200 text-red-700 rounded transition"
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {countedItems.length > 0 && (
                <div className="mt-4 space-y-2">
                  <button
                    onClick={handleGenerateReport}
                    className="w-full px-4 py-2 bg-green-500 hover:bg-green-600 text-white font-bold rounded-lg transition flex items-center justify-center gap-2"
                  >
                    <Download size={18} />
                    Gerar Relatório
                  </button>
                  <button
                    onClick={() => setShowClearConfirm(true)}
                    className="w-full px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-lg transition flex items-center justify-center gap-2"
                  >
                    <Trash2 size={18} />
                    Limpar Tudo
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          // Tela de relatório
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">Relatório de Contagem</h2>
              <button
                onClick={() => setShowReport(false)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg transition"
              >
                Voltar
              </button>
            </div>

            {/* Info do relatório */}
            <div className="grid grid-cols-4 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
              <div>
                <div className="text-sm text-gray-600">Usuário</div>
                <div className="font-bold text-gray-800">{userName}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Data</div>
                <div className="font-bold text-gray-800">{new Date().toLocaleDateString('pt-BR')}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Total de Itens</div>
                <div className="font-bold text-gray-800">{reportData.length}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Total Contado</div>
                <div className="font-bold text-gray-800">
                  {reportData.reduce((sum, r) => sum + r.quantity, 0).toFixed(1)} un.
                </div>
              </div>
            </div>

            {/* Tabela de relatório */}
            <div className="overflow-x-auto mb-6">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 border-b-2 border-gray-300">
                  <tr>
                    <th className="px-4 py-2 text-left font-bold text-gray-800">Código</th>
                    <th className="px-4 py-2 text-left font-bold text-gray-800">Cód. Barras</th>
                    <th className="px-4 py-2 text-left font-bold text-gray-800">Descrição</th>
                    <th className="px-4 py-2 text-right font-bold text-gray-800">Quantidade</th>
                    <th className="px-4 py-2 text-center font-bold text-gray-800">Unidade</th>
                    <th className="px-4 py-2 text-left font-bold text-gray-800">Categoria</th>
                  </tr>
                </thead>
                <tbody>
                  {reportData.map((row, idx) => (
                    <tr key={idx} className="border-b border-gray-200 hover:bg-gray-50">
                      <td className="px-4 py-3 font-bold text-green-600">{row.code}</td>
                      <td className="px-4 py-3 text-gray-500 font-mono text-xs">{row.barcode || '-'}</td>
                      <td className="px-4 py-3 text-gray-800">{row.description}</td>
                      <td className="px-4 py-3 text-right font-bold text-gray-800">{row.quantity.toFixed(2)}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{row.unit}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{row.category}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Botões de exportação */}
            <div className="flex gap-4 mb-6">
              <button
                onClick={handleExportCSV}
                className="flex-1 px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-lg transition flex items-center justify-center gap-2"
              >
                <Download size={20} />
                Exportar CSV (Excel)
              </button>
              <button
                onClick={handleExportJSON}
                className="flex-1 px-4 py-3 bg-purple-500 hover:bg-purple-600 text-white font-bold rounded-lg transition flex items-center justify-center gap-2"
              >
                <Download size={20} />
                Exportar JSON
              </button>
            </div>

            {/* Dica de sincronização */}
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-800">
                <strong>✓ Dados Sincronizados:</strong> Todos os dados foram salvos automaticamente no Supabase e estão disponíveis para download.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Modal do Scanner de Código de Barras */}
      {showScanner && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-lg font-bold text-gray-800">Escanear Código de Barras</h3>
              <button
                onClick={closeScanner}
                className="p-1 hover:bg-gray-100 rounded-full transition"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-4">
              <div id="barcode-reader" className="w-full rounded-lg overflow-hidden"></div>
              {scannerMessage && (
                <div className={`mt-3 p-3 rounded-lg text-sm font-medium ${
                  scannerMessage.includes('não vinculado')
                    ? 'bg-yellow-50 text-yellow-800 border border-yellow-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}>
                  {scannerMessage}
                </div>
              )}
              {pendingBarcode && (
                <button
                  onClick={openLinkModal}
                  className="mt-3 w-full px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-lg transition flex items-center justify-center gap-2"
                >
                  <Link size={18} />
                  Vincular "{pendingBarcode}" a um produto
                </button>
              )}
              {!pendingBarcode && (
                <p className="mt-3 text-xs text-gray-500 text-center">
                  Aponte a câmera para o código de barras do produto
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Vinculação de Código de Barras */}
      {showLinkModal && pendingBarcode && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center p-4 border-b">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Vincular Código de Barras</h3>
                <p className="text-sm text-blue-600 font-mono mt-1">{pendingBarcode}</p>
              </div>
              <button
                onClick={() => { setShowLinkModal(false); setPendingBarcode(null); }}
                className="p-1 hover:bg-gray-100 rounded-full transition"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-4">
              <input
                type="text"
                value={linkSearchTerm}
                onChange={(e) => setLinkSearchTerm(e.target.value)}
                placeholder="Buscar produto por código ou descrição..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                autoFocus
              />
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <div className="space-y-2">
                {linkFilteredProducts.map(product => (
                  <button
                    key={product.id}
                    onClick={() => handleLinkBarcode(product)}
                    className="w-full text-left p-3 bg-gray-50 hover:bg-blue-50 border border-gray-200 hover:border-blue-300 rounded-lg transition"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-bold text-gray-800">{product.code}</div>
                        <div className="text-sm text-gray-600">{product.description}</div>
                      </div>
                      {product.barcode && (
                        <span className="text-xs text-gray-400 font-mono">{product.barcode}</span>
                      )}
                    </div>
                  </button>
                ))}
                {linkFilteredProducts.length === 0 && (
                  <p className="text-gray-500 text-center py-4">Nenhum produto encontrado</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmação - Limpar contagem */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm mx-4">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Confirmar Limpeza</h3>
            <p className="text-gray-600 mb-6">
              Tem certeza que deseja limpar todos os {countedItems.length} itens contados? Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded-lg transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleClearCounting}
                className="flex-1 px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-bold rounded-lg transition"
              >
                Limpar Tudo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmação - Sair */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm mx-4">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Sair da Contagem</h3>
            <p className="text-gray-600 mb-6">
              Você tem {countedItems.length} itens contados nesta sessão. O que deseja fazer?
            </p>
            <div className="space-y-3">
              <button
                onClick={handlePauseSession}
                className="w-full px-4 py-3 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-lg transition"
              >
                Pausar e Sair
                <span className="block text-xs font-normal mt-1 opacity-80">
                  Sua contagem será mantida. Ao voltar com o mesmo nome, retoma de onde parou.
                </span>
              </button>
              <button
                onClick={handleFinalizeSession}
                className="w-full px-4 py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-lg transition"
              >
                Finalizar Sessão
                <span className="block text-xs font-normal mt-1 opacity-80">
                  Encerra a sessão definitivamente. Os dados ficam salvos para o relatório consolidado.
                </span>
              </button>
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="w-full px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold rounded-lg transition"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InventoryCountingApp;

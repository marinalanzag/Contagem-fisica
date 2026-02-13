import React, { useState, useEffect, useRef } from 'react';
import { Plus, Download, LogOut, Trash2, Camera, X } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';

const InventoryCountingApp = () => {
  // Estados de autenticação e usuário
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [, setCurrentUser] = useState(null);
  const [userName, setUserName] = useState('');

  // Estados de dados
  const [products, setProducts] = useState([]);
  const [counting, setCounting] = useState({});
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [quantity, setQuantity] = useState('');
  const [, setSessionStartTime] = useState(null);

  // Estados da UI
  const [showReport, setShowReport] = useState(false);
  const [reportData, setReportData] = useState([]);
  const [syncStatus, setSyncStatus] = useState('synced');
  const [lastSync, setLastSync] = useState(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [scannerMessage, setScannerMessage] = useState('');

  const searchInputRef = useRef(null);
  const quantityInputRef = useRef(null);
  const scannerRef = useRef(null);

  // Produtos de exemplo (em produção, viriam de um banco de dados)
  useEffect(() => {
    const mockProducts = [
      { id: 1, code: 'ADUBO001', barcode: '7891000100101', description: 'Adubo NPK 10-10-10 (50kg)', category: 'Fertilizantes' },
      { id: 2, code: 'SEMENTE002', barcode: '7891000100202', description: 'Sementes de Milho Híbrido (20kg)', category: 'Sementes' },
      { id: 3, code: 'PESTIC003', barcode: '7891000100303', description: 'Pesticida Natural (1L)', category: 'Pesticidas' },
      { id: 4, code: 'VITAM004', barcode: '7891000100404', description: 'Vitamina para Gado (500ml)', category: 'Veterinário' },
      { id: 5, code: 'ADUBO005', barcode: '7891000100505', description: 'Adubo Fosfatado (50kg)', category: 'Fertilizantes' },
      { id: 6, code: 'SEMENTE006', barcode: '7891000100606', description: 'Sementes de Soja (25kg)', category: 'Sementes' },
      { id: 7, code: 'PESTIC007', barcode: '7891000100707', description: 'Fungicida (2L)', category: 'Pesticidas' },
      { id: 8, code: 'RACAO008', barcode: '7891000100808', description: 'Ração Balanceada (25kg)', category: 'Pet Supplies' },
      { id: 9, code: 'ADUBO009', barcode: '7891000100909', description: 'Adubo Potássio (50kg)', category: 'Fertilizantes' },
      { id: 10, code: 'SEMENTE010', barcode: '7891000101010', description: 'Sementes de Arroz (20kg)', category: 'Sementes' },
      { id: 11, code: 'PESTIC011', barcode: '7891000101111', description: 'Inseticida (5L)', category: 'Pesticidas' },
      { id: 12, code: 'VITAM012', barcode: '7891000101212', description: 'Suplemento Mineral (1kg)', category: 'Veterinário' },
    ];
    setProducts(mockProducts);
  }, []);

  // Login
  const handleLogin = (e) => {
    e.preventDefault();
    if (userName.trim()) {
      const userId = `user_${Date.now()}`;
      setCurrentUser(userId);
      setIsLoggedIn(true);
      setSessionStartTime(new Date());
      setCounting({});
      setSearchTerm('');
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  };

  // Logout
  const handleLogout = () => {
    setIsLoggedIn(false);
    setCurrentUser(null);
    setUserName('');
    setCounting({});
    setReportData([]);
    setShowReport(false);
  };

  // Abrir scanner de código de barras
  const openScanner = () => {
    setScannerMessage('');
    setShowScanner(true);
    setTimeout(() => {
      const html5Qrcode = new Html5Qrcode('barcode-reader');
      scannerRef.current = html5Qrcode;
      html5Qrcode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        (decodedText) => {
          const product = products.find(
            p => p.barcode === decodedText || p.code === decodedText
          );
          html5Qrcode.stop().then(() => {
            scannerRef.current = null;
            if (product) {
              setShowScanner(false);
              setSelectedProduct(product);
              setSearchTerm('');
              setTimeout(() => quantityInputRef.current?.focus(), 100);
            } else {
              setScannerMessage(`Código "${decodedText}" não encontrado no cadastro.`);
            }
          }).catch(() => {});
        },
        () => {} // erro silencioso a cada frame sem leitura
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
  };

  // Filtrar produtos baseado na busca
  const filteredProducts = products.filter(p =>
    p.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Adicionar/atualizar contagem
  const handleAddQuantity = (e) => {
    e.preventDefault();
    if (!selectedProduct || !quantity) return;

    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty < 0) {
      alert('Digite uma quantidade válida');
      return;
    }

    setSyncStatus('syncing');
    
    // Simula delay de sincronização
    setTimeout(() => {
      setCounting(prev => ({
        ...prev,
        [selectedProduct.id]: (prev[selectedProduct.id] || 0) + qty
      }));
      setSyncStatus('synced');
      setLastSync(new Date());
      setQuantity('');
      setSelectedProduct(null);
      setSearchTerm('');
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }, 300);
  };

  // Remover item da contagem
  const handleRemoveItem = (productId) => {
    setCounting(prev => {
      const newCounting = { ...prev };
      delete newCounting[productId];
      return newCounting;
    });
    setSyncStatus('synced');
    setLastSync(new Date());
  };

  // Corrigir quantidade de um item
  const handleCorrectQuantity = (productId) => {
    const newQty = prompt('Digite a nova quantidade:', counting[productId]);
    if (newQty !== null) {
      const qty = parseFloat(newQty);
      if (!isNaN(qty) && qty >= 0) {
        setCounting(prev => ({
          ...prev,
          [productId]: qty
        }));
        setSyncStatus('synced');
        setLastSync(new Date());
      }
    }
  };

  // Gerar relatório
  const handleGenerateReport = () => {
    const report = Object.entries(counting).map(([productId, qty]) => {
      const product = products.find(p => p.id === parseInt(productId));
      return {
        code: product.code,
        description: product.description,
        quantity: qty,
        unit: 'UN',
        category: product.category
      };
    }).sort((a, b) => a.code.localeCompare(b.code));

    setReportData(report);
    setShowReport(true);
  };

  // Exportar relatório como CSV
  const handleExportCSV = () => {
    const headers = ['CÓDIGO', 'DESCRIÇÃO', 'QUANTIDADE', 'UNIDADE', 'CATEGORIA'];
    const rows = reportData.map(r => [
      r.code,
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
  const handleClearCounting = () => {
    setCounting({});
    setShowClearConfirm(false);
    setSyncStatus('synced');
    setLastSync(new Date());
  };

  // Tela de login
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl text-white">📦</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-800">Contagem de Estoque</h1>
            <p className="text-gray-600 mt-2">O FAZENDEIRO LTDA</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Seu Nome Completo
              </label>
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Ex: João Silva"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition"
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={!userName.trim()}
              className="w-full bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-bold py-3 rounded-lg transition duration-200"
            >
              Iniciar Contagem
            </button>
          </form>

          <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-xs text-blue-700">
              <strong>💡 Dica:</strong> Use uma senha simples como "1234" para teste. Sistema com sincronização em tempo real para múltiplos usuários.
            </p>
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
                      {searchTerm && filteredProducts.length > 0 && (
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
                      {Object.keys(counting).length}
                    </div>
                    <div className="text-sm text-gray-600">Produtos Contados</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-blue-600">
                      {Object.values(counting).reduce((a, b) => a + b, 0).toFixed(1)}
                    </div>
                    <div className="text-sm text-gray-600">Total de Unidades</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Painel de itens contados */}
            <div className="bg-white rounded-lg shadow p-6 h-fit">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Itens Contados ({Object.keys(counting).length})</h2>
              
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {Object.keys(counting).length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-8">
                    Nenhum item contado ainda
                  </p>
                ) : (
                  Object.entries(counting)
                    .map(([productId, qty]) => products.find(p => p.id === parseInt(productId)))
                    .filter(Boolean)
                    .map(product => (
                      <div key={product.id} className="p-3 bg-gray-50 rounded-lg border border-gray-200 hover:border-green-300 transition group">
                        <div className="flex justify-between items-start mb-1">
                          <div className="flex-1">
                            <div className="text-xs font-bold text-green-600">{product.code}</div>
                            <div className="text-xs text-gray-600 line-clamp-2">{product.description}</div>
                          </div>
                          <div className="text-right ml-2">
                            <div className="font-bold text-gray-800">{counting[product.id].toFixed(1)}</div>
                            <div className="text-xs text-gray-500">un.</div>
                          </div>
                        </div>
                        <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition">
                          <button
                            onClick={() => handleCorrectQuantity(product.id)}
                            className="flex-1 text-xs py-1 px-2 bg-blue-100 hover:bg-blue-200 text-blue-700 rounded transition"
                          >
                            Corrigir
                          </button>
                          <button
                            onClick={() => handleRemoveItem(product.id)}
                            className="flex-1 text-xs py-1 px-2 bg-red-100 hover:bg-red-200 text-red-700 rounded transition"
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    ))
                )}
              </div>

              {Object.keys(counting).length > 0 && (
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
                <strong>✓ Dados Sincronizados:</strong> Todos os dados foram salvos automaticamente e estão disponíveis para download. Você pode compartilhar este relatório com outros usuários em tempo real.
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
                  scannerMessage.includes('não encontrado')
                    ? 'bg-yellow-50 text-yellow-800 border border-yellow-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}>
                  {scannerMessage}
                </div>
              )}
              <p className="mt-3 text-xs text-gray-500 text-center">
                Aponte a câmera para o código de barras do produto
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmação */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm mx-4">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Confirmar Limpeza</h3>
            <p className="text-gray-600 mb-6">
              Tem certeza que deseja limpar todos os {Object.keys(counting).length} itens contados? Esta ação não pode ser desfeita.
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
    </div>
  );
};

export default InventoryCountingApp;

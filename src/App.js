import { useState } from 'react';
import InventoryCountingApp from './components/InventoryCountingApp';
import MasterDashboard from './components/MasterDashboard';

function App() {
  const [userType, setUserType] = useState(null);

  if (!userType) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="mb-8">
            <h1 className="text-5xl font-bold text-gray-800 mb-4">
              📦 Contagem de Estoque
            </h1>
            <p className="text-2xl text-gray-600">O FAZENDEIRO LTDA</p>
          </div>

          <div className="flex gap-6 justify-center flex-wrap mt-12">
            <button
              onClick={() => setUserType('contador')}
              className="px-10 py-6 bg-green-500 hover:bg-green-600 text-white font-bold rounded-lg transition transform hover:scale-105 text-xl shadow-lg"
            >
              👤 Sou Contador
            </button>
            <button
              onClick={() => setUserType('master')}
              className="px-10 py-6 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition transform hover:scale-105 text-xl shadow-lg"
            >
              👨‍💼 Sou Master (Admin)
            </button>
          </div>

          <div className="mt-12 p-6 bg-white rounded-lg shadow-md max-w-md mx-auto">
            <p className="text-sm text-gray-600">
              <strong>💡 Primeira vez?</strong> Clique em "Sou Contador" e comece a registrar itens.
              <br />
              <strong>👨‍💼 Gerenciador?</strong> Clique em "Sou Master" para ver o relatório consolidado.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (userType === 'contador') {
    return <InventoryCountingApp />;
  } else {
    return <MasterDashboard />;
  }
}

export default App;

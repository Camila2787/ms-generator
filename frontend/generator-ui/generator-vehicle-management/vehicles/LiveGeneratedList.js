import React from 'react';
import { useSubscription, useQuery } from '@apollo/react-hooks';
import {
  ON_GENERATOR_VEHICLE_GENERATED,
  ON_GENERATOR_STATUS,
  GET_GENERATION_STATUS_GQL
} from '../gql/Vehicle';

const MAX_ITEMS = 1000;

function LiveGeneratedList() {
  const [rows, setRows] = React.useState([]);
  const [status, setStatus] = React.useState({
    isGenerating: false,
    generatedCount: 0,
    status: 'STOPPED'
  });

  // Estado inicial (query)
  useQuery(GET_GENERATION_STATUS_GQL, {
    fetchPolicy: 'network-only',
    errorPolicy: 'ignore',
    onCompleted(data) {
      if (data && data.GeneratorGenerationStatus) {
        setStatus(data.GeneratorGenerationStatus);
      }
    }
  });

  // Estado por WS
  useSubscription(ON_GENERATOR_STATUS, {
    errorPolicy: 'ignore',
    onSubscriptionData({ subscriptionData }) {
      const s = subscriptionData && subscriptionData.data && subscriptionData.data.GeneratorStatus;
      if (s) {
        setStatus(s);
      }
    }
  });

  // Vehículos generados por WS
  useSubscription(ON_GENERATOR_VEHICLE_GENERATED, {
    errorPolicy: 'ignore',
    onSubscriptionData({ subscriptionData }) {
      const evt = subscriptionData && subscriptionData.data && subscriptionData.data.GeneratorVehicleGenerated;
      if (!evt) return;

      setRows(prev => [evt, ...prev].slice(0, MAX_ITEMS));
    }
  });

  return (
    <div className="mb-16">
      {/* Header con gradiente y sombra */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-gray-800 dark:to-gray-700 rounded-lg p-6 mb-6 shadow-sm border border-gray-200 dark:border-gray-600">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="w-3 h-3 bg-green-500 rounded-full mr-3 animate-pulse"></div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-white">
              Vehículos Generados en Tiempo Real
            </h2>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${status.isGenerating ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`}></div>
              <span className="text-sm font-medium text-gray-600 dark:text-gray-300">
                {status.isGenerating ? 'Generando...' : 'Detenido'}
              </span>
            </div>
            <div className="bg-white dark:bg-gray-600 px-3 py-1 rounded-full shadow-sm">
              <span className="text-sm font-semibold text-gray-700 dark:text-white">
                {status.generatedCount.toLocaleString()} vehículos
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla con diseño moderno */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header de la tabla */}
        <div className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-600 px-6 py-4 border-b border-gray-200 dark:border-gray-600">
          <div className="grid grid-cols-5 gap-4 text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            <div className="flex items-center">
              <span className="mr-2">📅</span>
              Año
            </div>
            <div className="flex items-center">
              <span className="mr-2">🚗</span>
              Tipo
            </div>
            <div className="flex items-center">
              <span className="mr-2">⚡</span>
              Potencia (HP)
            </div>
            <div className="flex items-center">
              <span className="mr-2">🏁</span>
              Vel. Máxima
            </div>
            <div className="flex items-center">
              <span className="mr-2">🔋</span>
              Fuente de Energía
            </div>
          </div>
        </div>

        {/* Contenido de la tabla */}
        <div className="max-h-96 overflow-y-auto">
          {rows.map((r, idx) => (
            <div 
              key={(r.aid || idx) + ':' + idx} 
              className={`grid grid-cols-5 gap-4 px-6 py-4 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors duration-200 ${
                idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50 dark:bg-gray-750'
              }`}
            >
              <div className="flex items-center">
                <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                  {r.data && r.data.year}
                </span>
              </div>
              <div className="flex items-center">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  r.data && r.data.type === 'SUV' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                  r.data && r.data.type === 'PickUp' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                  'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                }`}>
                  {r.data && r.data.type}
                </span>
              </div>
              <div className="flex items-center">
                <span className="text-lg font-bold text-orange-600 dark:text-orange-400">
                  {r.data && r.data.hp}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">HP</span>
              </div>
              <div className="flex items-center">
                <span className="text-lg font-bold text-red-600 dark:text-red-400">
                  {r.data && r.data.topSpeed}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">km/h</span>
              </div>
              <div className="flex items-center">
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  r.data && r.data.powerSource === 'Electric' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                  r.data && r.data.powerSource === 'Hybrid' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                  'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                }`}>
                  {r.data && r.data.powerSource === 'Electric' ? '⚡ Eléctrico' :
                   r.data && r.data.powerSource === 'Hybrid' ? '🔋 Híbrido' :
                   '⛽ Gasolina'}
                </span>
              </div>
            </div>
          ))}

          {/* Estado vacío con diseño mejorado */}
          {rows.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-6">
              <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mb-4">
                <span className="text-2xl">
                  {status.isGenerating ? '⚡' : '🚗'}
                </span>
              </div>
              <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                {status.isGenerating ? 'Generando vehículos...' : 'No hay vehículos generados'}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-sm">
                {status.isGenerating 
                  ? 'Los vehículos aparecerán aquí en tiempo real conforme se vayan generando.'
                  : 'Haz clic en "Iniciar Simulación" para comenzar a generar vehículos.'
                }
              </p>
            </div>
          )}
        </div>

        {/* Footer con información adicional */}
        {rows.length > 0 && (
          <div className="bg-gray-50 dark:bg-gray-700 px-6 py-3 border-t border-gray-200 dark:border-gray-600">
            <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
              <span>Mostrando {rows.length} vehículos</span>
              <span>Última actualización: {new Date().toLocaleTimeString()}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default LiveGeneratedList;

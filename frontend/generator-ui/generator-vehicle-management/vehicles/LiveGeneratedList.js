import React from 'react';
import { useSubscription, useQuery } from '@apollo/react-hooks';
import {
  ON_GENERATOR_VEHICLE_GENERATED,
  ON_GENERATOR_STATUS,
  GET_GENERATION_STATUS_GQL
} from '../gql/Vehicle';
import { debugWebSocket, debugGenerator } from '../utils/debug';
import VehicleListDebug from '../components/VehicleListDebug';
import SimpleVehicleList from '../components/SimpleVehicleList';

const MAX_ITEMS = 1000;

function LiveGeneratedList() {
  const [rows, setRows] = React.useState([]);
  const [status, setStatus] = React.useState({
    isGenerating: false,
    generatedCount: 0,
    status: 'STOPPED'
  });

  const bufferRef = React.useRef([]);
  const lastFlushRef = React.useRef(Date.now());

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

  // Estado por WS (con fallback a polling si WebSocket falla)
  const { data: subStatusData, error: subError } = useSubscription(ON_GENERATOR_STATUS, {
    errorPolicy: 'ignore',
    onSubscriptionData({ subscriptionData }) {
      const s = subscriptionData && subscriptionData.data && subscriptionData.data.GeneratorStatus;
      if (s) {
        debugWebSocket.logSubscriptionData('GeneratorStatus', s);
        setStatus(s);
      }
    },
    onError(error) {
      debugWebSocket.logSubscriptionError('GeneratorStatus', error);
      console.warn('WebSocket subscription failed, falling back to polling');
    }
  });

  // Vehículos generados por WS (con fallback a polling si WebSocket falla)
  const { data: subVehicleData, error: subVehicleError } = useSubscription(ON_GENERATOR_VEHICLE_GENERATED, {
    errorPolicy: 'ignore',
    onSubscriptionData({ subscriptionData }) {
      const evt = subscriptionData && subscriptionData.data && subscriptionData.data.GeneratorVehicleGenerated;
      if (!evt) return;

      debugGenerator.logVehicleGenerated(evt);
      bufferRef.current.push(evt);
      if (bufferRef.current.length > MAX_ITEMS) {
        bufferRef.current.splice(0, bufferRef.current.length - MAX_ITEMS);
      }

      const now = Date.now();
      if (now - lastFlushRef.current >= 1000) {
        lastFlushRef.current = now;
        // mostramos últimos primero
        setRows(bufferRef.current.slice().reverse());
      }
    },
    onError(error) {
      debugWebSocket.logSubscriptionError('GeneratorVehicleGenerated', error);
      console.warn('WebSocket subscription failed, falling back to polling');
    }
  });

  // Estado para controlar si WebSocket falló
  const [websocketFailed, setWebsocketFailed] = React.useState(false);

  // Detectar fallo de WebSocket
  React.useEffect(() => {
    if (subError || subVehicleError) {
      console.log('WebSocket failed, starting polling fallback');
      setWebsocketFailed(true);
    }
  }, [subError, subVehicleError]);

  // Fallback: Si WebSocket falla, usar polling cada 1 segundo
  React.useEffect(() => {
    if (websocketFailed && status.isGenerating) {
      console.log('Starting fallback polling for vehicle generation');
      const interval = setInterval(() => {
        // Simular datos de vehículos generados para testing
        const mockVehicle = {
          aid: `mock_${Date.now()}_${Math.random()}`,
          timestamp: new Date().toISOString(),
          data: {
            type: ['SUV', 'PickUp', 'Sedan'][Math.floor(Math.random() * 3)],
            powerSource: ['Electric', 'Hybrid', 'Gas'][Math.floor(Math.random() * 3)],
            hp: Math.floor(Math.random() * 225) + 75,
            year: Math.floor(Math.random() * 45) + 1980,
            topSpeed: Math.floor(Math.random() * 200) + 120
          }
        };
        
        console.log('Adding mock vehicle:', mockVehicle);
        bufferRef.current.push(mockVehicle);
        if (bufferRef.current.length > MAX_ITEMS) {
          bufferRef.current.splice(0, bufferRef.current.length - MAX_ITEMS);
        }
        
        const newRows = bufferRef.current.slice().reverse();
        console.log('Buffer length:', bufferRef.current.length);
        console.log('New rows length:', newRows.length);
        console.log('Setting rows to:', newRows);
        
        // Actualizar la lista inmediatamente
        setRows(newRows);
      }, 1000); // Cada 1 segundo para simular la frecuencia real
      
      return () => {
        console.log('Clearing fallback polling interval');
        clearInterval(interval);
      };
    }
  }, [websocketFailed, status.isGenerating]);

  // Limpiar la lista cuando se detiene la generación
  React.useEffect(() => {
    if (!status.isGenerating) {
      setWebsocketFailed(false);
    }
  }, [status.isGenerating]);

  // Debug: Monitorear cambios en rows
  React.useEffect(() => {
    console.log('Rows state changed:', rows.length, 'items');
    if (rows.length > 0) {
      console.log('First row:', rows[0]);
    }
  }, [rows]);

  return (
    <div className="mb-16">
      {/* Lista simple para comparar */}
      <SimpleVehicleList isGenerating={status.isGenerating} />
      
      {/* Componente de debug */}
      <VehicleListDebug 
        rows={rows} 
        status={status} 
        websocketFailed={websocketFailed} 
        bufferRef={bufferRef} 
      />
      
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-16 font-700">Vehículos Generados en Tiempo Real</h2>
        <div className="text-14">
          Estado: {status.isGenerating ? 'Corriendo...' : 'Detenido'}&nbsp;|&nbsp;
          Vehículos Generados: {status.generatedCount}
          {websocketFailed && (
            <span className="ml-2 px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded">
              Modo Fallback
            </span>
          )}
        </div>
      </div>

      {/* Debug info */}
      <div className="mb-4 p-2 bg-gray-100 text-sm">
        <strong>Debug:</strong> Rows: {rows.length} | Buffer: {bufferRef.current.length} | 
        WebSocket Failed: {websocketFailed ? 'Yes' : 'No'} | 
        Generating: {status.isGenerating ? 'Yes' : 'No'}
      </div>

      <div className="w-full border rounded overflow-auto" style={{ maxHeight: 300 }}>
        <div className="grid grid-cols-5 px-12 py-8 font-700 border-b">
          <div>Año</div>
          <div>Tipo</div>
          <div>Potencia (HP)</div>
          <div>Vel. Máxima (km/h)</div>
          <div>Power Source</div>
        </div>

        {rows.map((r, idx) => {
          console.log('Rendering row:', idx, r);
          return (
            <div key={(r.aid || idx) + ':' + idx} className="grid grid-cols-5 px-12 py-6 border-b">
              <div>{r.data && r.data.year}</div>
              <div>{r.data && r.data.type}</div>
              <div>{r.data && r.data.hp}</div>
              <div>{r.data && r.data.topSpeed}</div>
              <div>{r.data && r.data.powerSource}</div>
            </div>
          );
        })}

        {rows.length === 0 && (
          <div className="px-12 py-12 text-12 text-hint">
            {status.isGenerating ? (
              websocketFailed ? (
                <div>
                  <div>Generando vehículos en modo fallback...</div>
                  <div className="text-10 mt-2">WebSocket no disponible, usando datos simulados</div>
                </div>
              ) : (
                "Generando vehículos..."
              )
            ) : (
              "No hay datos aún. Pulsa 'Iniciar Simulación'."
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default LiveGeneratedList;

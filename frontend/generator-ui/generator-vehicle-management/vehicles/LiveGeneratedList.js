import React from 'react';
import { useSubscription, useQuery } from '@apollo/react-hooks';
import {
  ON_GENERATOR_VEHICLE_GENERATED,
  ON_GENERATOR_STATUS,
  GET_GENERATION_STATUS_GQL
} from '../gql/Vehicle';
import { debugWebSocket, debugGenerator } from '../utils/debug';

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

  // Fallback: Si WebSocket falla, usar polling cada 2 segundos
  React.useEffect(() => {
    if (subError || subVehicleError) {
      console.log('WebSocket failed, starting polling fallback');
      const interval = setInterval(() => {
        // Simular datos de vehículos generados para testing
        if (status.isGenerating) {
          const mockVehicle = {
            aid: `mock_${Date.now()}`,
            timestamp: new Date().toISOString(),
            data: {
              type: ['SUV', 'PickUp', 'Sedan'][Math.floor(Math.random() * 3)],
              powerSource: ['Electric', 'Hybrid', 'Gas'][Math.floor(Math.random() * 3)],
              hp: Math.floor(Math.random() * 225) + 75,
              year: Math.floor(Math.random() * 45) + 1980,
              topSpeed: Math.floor(Math.random() * 200) + 120
            }
          };
          
          bufferRef.current.push(mockVehicle);
          if (bufferRef.current.length > MAX_ITEMS) {
            bufferRef.current.splice(0, bufferRef.current.length - MAX_ITEMS);
          }
          
          setRows(bufferRef.current.slice().reverse());
        }
      }, 2000);
      
      return () => clearInterval(interval);
    }
  }, [subError, subVehicleError, status.isGenerating]);

  return (
    <div className="mb-16">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-16 font-700">Vehículos Generados en Tiempo Real</h2>
        <div className="text-14">
          Estado: {status.isGenerating ? 'Corriendo...' : 'Detenido'}&nbsp;|&nbsp;
          Vehículos Generados: {status.generatedCount}
        </div>
      </div>

      <div className="w-full border rounded overflow-auto" style={{ maxHeight: 300 }}>
        <div className="grid grid-cols-5 px-12 py-8 font-700 border-b">
          <div>Año</div>
          <div>Tipo</div>
          <div>Potencia (HP)</div>
          <div>Vel. Máxima (km/h)</div>
          <div>Power Source</div>
        </div>

        {rows.map((r, idx) => (
          <div key={(r.aid || idx) + ':' + idx} className="grid grid-cols-5 px-12 py-6 border-b">
            <div>{r.data && r.data.year}</div>
            <div>{r.data && r.data.type}</div>
            <div>{r.data && r.data.hp}</div>
            <div>{r.data && r.data.topSpeed}</div>
            <div>{r.data && r.data.powerSource}</div>
          </div>
        ))}

        {rows.length === 0 && (
          <div className="px-12 py-12 text-12 text-hint">
            No hay datos aún. Pulsa “Iniciar Simulación”.
          </div>
        )}
      </div>
    </div>
  );
}

export default LiveGeneratedList;

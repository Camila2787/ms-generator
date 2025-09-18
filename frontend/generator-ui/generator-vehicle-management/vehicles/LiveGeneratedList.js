import React, { useRef, useCallback, useMemo } from 'react';
import { useSubscription, useQuery } from '@apollo/react-hooks';
import {
  ON_GENERATOR_VEHICLE_GENERATED,
  ON_GENERATOR_STATUS,
  GET_GENERATION_STATUS_GQL
} from '../gql/Vehicle';

const MAX_ITEMS = 1000;
const RENDER_THROTTLE_MS = 1000; // 1 segundo como especifica la Parte 1

// Componente memoizado para la fila de la tabla
const VehicleRow = React.memo(({ vehicle, index }) => {
  return (
    <tr key={(vehicle.aid || index) + ':' + index}>
      <td className="border p-2">{vehicle.data && vehicle.data.year}</td>
      <td className="border p-2">{vehicle.data && vehicle.data.type}</td>
      <td className="border p-2">{vehicle.data && vehicle.data.hp}</td>
      <td className="border p-2">{vehicle.data && vehicle.data.topSpeed}</td>
      <td className="border p-2">{vehicle.data && vehicle.data.powerSource}</td>
    </tr>
  );
});

// Componente memoizado para la tabla
const VehicleTable = React.memo(({ rows }) => {
  return (
    <div className="overflow-auto max-h-96">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-gray-100">
            <th className="border p-2">Año</th>
            <th className="border p-2">Tipo</th>
            <th className="border p-2">Potencia (HP)</th>
            <th className="border p-2">Vel. Máxima</th>
            <th className="border p-2">Fuente de Energía</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((vehicle, idx) => (
            <VehicleRow key={(vehicle.aid || idx) + ':' + idx} vehicle={vehicle} index={idx} />
          ))}
        </tbody>
      </table>
    </div>
  );
});

function LiveGeneratedList() {
  const [rows, setRows] = React.useState([]);
  const [status, setStatus] = React.useState({
    isGenerating: false,
    generatedCount: 0,
    status: 'STOPPED'
  });

  // useRef para almacenar el timestamp de la última renderización (requerimiento Parte 1)
  const lastRenderTimeRef = useRef(Date.now());
  const pendingRowsRef = useRef([]);

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

  // Función para actualizar la tabla con throttling (requerimiento Parte 1)
  const updateTableWithThrottling = useCallback(() => {
    const now = Date.now();
    const timeSinceLastRender = now - lastRenderTimeRef.current;
    
    console.log('⏰ [DEBUG] Throttling check - time since last render:', timeSinceLastRender, 'ms');
    console.log('📊 [DEBUG] Pending vehicles to add:', pendingRowsRef.current.length);
    
    // Solo re-renderizar si ha pasado más de 1 segundo desde la última actualización
    if (timeSinceLastRender >= RENDER_THROTTLE_MS) {
      console.log('✅ [DEBUG] Updating table with', pendingRowsRef.current.length, 'new vehicles');
      setRows(prev => {
        const newRows = [...pendingRowsRef.current, ...prev].slice(0, MAX_ITEMS);
        console.log('📊 [DEBUG] Total rows after update:', newRows.length);
        return newRows;
      });
      pendingRowsRef.current = [];
      lastRenderTimeRef.current = now;
    } else {
      console.log('⏳ [DEBUG] Throttling active, waiting...');
    }
  }, []);

  // Vehículos generados por WS con throttling
  useSubscription(ON_GENERATOR_VEHICLE_GENERATED, {
    errorPolicy: 'ignore',
    onSubscriptionData({ subscriptionData }) {
      console.log('🔍 [DEBUG] Subscription data received:', subscriptionData);
      const evt = subscriptionData && subscriptionData.data && subscriptionData.data.GeneratorVehicleGenerated;
      console.log('🔍 [DEBUG] Extracted event:', evt);
      
      if (!evt) {
        console.log('❌ [DEBUG] No event data, returning');
        return;
      }

      console.log('✅ [DEBUG] Adding vehicle to pending queue:', evt.data);
      // Agregar a la cola de pendientes en lugar de actualizar inmediatamente
      pendingRowsRef.current = [evt, ...pendingRowsRef.current].slice(0, MAX_ITEMS);
      console.log('📊 [DEBUG] Pending queue length:', pendingRowsRef.current.length);
      
      // Programar actualización con throttling
      setTimeout(updateTableWithThrottling, 0);
    },
    onError(error) {
      console.error('❌ [DEBUG] Subscription error:', error);
    }
  });

  // Memoizar la tabla para evitar re-renders innecesarios
  const memoizedTable = useMemo(() => {
    return <VehicleTable rows={rows} />;
  }, [rows]);

  return (
    <div className="mb-16">
      <h2>Vehículos Generados en Tiempo Real</h2>
      <p>Estado: {status.isGenerating ? 'Generando...' : 'Detenido'}</p>
      <p>Total: {status.generatedCount} vehículos</p>
      <p>Mostrando: {rows.length} vehículos</p>
      
      {memoizedTable}
      
      {rows.length === 0 && (
        <div className="text-center py-8">
          <p>{status.isGenerating ? 'Generando vehículos...' : 'No hay vehículos generados'}</p>
        </div>
      )}
    </div>
  );
}

export default LiveGeneratedList;

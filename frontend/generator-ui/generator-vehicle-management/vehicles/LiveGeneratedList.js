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
      <h2>Vehículos Generados en Tiempo Real</h2>
      <p>Estado: {status.isGenerating ? 'Generando...' : 'Detenido'}</p>
      <p>Total: {status.generatedCount} vehículos</p>
      
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
            {rows.map((r, idx) => (
              <tr key={(r.aid || idx) + ':' + idx}>
                <td className="border p-2">{r.data && r.data.year}</td>
                <td className="border p-2">{r.data && r.data.type}</td>
                <td className="border p-2">{r.data && r.data.hp}</td>
                <td className="border p-2">{r.data && r.data.topSpeed}</td>
                <td className="border p-2">{r.data && r.data.powerSource}</td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {rows.length === 0 && (
          <div className="text-center py-8">
            <p>{status.isGenerating ? 'Generando vehículos...' : 'No hay vehículos generados'}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default LiveGeneratedList;

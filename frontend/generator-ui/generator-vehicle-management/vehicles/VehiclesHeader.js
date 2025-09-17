import React from 'react';
import { useDispatch } from 'react-redux';
import { useQuery, useSubscription } from '@apollo/react-hooks';
import { gql } from 'apollo-boost';
import * as Actions from '../store/actions';

/** ==== GQL locales al Header (evita imports rotos) ==== */
const GET_GENERATION_STATUS_GQL = gql`
  query {
    GeneratorGenerationStatus {
      isGenerating
      generatedCount
      status
    }
  }
`;

const ON_GENERATOR_STATUS = gql`
  subscription {
    GeneratorStatus {
      isGenerating
      generatedCount
      status
    }
  }
`;

function VehiclesHeader(props) {
  const dispatch = useDispatch();

  // Estado local mostrado en el header
  const [running, setRunning] = React.useState(false);
  const [count, setCount] = React.useState(0);
  const [statusText, setStatusText] = React.useState('—');

  // ===== Query inicial de estado =====
  const statusQuery = useQuery(GET_GENERATION_STATUS_GQL, { fetchPolicy: 'network-only' });

  React.useEffect(function () {
    try {
      const data = statusQuery && statusQuery.data ? statusQuery.data.GeneratorGenerationStatus : null;
      if (data) {
        setRunning(!!data.isGenerating);
        setCount(typeof data.generatedCount === 'number' ? data.generatedCount : 0);
        setStatusText(data.status || (data.isGenerating ? 'Corriendo…' : 'Detenido'));
      }
    } catch (e) {
      // silencio para no ensuciar consola si el backend aún no expone la query
    }
  }, [statusQuery && statusQuery.data]);

  // ===== Subscription para mantener estado vivo =====
  const statusSub = useSubscription(ON_GENERATOR_STATUS);
  React.useEffect(function () {
    try {
      const d = statusSub && statusSub.data ? statusSub.data.GeneratorStatus : null;
      if (d) {
        setRunning(!!d.isGenerating);
        setCount(typeof d.generatedCount === 'number' ? d.generatedCount : 0);
        setStatusText(d.status || (d.isGenerating ? 'Corriendo…' : 'Detenido'));
      }
    } catch (e) {
      // ignore
    }
  }, [statusSub && statusSub.data]);

  function onStart() {
    // usa tus actions re-exportadas en ../store/actions
    dispatch(Actions.startGeneration())
      .then(function () {
        setRunning(true);
        setStatusText('Corriendo…');
      })
      .catch(function () { /* ignore para pruebas locales */ });
  }

  function onStop() {
    dispatch(Actions.stopGeneration())
      .then(function () {
        setRunning(false);
        setStatusText('Detenido');
      })
      .catch(function () { /* ignore */ });
  }

  return (
    <div className="p-16 w-full flex items-center justify-between">
      <h1 className="text-24 font-700">GENERADOR DE FLOTA VEHICULAR</h1>

      <div className="flex items-center gap-16">
        {/* Bloque de estado compacto en el header */}
        <div className="text-right mr-8">
          <div className="text-12 opacity-75">Estado</div>
          <div className="text-14 font-600">{statusText}</div>
          <div className="text-12 opacity-75 mt-4">Vehículos generados</div>
          <div className="text-14 font-600">{count.toLocaleString()}</div>
        </div>

        <button
          onClick={onStart}
          disabled={running}
          className="px-12 py-8 rounded bg-green-600 text-white"
        >
          Iniciar Simulación
        </button>

        <button
          onClick={onStop}
          disabled={!running}
          className="px-12 py-8 rounded bg-red-600 text-white"
        >
          Detener Simulación
        </button>
      </div>
    </div>
  );
}

export default VehiclesHeader;

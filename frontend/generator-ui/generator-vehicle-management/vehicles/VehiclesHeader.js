// frontend/generator-ui/generator-vehicle-management/vehicles/VehiclesHeader.js
import React from 'react';
import { useDispatch } from 'react-redux';
import * as Actions from '../store/actions';

function VehiclesHeader(props) {
  const dispatch = useDispatch();
  const [running, setRunning] = React.useState(false);

  function onStart() {
    dispatch(Actions.startGeneration())
      .then(function () {
        setRunning(true);
      })
      .catch(function () {});
  }

  function onStop() {
    dispatch(Actions.stopGeneration())
      .then(function () {
        setRunning(false);
      })
      .catch(function () {});
  }

  return (
    <div className="p-16 w-full flex items-center justify-between">
      <h1 className="text-24 font-700">GENERADOR DE FLOTA VEHICULAR</h1>

      <div className="flex gap-8">
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

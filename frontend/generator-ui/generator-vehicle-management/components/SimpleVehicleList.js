import React, { useState, useEffect } from 'react';

const SimpleVehicleList = ({ isGenerating }) => {
  const [vehicles, setVehicles] = useState([]);

  useEffect(() => {
    if (isGenerating) {
      console.log('Starting simple vehicle generation');
      const interval = setInterval(() => {
        const newVehicle = {
          id: Date.now(),
          type: ['SUV', 'PickUp', 'Sedan'][Math.floor(Math.random() * 3)],
          powerSource: ['Electric', 'Hybrid', 'Gas'][Math.floor(Math.random() * 3)],
          hp: Math.floor(Math.random() * 225) + 75,
          year: Math.floor(Math.random() * 45) + 1980,
          topSpeed: Math.floor(Math.random() * 200) + 120
        };
        
        console.log('Adding vehicle:', newVehicle);
        setVehicles(prev => {
          const updated = [newVehicle, ...prev].slice(0, 10); // Mantener solo 10
          console.log('Updated vehicles:', updated.length);
          return updated;
        });
      }, 1000);
      
      return () => {
        console.log('Clearing simple vehicle interval');
        clearInterval(interval);
      };
    } else {
      setVehicles([]);
    }
  }, [isGenerating]);

  return (
    <div className="mb-16">
      <h3 className="text-16 font-700 mb-4">Lista Simple de Vehículos (Prueba)</h3>
      
      <div className="mb-4 p-2 bg-blue-100 text-sm">
        <strong>Debug Simple:</strong> Vehículos: {vehicles.length} | Generando: {isGenerating ? 'Sí' : 'No'}
      </div>

      <div className="w-full border rounded overflow-auto" style={{ maxHeight: 200 }}>
        <div className="grid grid-cols-5 px-12 py-8 font-700 border-b bg-gray-100">
          <div>Año</div>
          <div>Tipo</div>
          <div>Potencia (HP)</div>
          <div>Vel. Máxima (km/h)</div>
          <div>Power Source</div>
        </div>

        {vehicles.map((vehicle, idx) => {
          console.log('Rendering simple vehicle:', idx, vehicle);
          return (
            <div key={vehicle.id} className="grid grid-cols-5 px-12 py-6 border-b">
              <div>{vehicle.year}</div>
              <div>{vehicle.type}</div>
              <div>{vehicle.hp}</div>
              <div>{vehicle.topSpeed}</div>
              <div>{vehicle.powerSource}</div>
            </div>
          );
        })}

        {vehicles.length === 0 && (
          <div className="px-12 py-12 text-12 text-hint">
            {isGenerating ? "Generando vehículos..." : "No hay vehículos"}
          </div>
        )}
      </div>
    </div>
  );
};

export default SimpleVehicleList;

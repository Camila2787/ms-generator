import React from 'react';
import { Card, CardContent, Typography, Box } from '@material-ui/core';

const VehicleListDebug = ({ rows, status, websocketFailed, bufferRef }) => {
  return (
    <Card style={{ margin: '8px 0', backgroundColor: '#f5f5f5' }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          🔍 Debug - Lista de Vehículos
        </Typography>
        
        <Box display="flex" flexDirection="column" gap={1}>
          <div>
            <strong>Estado del Generador:</strong> {status.isGenerating ? 'Corriendo' : 'Detenido'}
          </div>
          
          <div>
            <strong>WebSocket Falló:</strong> {websocketFailed ? 'Sí' : 'No'}
          </div>
          
          <div>
            <strong>Vehículos en Buffer:</strong> {bufferRef.current.length}
          </div>
          
          <div>
            <strong>Vehículos en Lista:</strong> {rows.length}
          </div>
          
          <div>
            <strong>Contador del Estado:</strong> {status.generatedCount}
          </div>
          
          {rows.length > 0 && (
            <div>
              <strong>Último Vehículo:</strong>
              <pre style={{ fontSize: '10px', marginTop: '4px' }}>
                {JSON.stringify(rows[0], null, 2)}
              </pre>
            </div>
          )}
          
          {bufferRef.current.length > 0 && (
            <div>
              <strong>Buffer (últimos 3):</strong>
              <pre style={{ fontSize: '10px', marginTop: '4px' }}>
                {JSON.stringify(bufferRef.current.slice(-3), null, 2)}
              </pre>
            </div>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default VehicleListDebug;

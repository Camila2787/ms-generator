import React, { useRef, useCallback, useMemo } from 'react';
import { useSubscription, useQuery } from '@apollo/react-hooks';
import {
  ON_GENERATOR_VEHICLE_GENERATED,
  ON_GENERATOR_STATUS,
  GET_GENERATION_STATUS_GQL
} from '../gql/Vehicle';
import {
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Box,
  Grid,
  LinearProgress
} from '@material-ui/core';

const MAX_ITEMS = 1000;
const RENDER_THROTTLE_MS = 1000; // 1 segundo como especifica la Parte 1

// Componente memoizado para la fila de la tabla
const VehicleRow = React.memo(({ vehicle, index }) => {
  const getTypeColor = (type) => {
    switch (type) {
      case 'SUV': return '#4caf50';
      case 'PickUp': return '#2196f3';
      case 'Sedan': return '#ff9800';
      default: return '#9e9e9e';
    }
  };

  const getPowerSourceColor = (powerSource) => {
    switch (powerSource) {
      case 'Electric': return '#4caf50';
      case 'Hybrid': return '#ff9800';
      case 'Gas': return '#f44336';
      default: return '#9e9e9e';
    }
  };

  const getPowerSourceIcon = (powerSource) => {
    switch (powerSource) {
      case 'Electric': return '⚡';
      case 'Hybrid': return '🔋';
      case 'Gas': return '⛽';
      default: return '🔧';
    }
  };

  return (
    <TableRow 
      key={(vehicle.aid || index) + ':' + index}
      style={{ 
        backgroundColor: index % 2 === 0 ? '#fafafa' : 'white',
        transition: 'background-color 0.2s ease'
      }}
      hover
    >
      <TableCell>
        <Typography variant="h6" color="primary" fontWeight="bold">
          {vehicle.data && vehicle.data.year}
        </Typography>
      </TableCell>
      <TableCell>
        <Chip
          label={vehicle.data && vehicle.data.type}
          style={{
            backgroundColor: getTypeColor(vehicle.data && vehicle.data.type),
            color: 'white',
            fontWeight: 'bold'
          }}
        />
      </TableCell>
      <TableCell>
        <Box display="flex" alignItems="center">
          <Typography variant="h6" color="secondary" fontWeight="bold">
            {vehicle.data && vehicle.data.hp}
          </Typography>
          <Typography variant="body2" color="textSecondary" style={{ marginLeft: 4 }}>
            HP
          </Typography>
        </Box>
      </TableCell>
      <TableCell>
        <Box display="flex" alignItems="center">
          <Typography variant="h6" color="error" fontWeight="bold">
            {vehicle.data && vehicle.data.topSpeed}
          </Typography>
          <Typography variant="body2" color="textSecondary" style={{ marginLeft: 4 }}>
            km/h
          </Typography>
        </Box>
      </TableCell>
      <TableCell>
        <Chip
          icon={<span style={{ fontSize: 16 }}>{getPowerSourceIcon(vehicle.data && vehicle.data.powerSource)}</span>}
          label={vehicle.data && vehicle.data.powerSource}
          style={{
            backgroundColor: getPowerSourceColor(vehicle.data && vehicle.data.powerSource),
            color: 'white',
            fontWeight: 'bold'
          }}
        />
      </TableCell>
    </TableRow>
  );
});

// Componente memoizado para la tabla
const VehicleTable = React.memo(({ rows }) => {
  return (
    <Card style={{ borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.1)' }}>
      <CardContent style={{ padding: 0 }}>
        <Paper 
          style={{ 
            maxHeight: 400, 
            borderRadius: 16,
            boxShadow: 'none',
            overflow: 'auto'
          }}
        >
          <Table>
            <TableHead>
              <TableRow style={{ backgroundColor: '#f5f5f5' }}>
                <TableCell style={{ fontWeight: 'bold', fontSize: 16 }}>
                  <Box display="flex" alignItems="center">
                    <span style={{ marginRight: 8 }}>📅</span>
                    Año
                  </Box>
                </TableCell>
                <TableCell style={{ fontWeight: 'bold', fontSize: 16 }}>
                  <Box display="flex" alignItems="center">
                    <span style={{ marginRight: 8 }}>🚗</span>
                    Tipo
                  </Box>
                </TableCell>
                <TableCell style={{ fontWeight: 'bold', fontSize: 16 }}>
                  <Box display="flex" alignItems="center">
                    <span style={{ marginRight: 8 }}>⚡</span>
                    Potencia (HP)
                  </Box>
                </TableCell>
                <TableCell style={{ fontWeight: 'bold', fontSize: 16 }}>
                  <Box display="flex" alignItems="center">
                    <span style={{ marginRight: 8 }}>🏁</span>
                    Vel. Máxima
                  </Box>
                </TableCell>
                <TableCell style={{ fontWeight: 'bold', fontSize: 16 }}>
                  <Box display="flex" alignItems="center">
                    <span style={{ marginRight: 8 }}>🔋</span>
                    Fuente de Energía
                  </Box>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((vehicle, idx) => (
                <VehicleRow key={(vehicle.aid || idx) + ':' + idx} vehicle={vehicle} index={idx} />
              ))}
            </TableBody>
          </Table>
        </Paper>
      </CardContent>
    </Card>
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
    <Box style={{ marginBottom: 32 }}>
      {/* Solo mostrar la tabla, sin header duplicado */}
      {rows.length > 0 ? (
        memoizedTable
      ) : (
        <Card style={{ 
          borderRadius: 8, 
          textAlign: 'center',
          backgroundColor: '#fafafa'
        }}>
          <CardContent style={{ padding: 48 }}>
            <Box 
              style={{ 
                width: 60, 
                height: 60, 
                backgroundColor: '#e0e0e0', 
                borderRadius: '50%', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                margin: '0 auto 16px'
              }}
            >
              <span style={{ fontSize: 24 }}>
                {status.isGenerating ? '⚡' : '🚗'}
              </span>
            </Box>
            <Typography variant="h6" style={{ fontWeight: 'bold', marginBottom: 8 }}>
              {status.isGenerating ? 'Generando vehículos...' : 'No hay vehículos generados'}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              {status.isGenerating 
                ? 'Los vehículos aparecerán aquí en tiempo real conforme se vayan generando.'
                : 'Haz clic en "Iniciar Simulación" para comenzar a generar vehículos.'
              }
            </Typography>
          </CardContent>
        </Card>
      )}
    </Box>
  );
}

export default LiveGeneratedList;

import React, { useEffect, useMemo, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import {
  Box,
  Button,
  Chip,
  Grid,
  Typography,
  CircularProgress,
  Card,
  CardContent,
  LinearProgress
} from '@material-ui/core';
import PlayArrowIcon from '@material-ui/icons/PlayArrow';
import StopIcon from '@material-ui/icons/Stop';
import DirectionsCarIcon from '@material-ui/icons/DirectionsCar';
import { useApolloClient, useQuery, useSubscription } from '@apollo/react-hooks';

import {
  START_GENERATION_GQL,
  STOP_GENERATION_GQL,
  GET_GENERATION_STATUS_GQL,
  ON_GENERATOR_STATUS
} from '../gql/Vehicle';

const useStyles = makeStyles((theme) => ({
  headerCard: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 24,
    padding: 16,
  },
  title: {
    fontWeight: 600,
    color: '#333',
  },
  subtitle: {
    color: '#666',
    marginTop: 4,
  },
  statusChip: {
    backgroundColor: '#e3f2fd',
    color: '#1976d2',
    fontWeight: 600,
  },
  countChip: {
    backgroundColor: '#e8f5e8',
    color: '#2e7d32',
    fontWeight: 600,
  },
  btnStart: {
    textTransform: 'none',
    fontWeight: 600,
    backgroundColor: '#4caf50',
    color: 'white',
    marginRight: 8,
    '&:hover': { 
      backgroundColor: '#45a049',
    },
  },
  btnStop: {
    textTransform: 'none',
    fontWeight: 600,
    backgroundColor: '#f44336',
    color: 'white',
    '&:hover': { 
      backgroundColor: '#d32f2f',
    },
  },
  progressContainer: {
    marginTop: 16,
  },
}));

export default function VehiclesHeader() {
  const classes = useStyles();
  const client = useApolloClient();

  // Estado local para mostrar loading en los botones
  const [working, setWorking] = useState(false);

  // Estado inicial
  const { data: statusData, refetch: refetchStatus } = useQuery(GET_GENERATION_STATUS_GQL, {
    fetchPolicy: 'network-only',
    errorPolicy: 'ignore',
  });

  // Actualización en vivo del estado
  const { data: subStatusData, error: subError } = useSubscription(ON_GENERATOR_STATUS, {
    errorPolicy: 'ignore',
  });

  const status = useMemo(() => {
    const s =
      (subStatusData && subStatusData.GeneratorStatus) ||
      (statusData && statusData.GeneratorGenerationStatus);
    return (
      s || {
        isGenerating: false,
        generatedCount: 0,
        status: 'STOPPED',
      }
    );
  }, [statusData, subStatusData]);


  const start = async () => {
    try {
      setWorking(true);
      await client.mutate({ mutation: START_GENERATION_GQL });
      // Forzar refresh del estado después de iniciar
      setTimeout(() => {
        refetchStatus();
      }, 100);
    } catch (error) {
      console.error('Error starting generation:', error);
    } finally {
      setWorking(false);
    }
  };

  const stop = async () => {
    try {
      setWorking(true);
      await client.query({
        query: STOP_GENERATION_GQL,
        fetchPolicy: 'no-cache',
      });
      // Forzar refresh del estado después de detener
      setTimeout(() => {
        refetchStatus();
      }, 100);
    } catch (error) {
      console.error('Error stopping generation:', error);
    } finally {
      setWorking(false);
    }
  };

  useEffect(() => {
    // precaución: si quieres forzar un refresh puntual de conteo (no necesario con sub)
    // client.query({ query: GET_GENERATION_STATUS_GQL, fetchPolicy: 'network-only' });
  }, [client]);

  return (
    <div className="flex flex-col">
      {/* Primera fila: Título */}
      <div className="flex items-center mb-16">
        <DirectionsCarIcon style={{ fontSize: 32, color: '#1976d2', marginRight: 16 }} />
        <div>
          <Typography 
            variant="h4" 
            style={{ 
              fontWeight: 600, 
              color: '#333',
              margin: 0,
              padding: 0,
              lineHeight: 1.2
            }}
          >
            Generador de Vehículos
          </Typography>
          <Typography variant="body2" style={{ color: '#666', marginTop: 4 }}>
            Sistema de simulación en tiempo real
          </Typography>
        </div>
      </div>

      {/* Segunda fila: Estado y contador */}
      <div className="flex items-center justify-between mb-16">
        <div></div> {/* Espacio vacío */}
        <div className="flex items-center">
          <Chip
            icon={<DirectionsCarIcon />}
            label={status.isGenerating ? 'Generando' : 'Detenido'}
            className={classes.statusChip}
            style={{ 
              backgroundColor: status.isGenerating ? '#c8e6c9' : '#f5f5f5',
              color: status.isGenerating ? '#2e7d32' : '#666'
            }}
          />
          <Chip
            icon={<DirectionsCarIcon />}
            label={`${Number(status.generatedCount || 0).toLocaleString()} vehículos`}
            className={classes.countChip}
            style={{ marginLeft: 8 }}
          />
        </div>
      </div>

      {/* Tercera fila: Botones de control */}
      <div className="flex items-center justify-center">
        <div className="flex items-center">
          <Button
            onClick={start}
            className={classes.btnStart}
            startIcon={working ? <CircularProgress size={18} color="inherit" /> : <PlayArrowIcon />}
            disabled={working || status.isGenerating}
            variant="contained"
            size="large"
          >
            Iniciar Simulación
          </Button>

          <Button
            onClick={stop}
            className={classes.btnStop}
            startIcon={working ? <CircularProgress size={18} color="inherit" /> : <StopIcon />}
            disabled={working || !status.isGenerating}
            variant="contained"
            size="large"
          >
            Detener Simulación
          </Button>
        </div>
      </div>

      {/* Progress indicator cuando está generando */}
      {status.isGenerating && (
        <div className="mt-16">
          <LinearProgress color="primary" />
        </div>
      )}
    </div>
  );
}

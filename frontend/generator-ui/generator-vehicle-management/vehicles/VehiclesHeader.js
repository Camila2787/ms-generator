import React, { useEffect, useMemo, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import {
  Box,
  Button,
  Chip,
  Grid,
  Tooltip,
  Typography,
  CircularProgress
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
  container: {
    width: '100%',
    padding: theme.spacing(2.5, 3),
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    background:
      theme.palette.type === 'dark'
        ? 'linear-gradient(90deg, rgba(37,40,54,1) 0%, rgba(26,28,38,1) 100%)'
        : 'linear-gradient(90deg, #f7f9fc 0%, #ffffff 100%)',
    border: `1px solid ${
      theme.palette.type === 'dark'
        ? 'rgba(255,255,255,0.06)'
        : 'rgba(0,0,0,0.06)'
    }`,
  },
  title: {
    fontWeight: 700,
    letterSpacing: 0.5,
  },
  right: {
    display: 'flex',
    gap: theme.spacing(1.25),
    alignItems: 'center',
  },
  chipOk: {
    backgroundColor: '#16a34a', // Tailwind green-600 aprox
    color: '#fff',
    fontWeight: 600,
  },
  chipWarn: {
    backgroundColor: '#ef4444', // Tailwind red-500 aprox
    color: '#fff',
    fontWeight: 600,
  },
  chipCount: {
    fontWeight: 600,
  },
  btnStart: {
    textTransform: 'none',
    fontWeight: 700,
    backgroundColor: '#22c55e',
    color: '#0b3018',
    '&:hover': { backgroundColor: '#16a34a' },
  },
  btnStop: {
    textTransform: 'none',
    fontWeight: 700,
    backgroundColor: '#ef4444',
    color: '#3a0a0a',
    '&:hover': { backgroundColor: '#dc2626' },
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
    <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 rounded-xl shadow-lg p-6 mb-6">
      <Grid container alignItems="center" spacing={3}>
        <Grid item xs={12} sm>
          <div className="flex items-center">
            <div className="w-12 h-12 bg-white bg-opacity-20 rounded-lg flex items-center justify-center mr-4">
              <DirectionsCarIcon className="text-white text-2xl" />
            </div>
            <div>
              <Typography variant="h4" className="text-white font-bold mb-1">
                GENERADOR DE FLOTA VEHICULAR
              </Typography>
              <Typography variant="body2" className="text-blue-100">
                Sistema de simulación en tiempo real
              </Typography>
            </div>
          </div>
        </Grid>

        <Grid item>
          <Box className="flex items-center space-x-4">
            {/* Estado del generador */}
            <div className="flex items-center space-x-2 bg-white bg-opacity-10 rounded-lg px-4 py-2">
              <div className={`w-3 h-3 rounded-full ${status.isGenerating ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`}></div>
              <span className="text-white font-medium">
                {status.isGenerating ? 'Generando' : 'Detenido'}
              </span>
            </div>

            {/* Contador de vehículos */}
            <div className="bg-white bg-opacity-10 rounded-lg px-4 py-2">
              <div className="flex items-center space-x-2">
                <DirectionsCarIcon className="text-white text-lg" />
                <span className="text-white font-bold text-lg">
                  {Number(status.generatedCount || 0).toLocaleString()}
                </span>
                <span className="text-blue-100 text-sm">vehículos</span>
              </div>
            </div>

            {/* Botones de control */}
            <div className="flex space-x-3">
              <Button
                onClick={start}
                className="bg-green-500 hover:bg-green-600 text-white font-semibold px-6 py-2 rounded-lg shadow-md transition-all duration-200 transform hover:scale-105"
                startIcon={working ? <CircularProgress size={18} color="inherit" /> : <PlayArrowIcon />}
                disabled={working || status.isGenerating}
                variant="contained"
              >
                Iniciar Simulación
              </Button>

              <Button
                onClick={stop}
                className="bg-red-500 hover:bg-red-600 text-white font-semibold px-6 py-2 rounded-lg shadow-md transition-all duration-200 transform hover:scale-105"
                startIcon={working ? <CircularProgress size={18} color="inherit" /> : <StopIcon />}
                disabled={working || !status.isGenerating}
                variant="contained"
              >
                Detener Simulación
              </Button>
            </div>
          </Box>
        </Grid>
      </Grid>
    </div>
  );
}

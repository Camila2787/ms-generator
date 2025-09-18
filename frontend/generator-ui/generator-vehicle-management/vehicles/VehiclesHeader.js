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
    <div className={classes.container}>
      <Grid container alignItems="center" spacing={2}>
        <Grid item xs={12} sm>
          <Typography variant="h5" className={classes.title}>
            GENERADOR DE FLOTA VEHICULAR
          </Typography>
        </Grid>

        <Grid item>
          <Box className={classes.right}>
            <Tooltip title={status.isGenerating ? 'Corriendo' : 'Detenido'}>
              <Chip
                size="small"
                label={status.isGenerating ? 'Estado: Corriendo' : 'Estado: Detenido'}
                className={status.isGenerating ? classes.chipOk : classes.chipWarn}
              />
            </Tooltip>

            <Chip
              size="small"
              icon={<DirectionsCarIcon style={{ color: 'inherit' }} />}
              label={`Vehículos: ${Number(status.generatedCount || 0).toLocaleString()}`}
              className={classes.chipCount}
              color="default"
            />

            <Box ml={1} />

            <Button
              onClick={start}
              className={classes.btnStart}
              variant="contained"
              startIcon={working ? <CircularProgress size={18} /> : <PlayArrowIcon />}
              disabled={working || status.isGenerating}
            >
              Iniciar Simulación
            </Button>

            <Button
              onClick={stop}
              className={classes.btnStop}
              variant="contained"
              startIcon={working ? <CircularProgress size={18} /> : <StopIcon />}
              disabled={working || !status.isGenerating}
            >
              Detener Simulación
            </Button>
          </Box>
        </Grid>
      </Grid>
    </div>
  );
}

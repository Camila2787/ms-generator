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
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    color: 'white',
    borderRadius: 16,
    marginBottom: 24,
    boxShadow: '0 8px 32px rgba(0,0,0,0.1)',
  },
  title: {
    fontWeight: 700,
    letterSpacing: 0.5,
    color: 'white',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  statusChip: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    color: 'white',
    fontWeight: 600,
    backdropFilter: 'blur(10px)',
  },
  countChip: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    color: 'white',
    fontWeight: 600,
    backdropFilter: 'blur(10px)',
  },
  btnStart: {
    textTransform: 'none',
    fontWeight: 700,
    backgroundColor: '#4caf50',
    color: 'white',
    borderRadius: 12,
    padding: '12px 24px',
    boxShadow: '0 4px 16px rgba(76,175,80,0.3)',
    '&:hover': { 
      backgroundColor: '#45a049',
      boxShadow: '0 6px 20px rgba(76,175,80,0.4)',
      transform: 'translateY(-2px)',
    },
    transition: 'all 0.3s ease',
  },
  btnStop: {
    textTransform: 'none',
    fontWeight: 700,
    backgroundColor: '#f44336',
    color: 'white',
    borderRadius: 12,
    padding: '12px 24px',
    boxShadow: '0 4px 16px rgba(244,67,54,0.3)',
    '&:hover': { 
      backgroundColor: '#d32f2f',
      boxShadow: '0 6px 20px rgba(244,67,54,0.4)',
      transform: 'translateY(-2px)',
    },
    transition: 'all 0.3s ease',
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
    <Card className={classes.headerCard}>
      <CardContent style={{ padding: 32 }}>
        <Grid container alignItems="center" spacing={3}>
          <Grid item xs={12} sm>
            <Box display="flex" alignItems="center">
              <Box 
                style={{ 
                  width: 64, 
                  height: 64, 
                  backgroundColor: 'rgba(255,255,255,0.2)', 
                  borderRadius: 16, 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center',
                  marginRight: 16,
                  backdropFilter: 'blur(10px)'
                }}
              >
                <DirectionsCarIcon style={{ fontSize: 32, color: 'white' }} />
              </Box>
              <Box>
                <Typography variant="h4" className={classes.title}>
                  Generador de Vehículos
                </Typography>
                <Typography variant="body1" className={classes.subtitle}>
                  Sistema de simulación en tiempo real
                </Typography>
              </Box>
            </Box>
          </Grid>

          <Grid item>
            <Box display="flex" flexDirection="column" alignItems="flex-end" gap={2}>
              {/* Estado y contador */}
              <Box display="flex" gap={2} alignItems="center">
                <Chip
                  icon={<DirectionsCarIcon />}
                  label={status.isGenerating ? 'Generando' : 'Detenido'}
                  className={classes.statusChip}
                  style={{ 
                    backgroundColor: status.isGenerating ? 'rgba(76,175,80,0.8)' : 'rgba(158,158,158,0.8)' 
                  }}
                />
                <Chip
                  icon={<DirectionsCarIcon />}
                  label={`${Number(status.generatedCount || 0).toLocaleString()} vehículos`}
                  className={classes.countChip}
                />
              </Box>

              {/* Botones de control */}
              <Box display="flex" gap={2}>
                <Button
                  onClick={start}
                  className={classes.btnStart}
                  startIcon={working ? <CircularProgress size={18} color="inherit" /> : <PlayArrowIcon />}
                  disabled={working || status.isGenerating}
                  variant="contained"
                >
                  Iniciar Simulación
                </Button>

                <Button
                  onClick={stop}
                  className={classes.btnStop}
                  startIcon={working ? <CircularProgress size={18} color="inherit" /> : <StopIcon />}
                  disabled={working || !status.isGenerating}
                  variant="contained"
                >
                  Detener Simulación
                </Button>
              </Box>

              {/* Progress indicator cuando está generando */}
              {status.isGenerating && (
                <Box className={classes.progressContainer} style={{ width: '100%', maxWidth: 300 }}>
                  <LinearProgress 
                    style={{ 
                      backgroundColor: 'rgba(255,255,255,0.2)', 
                      borderRadius: 8,
                      height: 6 
                    }}
                    color="primary"
                  />
                </Box>
              )}
            </Box>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}

import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Button,
  Chip,
  Box,
  Collapse,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Divider
} from '@material-ui/core';
import ExpandMoreIcon from '@material-ui/icons/ExpandMore';
import BugReportIcon from '@material-ui/icons/BugReport';
import { useApolloClient } from '@apollo/react-hooks';
import { checkWebSocketConnection } from '../utils/debug';

const DiagnosticPanel = () => {
  const [expanded, setExpanded] = useState(false);
  const [diagnostics, setDiagnostics] = useState({
    apolloClient: false,
    websocketClient: false,
    websocketStatus: 'unknown',
    lastCheck: null
  });

  const client = useApolloClient();

  const runDiagnostics = () => {
    const newDiagnostics = {
      apolloClient: !!client,
      websocketClient: false,
      websocketStatus: 'unknown',
      lastCheck: new Date().toISOString()
    };

    if (client) {
      const wsClient = client.wsClient;
      if (wsClient) {
        newDiagnostics.websocketClient = true;
        newDiagnostics.websocketStatus = wsClient.status || 'unknown';
      }
    }

    setDiagnostics(newDiagnostics);
  };

  useEffect(() => {
    runDiagnostics();
    const interval = setInterval(runDiagnostics, 5000);
    return () => clearInterval(interval);
  }, [client]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'connected':
      case 'ready':
        return 'primary';
      case 'connecting':
        return 'default';
      case 'disconnected':
      case 'closed':
        return 'secondary';
      default:
        return 'default';
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'connected':
      case 'ready':
        return 'Conectado';
      case 'connecting':
        return 'Conectando...';
      case 'disconnected':
      case 'closed':
        return 'Desconectado';
      default:
        return 'Desconocido';
    }
  };

  return (
    <Card style={{ margin: '16px 0' }}>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Box display="flex" alignItems="center">
            <BugReportIcon style={{ marginRight: 8 }} />
            <Typography variant="h6">Panel de Diagnóstico</Typography>
          </Box>
          <Box>
            <Button
              size="small"
              onClick={runDiagnostics}
              style={{ marginRight: 8 }}
            >
              Actualizar
            </Button>
            <IconButton
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
              aria-label="show more"
            >
              <ExpandMoreIcon />
            </IconButton>
          </Box>
        </Box>

        <Collapse in={expanded} timeout="auto" unmountOnExit>
          <Divider style={{ margin: '16px 0' }} />
          
          <List dense>
            <ListItem>
              <ListItemText
                primary="Apollo Client"
                secondary="Cliente GraphQL disponible"
              />
              <Chip
                label={diagnostics.apolloClient ? 'Disponible' : 'No disponible'}
                color={diagnostics.apolloClient ? 'primary' : 'secondary'}
                size="small"
              />
            </ListItem>

            <ListItem>
              <ListItemText
                primary="WebSocket Client"
                secondary="Cliente WebSocket disponible"
              />
              <Chip
                label={diagnostics.websocketClient ? 'Disponible' : 'No disponible'}
                color={diagnostics.websocketClient ? 'primary' : 'secondary'}
                size="small"
              />
            </ListItem>

            <ListItem>
              <ListItemText
                primary="Estado WebSocket"
                secondary="Estado de la conexión WebSocket"
              />
              <Chip
                label={getStatusText(diagnostics.websocketStatus)}
                color={getStatusColor(diagnostics.websocketStatus)}
                size="small"
              />
            </ListItem>

            <ListItem>
              <ListItemText
                primary="Última verificación"
                secondary={diagnostics.lastCheck ? new Date(diagnostics.lastCheck).toLocaleString() : 'Nunca'}
              />
            </ListItem>
          </List>

          <Box mt={2}>
            <Typography variant="body2" color="textSecondary">
              <strong>Instrucciones:</strong>
            </Typography>
            <Typography variant="body2" color="textSecondary">
              • Si el WebSocket está desconectado, verifica la configuración del servidor
            </Typography>
            <Typography variant="body2" color="textSecondary">
              • Si hay errores de JWT, verifica que estés autenticado correctamente
            </Typography>
            <Typography variant="body2" color="textSecondary">
              • Revisa la consola del navegador para más detalles de errores
            </Typography>
          </Box>
        </Collapse>
      </CardContent>
    </Card>
  );
};

export default DiagnosticPanel;

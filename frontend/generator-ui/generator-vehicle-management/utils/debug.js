// Utilidades de debug para el generador de vehículos

export const debugWebSocket = {
  logSubscriptionError: (subscriptionName, error) => {
    console.group(`🔴 WebSocket Error: ${subscriptionName}`);
    console.error('Error details:', error);
    if (error.graphQLErrors) {
      console.error('GraphQL Errors:', error.graphQLErrors);
    }
    if (error.networkError) {
      console.error('Network Error:', error.networkError);
    }
    console.groupEnd();
  },

  logSubscriptionData: (subscriptionName, data) => {
    console.group(`🟢 WebSocket Data: ${subscriptionName}`);
    console.log('Received data:', data);
    console.groupEnd();
  },

  logMutationResult: (mutationName, result) => {
    console.group(`🟡 Mutation Result: ${mutationName}`);
    console.log('Result:', result);
    console.groupEnd();
  },

  logQueryResult: (queryName, result) => {
    console.group(`🔵 Query Result: ${queryName}`);
    console.log('Result:', result);
    console.groupEnd();
  }
};

export const debugGenerator = {
  logStatusChange: (oldStatus, newStatus) => {
    console.group('📊 Generator Status Change');
    console.log('Previous:', oldStatus);
    console.log('Current:', newStatus);
    console.groupEnd();
  },

  logVehicleGenerated: (vehicle) => {
    console.group('🚗 Vehicle Generated');
    console.log('Vehicle data:', vehicle);
    console.log('Timestamp:', new Date().toISOString());
    console.groupEnd();
  }
};

// Función para verificar la conectividad WebSocket
export const checkWebSocketConnection = (client) => {
  if (!client) {
    console.error('❌ Apollo Client not available');
    return false;
  }

  const wsClient = client.wsClient;
  if (!wsClient) {
    console.error('❌ WebSocket client not available');
    return false;
  }

  console.log('✅ WebSocket client available');
  console.log('WebSocket status:', wsClient.status);
  return true;
};

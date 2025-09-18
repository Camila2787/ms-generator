# Diagnóstico del Problema de WebSocket

## Problema Identificado

El frontend está intentando conectarse a:
```
ws://localhost:3000/api/emi-gateway/graphql/ws
```

Pero debería conectarse a:
```
ws://localhost:3000/api/generator-ui-gateway/graphql/ws
```

## Soluciones Implementadas

### 1. Fallback con Polling
- Si WebSocket falla, el sistema automáticamente cambia a polling cada 2 segundos
- Genera datos mock de vehículos para testing
- Permite que la funcionalidad básica funcione mientras se soluciona el WebSocket

### 2. Panel de Diagnóstico Mejorado
- Muestra la URL del WebSocket que está intentando usar
- Indica el estado de la conexión
- Ayuda a identificar problemas de configuración

## Pasos para Solucionar el Problema

### Opción 1: Verificar que el Gateway esté Ejecutándose

1. **Verificar que el generator-ui-gateway esté corriendo**:
   ```bash
   cd playground/generator-ui-gateway
   npm run start-dev-env
   ```

2. **Verificar que esté escuchando en el puerto 3000**:
   ```bash
   netstat -an | findstr :3000
   ```

3. **Verificar que el endpoint WebSocket esté disponible**:
   - Abrir navegador en: `http://localhost:3000/api/generator-ui-gateway/graphql`
   - Debería mostrar la interfaz GraphQL Playground

### Opción 2: Configurar el Frontend Correctamente

El problema puede estar en la configuración de Apollo Client. Necesitas verificar:

1. **Archivo de configuración de Apollo Client** (probablemente en el directorio padre):
   - Buscar archivos como `apollo-client.js`, `graphql-config.js`, etc.
   - Verificar que el WebSocketLink esté configurado con la URL correcta

2. **Variables de entorno**:
   - Verificar que `GRAPHQL_WS_ENDPOINT` o similar esté configurado correctamente
   - Debería ser: `ws://localhost:3000/api/generator-ui-gateway/graphql/ws`

### Opción 3: Usar el Fallback Temporal

Mientras solucionas el problema de WebSocket:

1. **El sistema automáticamente detectará el fallo de WebSocket**
2. **Cambiará a polling cada 2 segundos**
3. **Generará datos mock de vehículos para testing**
4. **Los botones de inicio/parada seguirán funcionando**

## Verificación del Estado Actual

### En el Panel de Diagnóstico:
- ✅ Apollo Client: Disponible
- ❌ WebSocket Client: No disponible (o con error)
- ❌ Estado WebSocket: Desconectado
- ❌ URL WebSocket: `ws://localhost:3000/api/emi-gateway/graphql/ws` (incorrecta)

### En la Consola del Navegador:
- Error: `WebSocket connection to 'ws://localhost:3000/api/emi-gateway/graphql/ws' failed: Error in connection establishment: net::ERR_CONNECTION_REFUSED`
- Warning: `WebSocket subscription failed, falling back to polling`

## Próximos Pasos Recomendados

1. **Verificar que el generator-ui-gateway esté ejecutándose**
2. **Revisar la configuración de Apollo Client en el directorio padre**
3. **Corregir la URL del WebSocket para que apunte al gateway correcto**
4. **Probar la funcionalidad completa una vez solucionado el WebSocket**

## Nota Importante

El sistema ahora funciona con fallback, por lo que puedes continuar desarrollando mientras solucionas el problema de WebSocket. Los datos mock te permitirán probar la funcionalidad de la interfaz de usuario.

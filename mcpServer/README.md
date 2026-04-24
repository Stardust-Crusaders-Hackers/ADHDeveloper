MCP Server (TypeScript)

Instrucciones rápidas:

1) Entrar en el directorio:
   cd mcpServer
2) Instalar dependencias:
   npm install
3) Desarrollo:
   npm run dev
4) Compilar y ejecutar:
   npm run build
   npm start

Endpoints:
- GET /health -> { status: 'ok' }
- GET / -> Mensaje simple

Publicación en NPM:
- El paquete está preparado para publicar (types incluidos).
- Build previo a publicar: npm run build
- Publicar: npm publish --access public

Docker (opcional):
- Se incluye Dockerfile multi-stage para despliegue reproducible.
- Construir imagen localmente: docker build -t mcp-server:latest ./mcpServer
- Ejecutar: docker run -p 3000:3000 mcp-server:latest

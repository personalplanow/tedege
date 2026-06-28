# Guía de despliegue de ASAP

Esta guía deja la demo visible mediante un enlace público, similar al flujo del demo HRM heredado. La opción recomendada para presentación es Render con servicio web Node.js, porque no exige administrar servidor ni IIS.

## 1. Preparar repositorio

1. Crea un repositorio en GitHub.
2. Sube el contenido de este proyecto a la raíz del repositorio.
3. Verifica que existan estos archivos en la raíz:
   - `package.json`
   - `server.js`
   - `render.yaml`
   - `Dockerfile`
   - `public/`
   - `src/`
   - `data/`

## 2. Despliegue recomendado en Render

### Opción A: usando `render.yaml`

1. En Render, crea un nuevo Blueprint.
2. Conecta el repositorio de GitHub.
3. Render leerá `render.yaml`.
4. Espera el build y abre la URL pública generada.

El archivo incluido define:

```yaml
services:
  - type: web
    name: asap-design-jeisson-demo
    runtime: node
    plan: starter
    buildCommand: npm install
    startCommand: npm start
```

### Opción B: servicio web manual

1. En Render: New > Web Service.
2. Conecta el repositorio.
3. Configura:
   - Runtime: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Health Check Path: `/health`
4. Variables recomendadas:
   - `NODE_VERSION=24`
   - `ASAP_DEMO_RESET=true` para demo académica.
   - `ASAP_DATA_FILE=/var/data/db.json` si usas disco persistente.
5. Crea el servicio y copia la URL final.

## 3. Persistencia de datos

Para una demo académica, el JSON inicial puede bastar. Para que los cambios sobrevivan reinicios del servicio, agrega un disco persistente y configura:

```text
ASAP_DATA_FILE=/var/data/db.json
```

En Render puedes montar el disco en `/var/data`. Si no montas disco, los datos pueden reiniciarse cuando la plataforma recree la instancia.

## 4. Despliegue con Docker

Construir imagen:

```bash
docker build -t asap-design-jeisson .
```

Ejecutar localmente:

```bash
docker run --rm -p 8080:8080 \
  -e PORT=8080 \
  -e ASAP_DATA_FILE=/app/data/db.json \
  asap-design-jeisson
```

Abrir:

```text
http://localhost:8080
```

## 5. Despliegue en VPS Linux

1. Instala Node.js 24 LTS.
2. Copia el proyecto al servidor.
3. Instala y prueba:

```bash
npm install
npm test
PORT=8080 npm start
```

4. Usa un gestor de procesos como `systemd` o PM2.
5. Coloca Nginx o Caddy como proxy inverso con HTTPS.
6. Abre solo los puertos 80/443.
7. Configura respaldos del archivo definido en `ASAP_DATA_FILE`.

Ejemplo básico de `systemd`:

```ini
[Unit]
Description=ASAP design by Jeisson Steven Herrera Baquero
After=network.target

[Service]
WorkingDirectory=/opt/asap
ExecStart=/usr/bin/node server.js
Restart=always
Environment=PORT=8080
Environment=ASAP_DATA_FILE=/opt/asap/data/db.json
Environment=ASAP_DEMO_RESET=false
User=asap
Group=asap

[Install]
WantedBy=multi-user.target
```

## 6. Configuración antes de mostrar la demo

1. Entra con `admin@asap.demo.com` / `Admin@123`.
2. Revisa Dashboard.
3. Abre Alertas y recomendaciones.
4. Aplica una recomendación para mostrar trazabilidad.
5. Entra a Auditoría.
6. Exporta CSV y abre vista PDF.
7. Copia la URL pública y credenciales en tu presentación.

## 7. Seguridad mínima para una URL pública

Para demo académica:

- Cambia las contraseñas antes de exponer el enlace si el link será compartido fuera del jurado.
- Deshabilita reset en producción con `ASAP_DEMO_RESET=false`.
- No subas credenciales reales a GitHub.
- Usa HTTPS.
- Mantén solo datos ficticios o anonimizados.

Para uso real:

- Migrar de JSON a Postgres.
- Implementar recuperación de contraseña por correo.
- Activar MFA.
- Configurar control de retención de datos.
- Separar ambientes de desarrollo, pruebas y producción.
- Hacer pruebas de seguridad antes de usar datos laborales reales.

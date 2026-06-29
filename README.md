# ASAP design by Jeisson Steven Herrera Baquero

MVP académico y demostrable para el **estudio inteligente de cargas laborales**. Esta versión está enfocada en la sustentación del trabajo de grado: registra actividades tarea a tarea, calcula horas mes, estima necesidad de personal con base en 167 horas/mes, identifica riesgos de sobrecarga y genera reportes ejecutivos.

## Decisión técnica

La aplicación se mantiene liviana y portable: Node.js nativo, API REST propia, SPA en HTML/CSS/JavaScript y persistencia JSON para demo. No requiere SQL Server, IIS, Visual Studio, .NET Framework ni dependencias externas de npm.

## Funcionalidades incluidas

- Branding completo: **ASAP design by Jeisson Steven Herrera Baquero**.
- Login por roles: administrador, líder, empleado, analista/consultor, RR. HH. y dirección.
- Interfaz responsive para computador y celular, con navegación por módulos y tarjetas visuales.
- Registro de actividades por área/equipo, responsable, periodicidad, repeticiones mensuales, minutos por repetición, prioridad, dificultad, fecha límite y señal de bienestar.
- Cálculo de horas mes: `repeticiones mensuales × minutos por repetición / 60`.
- Estimación de personal requerido: `horas mes / 167`.
- Cálculo de carga ponderada: `CP = horas mes × prioridad × dificultad × urgencia × bienestar`.
- Cálculo de utilización: `ICU = carga / capacidad disponible`.
- Dashboard por colaborador, área/equipo y actividades de mayor impacto.
- Filtros por búsqueda, estado, área, responsable, prioridad, riesgo y mes.
- Alertas por sobrecarga, vencimiento, alto riesgo y redistribución sugerida.
- Motor de recomendaciones explicables con revisión humana y auditoría.
- Módulo **Estudio 167** con calculadora rápida para explicar la metodología en vivo.
- Módulo **Guía y métricas** con tutorial de uso, glosario de indicadores e hitos cubiertos por la demo.
- Reporte CSV compatible con Excel.
- Vista HTML imprimible para guardar como PDF desde el navegador.
- Perfil con notificaciones y simulación de vínculo con Google Calendar.
- Healthcheck `/health` para despliegue.

## Usuarios de demostración

| Rol | Correo | Contraseña |
| --- | --- | --- |
| Administrador | `admin@asap.demo.com` | `Admin@123` |
| Líder | `lider@asap.demo.com` | `Lider@123` |
| Empleado | `empleado@asap.demo.com` | `Default@123` |
| Analista / consultor | `analista@asap.demo.com` | `Analista@123` |
| Operaciones | `operaciones@asap.demo.com` | `Operaciones@123` |

## Requisitos

- Node.js 22 LTS o superior. Recomendado: Node.js 24 LTS.
- No requiere dependencias externas de npm; `npm install` solo valida el lockfile.

## Ejecución local

```bash
npm install
npm start
```

Luego abre:

```text
http://localhost:8080
```

Para usar un archivo de datos local separado:

```bash
ASAP_DATA_FILE=./data/db.local.json npm run dev
```

Para reiniciar datos demo:

```bash
npm run reset
```

## Pruebas

```bash
npm test
```

Las pruebas cubren:

- Cálculo de horas mes y funcionarios requeridos con regla 167.
- Cálculo de carga ponderada.
- Detección de usuarios en riesgo.
- Generación de recomendaciones.
- Hash y verificación de contraseñas demo.

## Estructura

```text
.
├── server.js                 # Servidor HTTP y API REST sin dependencias externas
├── src/
│   ├── analytics.js          # Horas mes, regla 167, CP, ICU, riesgos y recomendaciones
│   ├── security.js           # PBKDF2, sesiones y sanitización de usuario
│   └── store.js              # Persistencia JSON y auditoría
├── public/
│   ├── index.html            # Interfaz web SPA
│   ├── styles.css            # UI responsiva
│   └── app.js                # Cliente web
├── data/
│   └── seed.json             # Usuarios, equipos y actividades demo
├── docs/
│   ├── AUDIT_LEGACY.md       # Auditoría del código heredado
│   ├── CHANGELOG_ASAP.md     # Cambios realizados
│   └── DEPLOYMENT.md         # Guía de despliegue
├── legacy-patches/           # Plantillas seguras para no exponer secretos
├── tests/                    # Pruebas con node:test
├── Dockerfile
└── render.yaml
```

## Guion rápido para la sustentación

1. Ingresar como administrador.
2. Mostrar **Inicio**: horas mes, funcionarios requeridos, ICU ponderado y actividades vencidas.
3. Entrar a **Estudio 167** y explicar la fórmula con la calculadora rápida.
4. Ir a **Actividades**, registrar una actividad con repeticiones mensuales y minutos por repetición.
5. Usar filtros por área, estado, responsable, prioridad, riesgo o mes.
6. Entrar a **Alertas** y aplicar una recomendación de redistribución si aparece.
7. Abrir **Reportes** y mostrar la vista previa ejecutiva, el CSV y la vista imprimible para PDF.
8. Abrir **Guía y métricas** para explicar cada indicador.
9. Mostrar **Auditoría** para evidenciar trazabilidad de cambios.
10. Ingresar como empleado y verificar que el usuario solo ve su carga y tareas propias.

## Despliegue en Render

El repositorio incluye `render.yaml`. Si Render ya está conectado a GitHub, basta con subir estos cambios a la rama configurada y Render construirá de nuevo el servicio. Recomendaciones para producción:

- Definir `NODE_ENV=production`.
- Definir `ASAP_DEMO_RESET=false` para deshabilitar el botón de restauración en ambiente público.
- Usar `ASAP_DATA_FILE` apuntando a un disco persistente si se desea conservar datos de la demo entre despliegues.
- Rotar usuarios demo si el enlace será compartido públicamente.

## Advertencia para demo pública

Las credenciales anteriores son únicamente para demostración académica. En un ambiente real se deben crear usuarios propios, proteger el almacenamiento, endurecer autenticación y revisar el tratamiento de datos personales y laborales.

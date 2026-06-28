# ASAP design by Jeisson Steven Herrera Baquero

MVP académico y demostrable para el **estudio inteligente de cargas laborales**. Esta versión reemplaza la demo heredada de HRM por una aplicación liviana, enfocada en el trabajo de grado: tareas, tiempos, roles, carga ponderada, alertas, recomendaciones y reportes.

## Decisión técnica

El código original del ZIP corresponde a un HRM antiguo basado en .NET Framework, WebForms, SQL Server y dependencias pesadas. Para la presentación del trabajo de grado se construyó este MVP desde cero con Node.js nativo, sin dependencias externas de npm, para que sea más ligero, portable y fácil de desplegar.

## Funcionalidades incluidas

- Branding completo: **ASAP design by Jeisson Steven Herrera Baquero**.
- Login por roles: administrador, líder, empleado y analista/consultor.
- Gestión de tareas con prioridad, dificultad, tiempo estimado, responsable, equipo y fecha límite.
- Cálculo de carga ponderada: `CP = TE × prioridad × dificultad × urgencia × bienestar`.
- Cálculo de utilización: `ICU = carga total / capacidad disponible`.
- Detección de sobrecarga, tareas vencidas, vencimientos cercanos y usuarios en riesgo.
- Motor de recomendaciones explicables para redistribuir tareas.
- Dashboard por usuario y equipo.
- Exportación CSV compatible con Excel.
- Vista imprimible para guardar como PDF desde el navegador.
- Perfil con notificaciones y simulación de vínculo con Google Calendar.
- Auditoría de accesos, cambios y recomendaciones aplicadas.
- Healthcheck `/health` para despliegue.

## Usuarios de demostración

| Rol | Correo | Contraseña |
| --- | --- | --- |
| Administrador | `admin@asap.demo.com` | `Admin@123` |
| Líder | `lider@asap.demo.com` | `Lider@123` |
| Empleado | `empleado@asap.demo.com` | `Default@123` |
| Analista / consultor | `analista@asap.demo.com` | `Analista@123` |

## Requisitos

- Node.js 22 LTS o superior. Recomendado: Node.js 24 LTS.
- No requiere SQL Server, IIS, Visual Studio, .NET Framework ni dependencias externas.

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

- Cálculo de carga ponderada.
- Detección de usuarios en riesgo.
- Generación de recomendaciones.
- Hash y verificación de contraseñas demo.

## Estructura

```text
.
├── server.js                 # Servidor HTTP y API REST sin dependencias externas
├── src/
│   ├── analytics.js          # Cálculo de CP, ICU, riesgos y recomendaciones
│   ├── security.js           # PBKDF2, sesiones y sanitización de usuario
│   └── store.js              # Persistencia JSON y auditoría
├── public/
│   ├── index.html            # Interfaz web SPA
│   ├── styles.css            # UI responsiva
│   └── app.js                # Cliente web
├── data/
│   └── seed.json             # Usuarios, equipos y tareas demo
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
2. Mostrar el dashboard: carga total, utilización promedio, tareas vencidas y recomendaciones.
3. Explicar la fórmula CP y el ICU.
4. Entrar a tareas y filtrar por estado.
5. Abrir alertas y aplicar una recomendación de redistribución.
6. Mostrar auditoría para evidenciar trazabilidad.
7. Exportar CSV o abrir vista PDF.
8. Ingresar como empleado y mostrar que solo ve su carga y tareas propias.

## Advertencia para demo pública

Las credenciales anteriores son únicamente para demo. En un ambiente real se deben configurar usuarios nuevos, deshabilitar el reset público y usar un almacenamiento persistente administrado.

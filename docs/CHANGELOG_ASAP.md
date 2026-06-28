# Changelog ASAP

## 1.0.0-demo

### Agregado

- Aplicación web completa con marca **ASAP design by Jeisson Steven Herrera Baquero**.
- API REST sin dependencias externas.
- Datos demo con usuarios, equipos, tareas, bienestar y prioridades.
- Cálculo de carga ponderada CP.
- Cálculo de índice de capacidad utilizada ICU.
- Dashboard de carga por usuario y equipo.
- Detección de usuarios con riesgo bajo, medio, alto o crítico.
- Recomendaciones explicables de reasignación.
- Alertas por tareas vencidas o próximas a vencer.
- Gestión de estado de tareas.
- Creación de tareas con responsable sugerido.
- Perfil con notificaciones y Google Calendar simulado.
- Exportación CSV y vista imprimible/PDF.
- Bitácora de auditoría.
- Dockerfile y render.yaml.
- Pruebas automatizadas con `node:test`.

### Corregido respecto al ZIP heredado

- Se eliminó dependencia de IIS, SQL Server, .NET Framework y paquetes obsoletos para demo.
- Se removió exposición de credenciales en la nueva versión.
- Se redujo tamaño y complejidad de despliegue.
- Se enfocó el producto en cargas laborales, no en HRM genérico.

### Pendiente para una versión productiva

- Base de datos Postgres.
- Recuperación real de contraseña por correo.
- MFA.
- Integración real con Google Calendar / Microsoft 365.
- Exportación XLSX nativa.
- Reporte PDF generado en servidor.
- Entrenamiento de modelos con datos reales anonimizados.
- Pruebas de carga y seguridad.

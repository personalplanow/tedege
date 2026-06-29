# Auditoría técnica del código HRM heredado

## Resumen ejecutivo

El ZIP original contiene una aplicación HRM antigua orientada a nómina, asistencia, biometría, empleados, dispositivos y módulos administrativos. El alcance real del trabajo de grado es distinto: diseño de un aplicativo inteligente para el estudio de cargas laborales. Por esta diferencia de dominio y por el estado del código, se preparó un MVP limpio denominado **ASAP design by Jeisson Steven Herrera Baquero**.

## Hallazgos principales

1. **Stack heredado**
   - ASP.NET WebForms / MVC / Web API.
   - .NET Framework 4.5, 4.6 y 4.7.2 mezclados por proyecto.
   - Entity Framework 6.0.0.
   - SQL Server como dependencia obligatoria.
   - jQuery 1.10.2 y front-end clásico.
   - IIS/Windows como ruta natural de despliegue.

2. **Peso y complejidad**
   - El paquete trae código fuente, código publicado, backup `.bak`, SQL, DLLs, `bin`, `obj`, reportes, imágenes y librerías de dispositivos biométricos.
   - La demo heredada arrastra módulos que no son necesarios para la sustentación: nómina, préstamos, dispositivos biométricos, asistencia, facturación y otros.

3. **Riesgos críticos**
   - Se encontraron cadenas de conexión y credenciales reales dentro de archivos de configuración.
   - Se encontraron credenciales SMTP en texto plano.
   - El código publicado incluye artefactos binarios que no deben versionarse como fuente.
   - La configuración depende de infraestructura específica y no reproducible en Linux.

4. **Inconsistencias frente al documento académico**
   - El sistema heredado no implementa el foco de ASAP: carga ponderada, ICU, sobrecarga, subutilización, bienestar, recomendaciones explicables, reportes académicos y validación del modelo.
   - La marca original no corresponde a “ASAP design by Jeisson Steven Herrera Baquero”.

## Decisión de migración

Para una demo académica confiable se recomienda no desplegar el HRM heredado tal como viene en el ZIP. La ruta elegida fue construir un MVP ligero, portable y enfocado en el documento `tedege.txt`.

## Qué se corrigió con el MVP

- Se eliminó la dependencia de SQL Server, IIS y .NET Framework.
- Se reemplazó el stack por Node.js nativo sin dependencias externas.
- Se implementó branding ASAP completo.
- Se agregaron módulos alineados con el trabajo de grado:
  - Autenticación por roles.
  - Tareas, equipos y responsables.
  - Carga ponderada.
  - Índice de capacidad utilizada.
  - Alertas de sobrecarga y vencimiento.
  - Recomendaciones explicables.
  - Dashboard.
  - Reportes CSV/PDF imprimible.
  - Auditoría.
  - Preferencias de notificación y calendario.

## Recomendaciones para el código heredado si se decide conservarlo

1. Eliminar de inmediato credenciales embebidas y rotar claves expuestas.
2. Separar configuración por ambiente con variables de entorno o secretos administrados.
3. Eliminar `bin`, `obj`, backups y DLLs no requeridas del repositorio.
4. Actualizar frameworks y paquetes si se mantiene .NET; idealmente migrar a .NET moderno.
5. Reemplazar jQuery antiguo y assets obsoletos.
6. Crear pruebas automatizadas.
7. Documentar instalación reproducible.
8. No usar datos reales de colaboradores en una demo pública.

## Conclusión

El código heredado puede servir como referencia de HRM general, pero no como base adecuada para presentar ASAP. La demo incluida en este paquete está diseñada específicamente para sustentar el proyecto de grado y reducir el riesgo técnico durante la presentación.

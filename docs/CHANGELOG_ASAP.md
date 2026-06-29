# Changelog ASAP

## 1.1.0-demo — Demo de estudio de cargas con regla 167

### Interfaz y experiencia

- Rediseño visual de la SPA con navegación por módulos: Inicio, Estudio 167, Actividades, Alertas, Reportes, Guía y métricas, Perfil y Auditoría.
- Ajustes responsive para computador, tableta y celular.
- Pantallas menos saturadas: se separó metodología, glosario, tutorial, actividades y reportes.
- Nuevo módulo **Guía y métricas** con tutorial, glosario e hitos cubiertos por la demo.
- Nuevo módulo **Estudio 167** con calculadora rápida para explicar la metodología durante la sustentación.
- Se eliminó el checklist interno de la pestaña Reportes y se reemplazó por vista previa de informe ejecutivo.

### Modelo de cargas

- Nuevo cálculo de horas mes por actividad: `repeticiones mensuales × minutos por repetición / 60`.
- Nuevo cálculo de funcionarios requeridos: `horas mes / 167`.
- La carga ponderada ahora usa horas mes como base y conserva pesos por prioridad, dificultad, urgencia y bienestar.
- Se agregaron indicadores de horas mes, FTE requerido, brecha, ICU por horas e ICU ponderado.
- Dashboard por colaborador, área/equipo y actividades de mayor impacto.

### Captura de datos

- El formulario de actividades incluye periodicidad, repeticiones mensuales, minutos por repetición, horas mes calculadas y señal de bienestar.
- Filtros ampliados por búsqueda, estado, área, responsable, prioridad, riesgo y mes.
- Seed de demostración actualizado con actividades recurrentes y área de Operaciones y Servicio.

### Reportes

- CSV ampliado con resumen ejecutivo, áreas, colaboradores y actividades.
- Vista HTML imprimible para PDF con metodología, resumen por área, resumen por colaborador, actividades críticas y diccionario de métricas.

### Pruebas

- Se añadió prueba de horas mes y funcionarios requeridos con regla 167.
- Se mantienen pruebas de CP, riesgo, recomendaciones y seguridad PBKDF2.

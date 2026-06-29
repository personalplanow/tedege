# Guion de presentación de ASAP

## Objetivo de la demo

Mostrar que ASAP permite pasar de un estudio manual de cargas laborales a un flujo digital donde se registran actividades, se calculan horas mes, se estima necesidad de personal con base en 167 horas/mes, se detectan sobrecargas y se generan reportes ejecutivos.

## Credenciales sugeridas

- Administrador: `admin@asap.demo.com` / `Admin@123`
- Líder: `lider@asap.demo.com` / `Lider@123`
- Empleado: `empleado@asap.demo.com` / `Default@123`
- Analista: `analista@asap.demo.com` / `Analista@123`

## Paso a paso

### 1. Entrada como administrador

1. Abre la URL pública.
2. Ingresa con el usuario administrador.
3. Explica la marca: **ASAP design by Jeisson Steven Herrera Baquero**.

Mensaje sugerido:

> ASAP es una plataforma académica de apoyo a la decisión para estudiar cargas laborales, calcular necesidad de personal por horas mes, detectar sobrecarga y sugerir redistribuciones sin reemplazar el criterio humano.

### 2. Inicio

Muestra las tarjetas:

- Horas mes.
- Funcionarios requeridos.
- ICU ponderado.
- Tareas vencidas.

Explica:

```text
Horas mes = repeticiones mensuales × minutos por repetición / 60
Funcionarios requeridos = horas mes / 167
CP = horas mes × prioridad × dificultad × urgencia × bienestar
ICU = carga / capacidad disponible
```

### 3. Estudio 167

1. Entra a **Estudio 167**.
2. Muestra la calculadora rápida.
3. Usa un ejemplo: 280 repeticiones al mes × 20 minutos = 93,33 horas mes; 93,33 / 167 = 0,56 funcionarios.
4. Muestra el resumen por área.

### 4. Actividades

1. Entra a **Actividades**.
2. Usa filtros por área, responsable, estado, prioridad, riesgo o mes.
3. Registra una actividad nueva con periodicidad, repeticiones mensuales y minutos por repetición.
4. Muestra que el sistema calcula horas mes y funcionarios requeridos antes de guardar.
5. Usa “Sugerir automáticamente” para explicar asignación por habilidad y capacidad.

### 5. Alertas

1. Entra a **Alertas**.
2. Abre una recomendación de reasignación.
3. Lee la explicación: persona sobrecargada, persona disponible, habilidad compatible, horas mes y CP.
4. Aplica la recomendación si es pertinente.

### 6. Reportes

1. Entra a **Reportes**.
2. Muestra la vista previa del informe ejecutivo.
3. Exporta CSV.
4. Abre vista PDF e indica que se puede imprimir o guardar como PDF.

### 7. Guía y métricas

1. Entra a **Guía y métricas**.
2. Muestra el tutorial de uso.
3. Explica el glosario: horas mes, funcionarios requeridos, CP, ICU, riesgo y brecha.
4. Muestra los hitos cubiertos por el MVP académico.

### 8. Auditoría

1. Entra a **Auditoría**.
2. Muestra el registro de la recomendación aplicada.
3. Explica trazabilidad y control humano.

### 9. Entrada como empleado

1. Cierra sesión.
2. Entra como empleado.
3. Muestra que el empleado ve su propia carga y tareas, no información sensible de todos.

## Frases clave para el jurado

- “El aplicativo no automatiza decisiones laborales sensibles; entrega evidencia para revisión humana.”
- “La carga no se mide solo por número de tareas, sino por frecuencia, tiempo, dificultad, prioridad, urgencia y señales de bienestar.”
- “La regla 167 permite convertir horas mes en necesidad estimada de personal.”
- “El MVP académico permite validar el flujo central: captura, cálculo, alerta, recomendación y reporte.”
- “La versión productiva debe validarse con datos reales anonimizados y línea base manual.”

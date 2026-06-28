# Parches seguros para el HRM heredado

Este directorio no pretende modernizar por completo el HRM original. Sirve para documentar la corrección mínima que se debe hacer si alguien decide revisar o conservar el proyecto antiguo.

## Acciones mínimas

1. Reemplazar credenciales embebidas por variables de entorno o secretos del proveedor.
2. Rotar todas las contraseñas que estuvieron en el ZIP.
3. No versionar `bin`, `obj`, backups `.bak`, dumps `.sql` con datos reales ni DLLs no necesarias.
4. Crear archivos `Web.config.example`, nunca `Web.config` con secretos.
5. No desplegar públicamente el HRM antiguo sin auditoría de seguridad.

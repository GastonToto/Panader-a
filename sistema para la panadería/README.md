# Sistema de gestión para panadería

Aplicación en español basada en los documentos compartidos para el sistema de la panadería. No incluye productos, precios ni existencias inventados: se cargan al iniciar el uso.

## Iniciar

1. Abrí una terminal en esta carpeta.
2. Ejecutá `python -m http.server 8000`.
3. Abrí `http://localhost:8000` en el navegador.
4. `index.html` te lleva a `login.html`. Se crea automáticamente la cuenta inicial **Admin**, puesto **Dueño**, contraseña **12345678**. Al primer ingreso, el sistema obliga a elegir una contraseña propia. No se pueden crear otros usuarios con puesto Dueño.

## Módulos

- Inicio con ventas del día, pedidos próximos y alertas de stock mínimo.
- Ventas con productos diarios, variables y combos; unidad o kilogramo; cobro en efectivo, tarjeta, billetera virtual o transferencia; impresión de ticket.
- Recetas para que los encargados de tortas/tartas y producción consulten instrucciones.
- Insumos y alertas por nivel mínimo; el encargado de stock registra entradas de mercadería con proveedor y responsable. El dueño administra proveedores y compras.
- Pedidos especiales con cliente, contacto, fecha de entrega, seña del 50 %, comanda para producción, cobro del saldo, cancelación y control antes de marcar como entregado.
- Cierre de caja por turno con efectivo esperado, pagos electrónicos, diferencia de efectivo contado e impresión del reporte.
- Impresión separada del ticket para el cliente y de la comanda interna de producción.
- Reportes de ventas diarios, semanales, mensuales y anuales; exportación de ventas.
- Acceso con nombre y apellido, puesto y contraseña. La cuenta inicial es Admin/Dueño, con contraseña predeterminada 12345678 que se debe cambiar en el primer ingreso. Solo puede haber una cuenta con puesto Dueño; vendedores/personal de atención, panaderos y factureros se registran sin acceso; los demás puestos tienen permisos según su función.
- Copia diaria local en el navegador y descarga de una copia completa al cerrar el turno de la tarde, más descarga manual y restauración de archivos de respaldo desde Personal y proveedores.

## Almacenamiento

Los datos y el acceso se guardan en el navegador de este dispositivo; esta versión no utiliza un servidor ni sincroniza otros equipos. La contraseña inicial 12345678 es pública y está incluida en el código: cambiala en el primer ingreso y no la reutilices en otros servicios. Al cerrar el turno de la tarde, el navegador solicita descargar una copia completa en formato JSON; conservá el archivo fuera de este dispositivo. La copia incluye credenciales protegidas mediante hashes, no contraseñas en texto, y se puede restaurar desde Personal y proveedores. La copia diaria local no sustituye la descarga externa. El navegador puede bloquearla o pedir autorización, por lo que hay que confirmar que el archivo se haya guardado. La cuenta por rol organiza las pantallas, pero esta aplicación local no reemplaza una base de datos central segura.
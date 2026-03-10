# Skill: Resumen Diario de Tareas

## Cuándo usar
Cuando el usuario pida ver sus tareas, su resumen del día, qué tiene pendiente, o cualquier variación como:
- "¿Qué tengo que hacer hoy?"
- "Dame mi resumen de tareas"
- "¿Cuáles son mis pendientes?"
- "What are my tasks?"
- "Tareas del día"

## Instrucciones

1. Llama `get_clickup_tasks` para la lista **ecommerce** y para la lista **marketing** (dos llamadas).
2. Filtra solo las tareas asignadas al usuario (Jaime) que NO estén cerradas/completadas.
3. Formatea la respuesta en español con este estilo:

```
📋 Resumen de Tareas — [Día], [Fecha]

¡Buenos días Jaime! Aquí está tu plan de batalla para hoy:

🛒 Ecommerce (N tareas)
  • [PRIORIDAD] Nombre de tarea — Estado — Fecha de vencimiento
  ...

📣 Marketing (N tareas)
  • [PRIORIDAD] Nombre de tarea — Estado — Fecha de vencimiento
  ...

Total: X tareas en Y listas

💪 "Frase motivacional en español"
```

4. Mapea prioridades: 1=URGENTE, 2=ALTA, 3=NORMAL, 4=BAJA
5. Si no hay fecha de vencimiento, usa "Sin fecha"
6. Al final incluye una frase motivacional original o de un autor famoso, en español
7. Si no hay tareas, responde con un mensaje positivo: "🎉 ¡No tienes tareas pendientes! Día libre para crear cosas nuevas."

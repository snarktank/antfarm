# Dashboard de Enlaces

El *Dashboard de Enlaces* mantiene organizados los enlaces que le compartes al bot. Corre sobre el mismo servidor web del dashboard y solo se expone en tu red privada (por ejemplo, usando Tailscale).

## Cómo arrancarlo

1. Arranca el daemon del dashboard en el puerto que quieras exponer desde Tailscale:
   ```bash
   antfarm dashboard --port 5000
   ```
2. Comparte el acceso desde tu red privada (Tailscale, VPN o `ssh -L`) para que el bot y tu navegador puedan llegar al `localhost` remoto.
3. Abre el dashboard en `http://localhost:5000/links` para ver las tarjetas agrupadas por categoría, el buscador y el panel lateral de detalles.

## API pública para el bot

### Crear enlaces

El bot (o cualquier servicio dentro de la red privada) puede enviar enlaces mediante un POST JSON:

```http
POST http://localhost:5000/api/links
Content-Type: application/json

{
  "url": "https://docs.openclaw.ai",
  "title": "Documentación de OpenClaw",
  "category": "Soporte",
  "notes": "Incluye el resumen que manda el usuario en un mensaje"
}
```

- `url` es obligatorio.
- `title`, `category` y `notes` son opcionales (se rellenan con el valor por defecto si no se proporcionan).
- La respuesta incluye el registro guardado y el status `201`.

### Leer enlaces

`GET /api/links` devuelve todos los enlaces ordenados por fecha. Puedes filtrar con query params:

- `q`: busca en título, URL, categoría o notas.
- `category`: limita al nombre exacto de la categoría.

Ejemplo: `GET /api/links?q=guía&category=Soporte`.

También puedes pedir un enlace concreto con `GET /api/links/:id`.

## Persistencia local

Los enlaces se guardan en `~/.openclaw/antfarm/links.json`. El archivo puede editarse con cualquier editor; los cambios se reflejan en el dashboard tan pronto como recargas la página.

## Integrar desde OpenClaw

Desde el mismo flujo de conversación del bot puedes escoger el enlace que te envían los usuarios y hacer un `fetch` dentro de tu skill o script:

```js
await fetch("http://localhost:5000/api/links", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    url: evento.url,
    title: evento.title,
    category: evento.category ?? "Inbox",
    notes: evento.notes,
  }),
});
```

Mantén el dashboard atrás de Tailscale y no lo expongas públicamente: solo los nodos dentro de tu red privada podrán enviar enlaces.

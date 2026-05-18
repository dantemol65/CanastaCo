// stores/contexto.js — Estado temporal entre pantallas (no persiste)
import { writable } from 'svelte/store'

/**
 * Producto solicitado seleccionado desde el banner de Home.
 * Se limpia automáticamente al usarse en Precios.svelte.
 * { nombre, solicitudId } | null
 */
export const productoSolicitadoSeleccionado = writable(null)
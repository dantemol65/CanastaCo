// lib/voz.js — Wrapper de Web Speech API para reconocimiento de voz en es-AR

export function soportaVoz() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition)
}

/**
 * Escucha una frase y devuelve el texto reconocido.
 * Llama onInterim(texto) con resultados parciales mientras habla.
 * Devuelve Promise<string> con el transcript final.
 *
 * @param {{ onInterim?: (t: string) => void, timeout?: number }} opciones
 */
export function escucharFrase({ onInterim, timeout = 8000 } = {}) {
  return new Promise((resolve, reject) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { reject(new Error('Reconocimiento de voz no disponible.')); return }

    const rec = new SR()
    rec.lang           = 'es-AR'
    rec.continuous     = false   // para hasta que el usuario deja de hablar
    rec.interimResults = true    // resultados parciales mientras habla
    rec.maxAlternatives = 1

    let finalTranscript = ''
    let timer = null

    rec.onstart = () => {
      // Timeout de seguridad: si no habla en X ms, cancelar
      timer = setTimeout(() => {
        rec.stop()
        reject(new Error('Tiempo de espera agotado. Intentá de nuevo.'))
      }, timeout)
    }

    rec.onresult = (event) => {
      clearTimeout(timer)
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalTranscript += t
        } else {
          interim += t
        }
      }
      if (onInterim && interim) onInterim(interim)
      // Reiniciar timeout mientras habla
      clearTimeout(timer)
      timer = setTimeout(() => rec.stop(), timeout)
    }

    rec.onend = () => {
      clearTimeout(timer)
      const texto = finalTranscript.trim()
      if (texto) {
        resolve(texto)
      } else {
        reject(new Error('No se detectó ninguna voz. Intentá de nuevo.'))
      }
    }

    rec.onerror = (event) => {
      clearTimeout(timer)
      const msgs = {
        'not-allowed':   'Permiso de micrófono denegado. Habilitalo en la configuración.',
        'no-speech':     'No se detectó ninguna voz. Intentá de nuevo.',
        'network':       'Error de red al procesar la voz.',
        'audio-capture': 'No se encontró micrófono en el dispositivo.',
        'aborted':       null,  // cancelado por el usuario, no error
      }
      const msg = msgs[event.error]
      if (msg !== null) reject(new Error(msg || `Error de voz: ${event.error}`))
    }

    try {
      rec.start()
    } catch (e) {
      reject(new Error('No se pudo iniciar el reconocimiento de voz.'))
    }
  })
}
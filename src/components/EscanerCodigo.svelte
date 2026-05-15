<script>
  import { onMount, onDestroy, createEventDispatcher } from 'svelte'
  import {
    soportaBarcodeDetector,
    crearDetectorNativo,
    detectarDesdeFrame,
    detectarDesdeVideoZxing,
    abrirCamara,
    cerrarCamara,
    buscarEnOFF,
  } from '../lib/barcode.js'

  // Eventos:
  //   on:encontrado  → { codigoBarras, nombre, marca, categoria, unidad, imagen, fuente }
  //   on:noEncontrado → { codigoBarras }
  //   on:cancelar
  const dispatch = createEventDispatcher()

  let estado = 'iniciando'  // 'iniciando' | 'escaneando' | 'buscando' | 'encontrado' | 'noEncontrado' | 'error'
  let mensajeError = ''
  let stream       = null
  let detector     = null
  let usaNativo    = false
  let loopId       = null
  let videoEl      = null
  let canvasEl     = null
  let codigoLeido  = ''
  let resultadoOFF = null
  let flashActivo  = false
  let detectando   = false   // guard: evita procesar dos códigos simultáneamente

  // Para el "visor" animado
  let beepAudio    = null

  onMount(async () => {
    try {
      stream  = await abrirCamara()
      usaNativo = soportaBarcodeDetector()
      if (usaNativo) {
        detector = await crearDetectorNativo()
      }
      // Asignar stream al video
      if (videoEl) {
        videoEl.srcObject = stream
        await videoEl.play()
      }
      estado = 'escaneando'
      iniciarLoop()
    } catch (err) {
      mensajeError = err.message
      estado = 'error'
    }
  })

  onDestroy(() => {
    pararLoop()
    cerrarCamara(stream)
  })

  // ── Loop de detección ─────────────────────────────────────────────────

  function iniciarLoop() {
    if (usaNativo) {
      loopNativo()
    } else {
      loopZxing()
    }
  }

  function pararLoop() {
    clearTimeout(loopId)
    loopId = null
  }

  async function loopNativo() {
    if (!videoEl || estado !== 'escaneando') return
    if (videoEl.readyState >= 2) {
      // Capturar frame al canvas
      const ctx = canvasEl.getContext('2d')
      canvasEl.width  = videoEl.videoWidth
      canvasEl.height = videoEl.videoHeight
      ctx.drawImage(videoEl, 0, 0)

      try {
        const bitmap = await createImageBitmap(canvasEl)
        const codigo = await detectarDesdeFrame(detector, bitmap)
        bitmap.close()
        if (codigo) { await onCodigoDetectado(codigo); return }
      } catch {}
    }
    loopId = setTimeout(loopNativo, 200)
  }

  async function loopZxing() {
    if (!videoEl || estado !== 'escaneando') return
    const codigo = await detectarDesdeVideoZxing(videoEl)
    if (codigo) { await onCodigoDetectado(codigo); return }
    loopId = setTimeout(loopZxing, 300)
  }

  // ── Código detectado → buscar en OFF ─────────────────────────────────

  async function onCodigoDetectado(codigo) {
    // Guard: si ya estamos procesando un código, ignorar
    if (detectando) return
    detectando = true

    pararLoop()
    flashActivo = true
    codigoLeido = codigo
    estado = 'buscando'
    playBeep()
    setTimeout(() => flashActivo = false, 300)

    // Capturar el resultado en variable local para que confirmarProducto
    // siempre despache ESTE resultado y no uno sobreescrito por un re-scan
    const resultado = await buscarEnOFF(codigo)
    if (resultado) {
      resultadoOFF = { ...resultado }   // copia defensiva
      estado = 'encontrado'
    } else {
      estado = 'noEncontrado'
    }
  }

  function confirmarProducto() {
    // Dispatch de la copia local capturada en este ciclo de escaneo
    dispatch('encontrado', { ...resultadoOFF })
  }

  function usarSoloCodigoManual() {
    dispatch('noEncontrado', { codigoBarras: codigoLeido })
  }

  function reescanear() {
    codigoLeido  = ''
    resultadoOFF = null
    detectando   = false
    estado = 'escaneando'
    // Delay: da tiempo al usuario para apartar la cámara del producto anterior
    // sin el delay el loop detecta el mismo código inmediatamente
    setTimeout(iniciarLoop, 1500)
  }

  function cancelar() {
    dispatch('cancelar')
  }

  function playBeep() {
    try {
      const ctx = new AudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.15)
    } catch {}
  }
</script>

<div class="escanear-wrap">

  <!-- Overlay oscuro de fondo -->
  <div class="escanear-bg"></div>

  <div class="escanear-modal">

    <!-- Header -->
    <div class="escan-header">
      <button class="btn-cerrar-escan" on:click={cancelar} aria-label="Cancelar">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6"  y1="6" x2="18" y2="18"/>
        </svg>
      </button>
      <span class="escan-titulo">Escanear código</span>
      <div style="width:36px"></div>
    </div>

    <!-- Visor de cámara -->
    {#if estado === 'iniciando' || estado === 'escaneando' || estado === 'buscando'}
      <div class="visor-wrap" class:flash={flashActivo}>

        <!-- Video -->
        <video
          bind:this={videoEl}
          class="visor-video"
          playsinline
          muted
          autoplay
        ></video>
        <canvas bind:this={canvasEl} style="display:none"></canvas>

        <!-- Marco animado -->
        <div class="visor-marco">
          <span class="marco-corner tl"></span>
          <span class="marco-corner tr"></span>
          <span class="marco-corner bl"></span>
          <span class="marco-corner br"></span>
          {#if estado === 'escaneando'}
            <div class="scan-line"></div>
          {/if}
        </div>

        <!-- Estado overlay -->
        <div class="visor-estado">
          {#if estado === 'iniciando'}
            <div class="estado-chip">
              <div class="mini-spinner"></div>
              Iniciando cámara…
            </div>
          {:else if estado === 'escaneando'}
            <div class="estado-chip">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M3 9V5h4M21 9V5h-4M3 15v4h4M21 15v4h-4"/>
              </svg>
              Apuntá al código de barras
            </div>
          {:else if estado === 'buscando'}
            <div class="estado-chip buscando">
              <div class="mini-spinner"></div>
              Buscando "{codigoLeido}"…
            </div>
          {/if}
        </div>
      </div>

    <!-- Error de cámara -->
    {:else if estado === 'error'}
      <div class="resultado-wrap">
        <div class="resultado-icon">📵</div>
        <p class="resultado-titulo">Sin acceso a la cámara</p>
        <p class="resultado-sub">{mensajeError}</p>
        <button class="btn btn-primary btn-full" on:click={cancelar}>Ingresar manualmente</button>
      </div>

    <!-- Producto encontrado en OFF -->
    {:else if estado === 'encontrado'}
      <div class="resultado-wrap">
        <div class="found-badge">✓ Producto identificado</div>

        <div class="producto-encontrado">
          {#if resultadoOFF.imagen}
            <img
              src={resultadoOFF.imagen}
              alt={resultadoOFF.nombre}
              class="prod-imagen"
              loading="lazy"
            />
          {:else}
            <div class="prod-imagen-placeholder">🛒</div>
          {/if}

          <div class="prod-datos">
            <p class="prod-nombre">{resultadoOFF.nombre}</p>
            {#if resultadoOFF.marca}
              <p class="prod-marca">{resultadoOFF.marca}</p>
            {/if}
            <div class="prod-chips">
              <span class="chip-cat">
                {resultadoOFF.categoria}
              </span>
              <span class="chip-cod">
                #{resultadoOFF.codigoBarras}
              </span>
            </div>
          </div>
        </div>

        <p class="fuente-nota">
          Datos de <strong>{resultadoOFF.fuente}</strong>
          — podés corregirlos al guardar el precio.
        </p>

        <div class="resultado-acciones">
          <button class="btn btn-primary btn-full" on:click={confirmarProducto}>
            Usar este producto →
          </button>
          <button class="btn-link" on:click={reescanear}>
            Escanear otro código
          </button>
        </div>
      </div>

    <!-- Código leído pero no en OFF -->
    {:else if estado === 'noEncontrado'}
      <div class="resultado-wrap">
        <div class="notfound-badge">Código no encontrado</div>

        <div class="cod-notfound">
          <span class="cod-barras-icon">|||||||||||</span>
          <span class="cod-valor">{codigoLeido}</span>
        </div>

        <p class="resultado-sub">
          El código <strong>{codigoLeido}</strong> no está en la base de datos.
          Podés crear el producto manualmente.
        </p>

        <div class="resultado-acciones">
          <button class="btn btn-primary btn-full" on:click={usarSoloCodigoManual}>
            Crear producto manualmente
          </button>
          <button class="btn-link" on:click={reescanear}>
            Intentar de nuevo
          </button>
        </div>
      </div>
    {/if}

  </div>
</div>

<style>
  .escanear-wrap {
    position: fixed; inset: 0; z-index: 10000;
    display: flex; align-items: flex-end; justify-content: center;
  }
  .escanear-bg {
    position: absolute; inset: 0;
    background: rgba(0,0,0,0.75);
  }

  .escanear-modal {
    position: relative; z-index: 1;
    width: 100%; max-width: 430px;
    background: #111; border-radius: 20px 20px 0 0;
    overflow: hidden;
    animation: sheetUp 0.28s cubic-bezier(0.34, 1.4, 0.64, 1);
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }
  @keyframes sheetUp {
    from { transform: translateY(100%); }
    to   { transform: translateY(0); }
  }

  /* Header */
  .escan-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 16px 12px;
    background: rgba(0,0,0,0.6);
  }
  .btn-cerrar-escan {
    width: 36px; height: 36px; border-radius: 50%;
    background: rgba(255,255,255,0.12); border: none;
    color: white; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
  }
  .escan-titulo {
    font-size: 15px; font-weight: 700; color: white;
    font-family: var(--f-ui);
  }

  /* Visor cámara */
  .visor-wrap {
    position: relative; width: 100%;
    aspect-ratio: 4/3;
    background: #000; overflow: hidden;
    transition: background 0.1s;
  }
  .visor-wrap.flash { background: white; }
  .visor-video {
    width: 100%; height: 100%; object-fit: cover;
  }

  /* Marco de escaneo */
  .visor-marco {
    position: absolute; inset: 0;
    display: flex; align-items: center; justify-content: center;
    pointer-events: none;
  }
  .marco-corner {
    position: absolute; width: 24px; height: 24px;
    border-color: rgba(27,200,100,0.9); border-style: solid;
  }
  .marco-corner.tl { top: 20%; left: 10%;  border-width: 3px 0 0 3px; border-radius: 4px 0 0 0; }
  .marco-corner.tr { top: 20%; right: 10%; border-width: 3px 3px 0 0; border-radius: 0 4px 0 0; }
  .marco-corner.bl { bottom: 20%; left: 10%;  border-width: 0 0 3px 3px; border-radius: 0 0 0 4px; }
  .marco-corner.br { bottom: 20%; right: 10%; border-width: 0 3px 3px 0; border-radius: 0 0 4px 0; }

  /* Línea animada de escaneo */
  .scan-line {
    position: absolute;
    left: 11%; right: 11%; height: 2px;
    background: linear-gradient(90deg, transparent, rgba(27,200,100,0.9), transparent);
    animation: scanMove 1.8s ease-in-out infinite;
    box-shadow: 0 0 8px rgba(27,200,100,0.6);
  }
  @keyframes scanMove {
    0%   { top: 21%; }
    50%  { top: 78%; }
    100% { top: 21%; }
  }

  /* Estado overlay */
  .visor-estado {
    position: absolute; bottom: 12px; left: 0; right: 0;
    display: flex; justify-content: center;
  }
  .estado-chip {
    background: rgba(0,0,0,0.65); color: white;
    font-size: 12px; font-weight: 600; padding: 7px 14px;
    border-radius: 99px;
    display: flex; align-items: center; gap: 6px;
    backdrop-filter: blur(4px);
    font-family: var(--f-ui);
  }
  .estado-chip.buscando { background: rgba(27,107,58,0.85); }

  /* Spinner mini */
  .mini-spinner {
    width: 12px; height: 12px;
    border: 2px solid rgba(255,255,255,0.3);
    border-top-color: white; border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Resultados */
  .resultado-wrap {
    background: var(--c-surface);
    padding: 20px 20px 12px;
  }

  .found-badge {
    display: inline-flex; align-items: center; gap: 6px;
    background: #D1FAE5; color: #059669;
    font-size: 12px; font-weight: 700; padding: 5px 12px;
    border-radius: 99px; margin-bottom: 16px;
    font-family: var(--f-ui);
  }
  .notfound-badge {
    display: inline-block;
    background: #FEF3C7; color: #D97706;
    font-size: 12px; font-weight: 700; padding: 5px 12px;
    border-radius: 99px; margin-bottom: 16px;
    font-family: var(--f-ui);
  }

  /* Producto encontrado */
  .producto-encontrado {
    display: flex; gap: 14px; align-items: flex-start;
    background: var(--c-surface-2); border-radius: 14px;
    padding: 14px; margin-bottom: 12px;
  }
  .prod-imagen {
    width: 64px; height: 64px; object-fit: contain;
    border-radius: 8px; background: white; flex-shrink: 0;
  }
  .prod-imagen-placeholder {
    width: 64px; height: 64px; border-radius: 8px;
    background: var(--c-border);
    display: flex; align-items: center; justify-content: center;
    font-size: 28px; flex-shrink: 0;
  }
  .prod-datos { flex: 1; min-width: 0; }
  .prod-nombre {
    font-size: 16px; font-weight: 700; color: var(--c-text);
    margin-bottom: 2px; font-family: var(--f-ui);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .prod-marca {
    font-size: 13px; color: var(--c-text-light); margin-bottom: 8px;
    font-family: var(--f-ui);
  }
  .prod-chips { display: flex; gap: 6px; flex-wrap: wrap; }
  .chip-cat {
    font-size: 11px; font-weight: 600; padding: 3px 9px;
    border-radius: 99px; background: rgba(27,107,58,0.1); color: var(--c-primary);
    font-family: var(--f-ui); text-transform: capitalize;
  }
  .chip-cod {
    font-size: 11px; font-weight: 600; padding: 3px 9px;
    border-radius: 99px; background: var(--c-surface); color: var(--c-text-light);
    font-family: 'Courier New', monospace;
  }

  .fuente-nota {
    font-size: 11px; color: var(--c-text-light); margin-bottom: 16px;
    font-family: var(--f-ui); line-height: 1.4;
  }
  .fuente-nota a { color: var(--c-primary); }

  /* Código no encontrado */
  .cod-notfound {
    display: flex; flex-direction: column; align-items: center;
    padding: 20px; gap: 6px; margin-bottom: 12px;
  }
  .cod-barras-icon {
    font-size: 28px; letter-spacing: 3px; color: var(--c-text-light);
    font-family: 'Courier New', monospace;
  }
  .cod-valor {
    font-family: 'Courier New', monospace; font-size: 20px;
    font-weight: 700; color: var(--c-text); letter-spacing: 2px;
  }

  .resultado-icon { font-size: 48px; text-align: center; margin-bottom: 12px; }
  .resultado-titulo {
    font-size: 18px; font-weight: 700; color: var(--c-text);
    text-align: center; margin-bottom: 6px; font-family: var(--f-brand);
  }
  .resultado-sub {
    font-size: 13px; color: var(--c-text-light); text-align: center;
    margin-bottom: 16px; line-height: 1.5; font-family: var(--f-ui);
  }

  .resultado-acciones { display: flex; flex-direction: column; gap: 8px; }
  .btn-link {
    background: none; border: none; color: var(--c-text-light);
    font-size: 13px; text-decoration: underline; cursor: pointer;
    text-align: center; padding: 6px; font-family: var(--f-ui);
  }
</style>
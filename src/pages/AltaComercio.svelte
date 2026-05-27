<script>
  import { onMount } from 'svelte'
  import { currentPage, userProfile } from '../stores/auth.js'
  import { altaComercio, TIPOS_COMERCIO } from '../stores/comercios.js'
  import { provincias, getDepartamentos, getLocalidades, resolverNombresLocalidad } from '../lib/georef.js'
  import { obtenerPosicion, geocodificarDireccion } from '../lib/geolocation.js'
  import { appConfig, cargarConfig } from '../stores/config.js'

  // Form state
  let nombre      = ''
  let tipo        = ''
  let direccion   = ''
  let lat         = null
  let lng         = null
  let provinciaId    = $userProfile?.provincia    || ''
  let departamentoId = $userProfile?.departamento || ''
  let localidadId    = $userProfile?.localidad    || ''
  let descripcion = ''

  let departamentos = []
  let localidades   = []
  let loadingDepts  = false
  let loadingLocs   = false

  let saving      = false
  let errors      = {}
  let gpsLoading  = false
  let gpsOk       = false
  let geocoding   = false
  let geoAprox    = false  // true si las coords son del centro de la localidad, no la calle

  // ── Restricción de localidades ───────────────────────────────────────────
  let localidadesRestricc  = []   // [{ id, label }]
  let cargandoRestricc     = false
  let resolviendoUbicacion = false

  $: restriccionActiva = $appConfig?.restriccionActiva && ($appConfig?.localidadesHabilitadas?.length > 0)

  // Cargar datos geográficos del perfil del usuario
  onMount(async () => {
    // Cargar config global si no está cargada
    if (!$appConfig) await cargarConfig()

    // Si hay restricción, resolver nombres de las localidades habilitadas
    if ($appConfig?.restriccionActiva && $appConfig?.localidadesHabilitadas?.length > 0) {
      cargandoRestricc = true
      const ids = $appConfig.localidadesHabilitadas
      const map = await resolverNombresLocalidad(ids).catch(() => new Map())
      localidadesRestricc = ids.map(id => ({
        id,
        label: map.get(`${id}__label`) || map.get(id) || id,
      }))
      cargandoRestricc = false

      // En modo restringido: si el perfil del usuario ya tiene localidad habilitada,
      // pre-seleccionarla y resolver provincia/departamento
      if (localidadId && ids.includes(localidadId)) {
        await resolverProvDeptoDesdeLocalidad(localidadId)
      } else {
        // La localidad del perfil no está en la lista habilitada (o no hay): limpiar
        localidadId    = ''
        provinciaId    = ''
        departamentoId = ''
      }
    } else {
      // Modo normal: cargar cascada geográfica desde el perfil
      if (provinciaId) {
        loadingDepts = true
        departamentos = await getDepartamentos(provinciaId).catch(() => [])
        loadingDepts = false
      }
      if (departamentoId) {
        loadingLocs = true
        localidades = await getLocalidades(departamentoId).catch(() => [])
        loadingLocs = false
      }
    }
  })

  // ── Resolver provincia/departamento desde una localidad (modo restringido) ─
  async function resolverProvDeptoDesdeLocalidad(locId) {
    if (!locId) { provinciaId = ''; departamentoId = ''; return }
    resolviendoUbicacion = true
    try {
      const url  = `https://apis.datos.gob.ar/georef/api/localidades?id=${locId}&campos=id,nombre,provincia,departamento&max=1`
      const res  = await fetch(url)
      const data = await res.json()
      const loc  = data.localidades?.[0]
      if (loc) {
        provinciaId    = String(loc.provincia?.id    || '')
        departamentoId = String(loc.departamento?.id || '')
      }
    } catch (e) {
      console.error('resolverProvDepto:', e)
    } finally {
      resolviendoUbicacion = false
    }
    // Disparar geocodificación automática si ya hay dirección
    autoGeocodificar()
  }

  // Geocodificar automáticamente cuando hay dirección + localidad completos
  let geoTimeout = null
  async function autoGeocodificar() {
    if (!localidadId) return
    clearTimeout(geoTimeout)
    geoTimeout = setTimeout(async () => {
      geocoding = true
      geoAprox  = false
      lat = null
      lng = null
      gpsOk = false
      try {
        // Nombre legible de localidad y provincia para geocodificar
        let nomLocalidad = ''
        let nomProvincia = ''

        if (restriccionActiva) {
          nomLocalidad = localidadesRestricc.find(l => l.id === localidadId)?.label || ''
          // Resolver nombre de provincia si tenemos el ID
          if (provinciaId) {
            nomProvincia = provincias.find(p => p.id === provinciaId)?.nombre || ''
            // Si no está en la lista estática (IDs numéricos), intentar vía georef
            if (!nomProvincia) {
              try {
                const r = await fetch(`https://apis.datos.gob.ar/georef/api/provincias?id=${provinciaId}&campos=id,nombre&max=1`)
                const d = await r.json()
                nomProvincia = d.provincias?.[0]?.nombre || ''
              } catch {}
            }
          }
        } else {
          nomLocalidad = localidades.find(l => l.id === localidadId)?.nombre || ''
          nomProvincia = provincias.find(p => p.id === provinciaId)?.nombre   || ''
        }

        // Intento 1: dirección completa + localidad + provincia
        let result = null
        if (direccion.trim()) {
          result = await geocodificarDireccion({
            direccion: direccion.trim(),
            localidad: nomLocalidad,
            provincia: nomProvincia,
          })
        }

        // Intento 2: solo localidad + provincia (fallback al centro)
        if (!result && nomLocalidad) {
          result = await geocodificarDireccion({
            direccion: '',
            localidad: nomLocalidad,
            provincia: nomProvincia,
          })
          if (result) result.aproximado = true
        }

        // Intento 3: solo provincia (último recurso)
        if (!result && nomProvincia) {
          result = await geocodificarDireccion({
            direccion: '',
            localidad: '',
            provincia: nomProvincia,
          })
          if (result) result.aproximado = true
        }

        if (result) {
          lat      = result.lat
          lng      = result.lng
          gpsOk    = true
          geoAprox = result.aproximado || false
        }
      } catch (e) {
        console.error('autoGeocodificar:', e)
      } finally {
        geocoding = false
      }
    }, 800)
  }

  async function onProvinciaChange() {
    departamentoId = ''; localidadId = ''
    departamentos = []; localidades = []
    if (!provinciaId) return
    loadingDepts = true
    departamentos = await getDepartamentos(provinciaId).catch(() => [])
    loadingDepts = false
  }

  async function onDepartamentoChange() {
    localidadId = ''; localidades = []
    if (!departamentoId) return
    loadingLocs = true
    localidades = await getLocalidades(departamentoId).catch(() => [])
    loadingLocs = false
  }

  async function usarGPS() {
    gpsLoading = true
    try {
      const pos = await obtenerPosicion()
      lat = pos.lat
      lng = pos.lng
      gpsOk = true
    } catch (e) {
      errors.gps = e.message
    } finally {
      gpsLoading = false
    }
  }

  function validate() {
    errors = {}
    if (!nombre.trim() || nombre.trim().length < 3)
      errors.nombre = 'El nombre debe tener al menos 3 caracteres.'
    if (!tipo)
      errors.tipo = 'Seleccioná el tipo de comercio.'
    if (!direccion.trim())
      errors.direccion = 'Ingresá la dirección del comercio.'

    if (restriccionActiva) {
      if (!localidadId)
        errors.localidad = 'Seleccioná la localidad del comercio.'
    } else {
      if (!provinciaId)    errors.provincia    = 'Seleccioná la provincia.'
      if (!departamentoId) errors.departamento = 'Seleccioná el departamento.'
      if (!localidadId)    errors.localidad    = 'Seleccioná la localidad.'
    }
    return Object.keys(errors).length === 0
  }

  async function handleSubmit() {
    if (!validate() || saving) return
    saving = true
    errors = {}
    try {
      const id = await altaComercio({
        nombre, tipo, direccion,
        lat, lng,
        provincia:    provinciaId,
        departamento: departamentoId,
        localidad:    localidadId,
        descripcion,
      })
      currentPage.set('detalle-comercio:' + id)
    } catch (e) {
      errors.general = 'No se pudo guardar el comercio. Verificá tu conexión.'
      saving = false
    }
  }

  function volver() { currentPage.set('buscar') }

  function nombreProvincia(id)    { return provincias.find(p=>p.id===id)?.nombre || '' }
  function nombreDepartamento(id) { return departamentos.find(d=>d.id===id)?.nombre || '' }
  function nombreLocalidad(id)    {
    if (restriccionActiva) return localidadesRestricc.find(l=>l.id===id)?.label || ''
    return localidades.find(l=>l.id===id)?.nombre || ''
  }
</script>

<div class="app-shell alta-shell">

  <header class="alta-header">
    <button class="btn-volver" on:click={volver} aria-label="Volver">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>
    <h1 class="alta-titulo">Agregar comercio</h1>
  </header>

  <div class="alta-content">
    <p class="alta-desc">
      El comercio quedará en estado <strong>pendiente</strong> hasta ser verificado por otros usuarios o el administrador.
    </p>

    {#if errors.general}
      <div class="alert-error">{errors.general}</div>
    {/if}

    <!-- Nombre -->
    <div class="form-group" class:has-error={errors.nombre}>
      <label class="form-label" for="nombre">Nombre del comercio</label>
      <input id="nombre" class="form-input" class:error={errors.nombre}
        type="text" bind:value={nombre} placeholder="Ej: Supermercado La Unión"
        maxlength="80" autocomplete="off" />
      {#if errors.nombre}<span class="field-error">{errors.nombre}</span>{/if}
    </div>

    <!-- Tipo -->
    <div class="form-group" class:has-error={errors.tipo}>
      <p class="form-label" id="tipo-label">Tipo de comercio</p>
      <div class="tipo-grid">
        {#each TIPOS_COMERCIO as t}
          <button
            type="button"
            class="tipo-btn"
            class:selected={tipo === t.id}
            on:click={() => tipo = t.id}
          >
            <span class="tipo-emoji">{t.emoji}</span>
            <span class="tipo-label">{t.label}</span>
          </button>
        {/each}
      </div>
      {#if errors.tipo}<span class="field-error">{errors.tipo}</span>{/if}
    </div>

    <!-- Dirección -->
    <div class="form-group" class:has-error={errors.direccion}>
      <label class="form-label" for="direccion">Dirección</label>
      <input id="direccion" class="form-input" class:error={errors.direccion}
        type="text" bind:value={direccion}
        placeholder="Ej: San Martín 420, frente a la plaza"
        autocomplete="off"
        on:blur={autoGeocodificar} />
      {#if errors.direccion}<span class="field-error">{errors.direccion}</span>{/if}
    </div>

    <!-- GPS -->
    <div class="form-group">
      <label class="form-label" for="gps-btn">Ubicación GPS</label>
      <div class="gps-aviso">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--c-primary)" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <span>
          <strong>Recomendado:</strong> usá el GPS para marcar la ubicación exacta del comercio.
          La dirección de calle se usa como referencia, pero puede tener menor precisión en zonas sin mapa actualizado.
        </span>
      </div>
      <button type="button" id="gps-btn" class="gps-btn-full" on:click={usarGPS} disabled={gpsLoading || geocoding}>
        {#if geocoding}
          <div class="mini-spinner"></div> Buscando dirección…
        {:else if gpsOk && !geoAprox}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--c-primary)" stroke="none">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
          </svg>
          Ubicación encontrada ✓ — tocá para usar GPS exacto
        {:else if gpsOk && geoAprox}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--c-accent)" stroke="none">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
          </svg>
          Ubicación aproximada (centro de localidad) — tocá para usar GPS exacto
        {:else if gpsLoading}
          <div class="mini-spinner"></div> Obteniendo GPS…
        {:else}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="12" cy="12" r="3"/>
            <path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>
          </svg>
          Usar mi ubicación GPS exacta
        {/if}
      </button>
      {#if errors.gps}<span class="field-error">{errors.gps}</span>{/if}

      {#if geoAprox && lat && lng}
        <p class="geo-aprox-aviso">
          📍 Ubicación aproximada al centro de la localidad. Para mayor precisión usá el GPS.
        </p>
      {:else if !lat && !lng && !geocoding && localidadId}
        <p class="geo-aprox-aviso geo-notfound">
          ⚠️ No se encontró la dirección. Usá el GPS para marcar la ubicación exacta.
        </p>
      {/if}
    </div>

    <!-- ── Localidad: modo restringido vs. modo normal ── -->

    {#if restriccionActiva}

      <!-- Banner de restricción -->
      <div class="restricc-banner">
        📍 La app está disponible en localidades seleccionadas durante esta etapa de evaluación.
      </div>

      <!-- Selector simple de localidades habilitadas -->
      <div class="form-group" class:has-error={errors.localidad}>
        <label class="form-label" for="localidad-restricc">Localidad del comercio</label>
        {#if cargandoRestricc}
          <div class="form-select" style="color:var(--c-text-light)">Cargando localidades…</div>
        {:else}
          <select
            id="localidad-restricc"
            class="form-select"
            class:error={errors.localidad}
            bind:value={localidadId}
            on:change={() => resolverProvDeptoDesdeLocalidad(localidadId)}
          >
            <option value="">Seleccioná la localidad…</option>
            {#each localidadesRestricc as loc}
              <option value={loc.id}>{loc.label}</option>
            {/each}
          </select>
        {/if}
        {#if errors.localidad}
          <span class="field-error">{errors.localidad}</span>
        {/if}
        {#if resolviendoUbicacion}
          <span class="resolviendo-msg">⏳ Obteniendo datos de ubicación…</span>
        {:else if localidadId && provinciaId}
          <span class="resolviendo-ok">✓ Ubicación resuelta</span>
        {/if}
      </div>

    {:else}

      <!-- Modo normal: selectores en cascada -->

      <!-- Provincia -->
      <div class="form-group" class:has-error={errors.provincia}>
        <label class="form-label" for="prov-alta">Provincia</label>
        <select id="prov-alta" class="form-select" class:error={errors.provincia}
          bind:value={provinciaId} on:change={onProvinciaChange}>
          <option value="">Seleccioná la provincia…</option>
          {#each provincias as p}<option value={p.id}>{p.nombre}</option>{/each}
        </select>
        {#if errors.provincia}<span class="field-error">{errors.provincia}</span>{/if}
      </div>

      <!-- Departamento -->
      <div class="form-group" class:has-error={errors.departamento}>
        <label class="form-label" for="dept-alta">Departamento / Partido</label>
        <select id="dept-alta" class="form-select" class:error={errors.departamento}
          bind:value={departamentoId} on:change={onDepartamentoChange}
          disabled={!provinciaId || loadingDepts}>
          <option value="">{!provinciaId ? 'Primero elegí provincia' : loadingDepts ? 'Cargando…' : 'Seleccioná…'}</option>
          {#each departamentos as d}<option value={d.id}>{d.nombre}</option>{/each}
        </select>
        {#if errors.departamento}<span class="field-error">{errors.departamento}</span>{/if}
      </div>

      <!-- Localidad -->
      <div class="form-group" class:has-error={errors.localidad}>
        <label class="form-label" for="loc-alta">Localidad</label>
        <select id="loc-alta" class="form-select" class:error={errors.localidad}
          bind:value={localidadId}
          disabled={!departamentoId || loadingLocs}
          on:change={autoGeocodificar}>
          <option value="">{!departamentoId ? 'Primero elegí departamento' : loadingLocs ? 'Cargando…' : 'Seleccioná…'}</option>
          {#each localidades as l}<option value={l.id}>{l.nombre}</option>{/each}
        </select>
        {#if errors.localidad}<span class="field-error">{errors.localidad}</span>{/if}
      </div>

    {/if}

    <!-- Preview ubicación -->
    {#if localidadId && !restriccionActiva}
      <div class="location-preview">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--c-primary)" stroke="none">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
        </svg>
        {nombreLocalidad(localidadId)}{departamentoId ? ', ' + nombreDepartamento(departamentoId) : ''}{provinciaId ? ', ' + nombreProvincia(provinciaId) : ''}
      </div>
    {/if}

    <!-- Descripción -->
    <div class="form-group">
      <label class="form-label" for="desc-alta">Descripción <span class="form-label-opt">(opcional)</span></label>
      <textarea id="desc-alta" class="form-textarea"
        bind:value={descripcion}
        placeholder="Ej: Local sobre la ruta principal, estacionamiento propio…"
        rows="3" maxlength="300"></textarea>
    </div>

    <!-- Submit -->
    <button class="btn btn-primary btn-full submit-btn"
      on:click={handleSubmit} disabled={saving}>
      {#if saving}
        <div class="btn-spinner-w"></div> Guardando…
      {:else}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        Agregar comercio
      {/if}
    </button>

    <p class="aviso-pendiente">
      El comercio aparecerá como <strong>pendiente de verificación</strong>. Otros usuarios podrán confirmar que existe en esa dirección.
    </p>

  </div>
</div>

<style>
  .alta-shell {
    background: var(--c-bg);
    min-height: 100dvh;
    padding-bottom: 32px;
  }

  .alta-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    background: white;
    border-bottom: 1px solid var(--c-border);
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .btn-volver {
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    color: var(--c-text);
    display: flex;
  }
  .alta-titulo {
    font-family: var(--font-brand);
    font-size: 1.15rem;
    color: var(--c-primary);
    margin: 0;
  }

  .alta-content {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .alta-desc {
    font-size: 0.82rem;
    color: var(--c-text-muted);
    background: #F0FDF4;
    border: 1px solid #BBF7D0;
    border-radius: 10px;
    padding: 10px 12px;
    margin-bottom: 8px;
  }

  .alert-error {
    background: #FEF2F2;
    border: 1px solid #FECACA;
    color: #991B1B;
    font-size: 0.83rem;
    padding: 10px 12px;
    border-radius: 10px;
    margin-bottom: 4px;
  }

  /* Restricción */
  .restricc-banner {
    font-size: 0.82rem;
    color: var(--c-primary-dim);
    background: rgba(27,107,58,0.07);
    border: 1px solid rgba(27,107,58,0.18);
    border-radius: 10px;
    padding: 10px 12px;
    margin-bottom: 4px;
  }

  .resolviendo-msg {
    font-size: 0.78rem;
    color: var(--c-text-light);
    margin-top: 4px;
  }
  .resolviendo-ok {
    font-size: 0.78rem;
    color: var(--c-primary);
    font-weight: 600;
    margin-top: 4px;
  }

  /* Tipo grid */
  .tipo-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .tipo-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 10px 6px;
    border: 1.5px solid var(--c-border);
    border-radius: 12px;
    background: white;
    cursor: pointer;
    transition: all 0.15s;
  }
  .tipo-btn.selected {
    border-color: var(--c-primary);
    background: #F0FDF4;
  }
  .tipo-emoji { font-size: 1.3rem; }
  .tipo-label { font-size: 0.68rem; font-weight: 600; color: var(--c-text-muted); text-align: center; }
  .tipo-btn.selected .tipo-label { color: var(--c-primary); }

  /* GPS */
  .gps-aviso {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    background: #EFF6FF;
    border: 1px solid #BFDBFE;
    border-radius: 10px;
    padding: 9px 12px;
    font-size: 0.78rem;
    color: #1E40AF;
    line-height: 1.4;
    margin-bottom: 8px;
  }
  .gps-aviso svg { flex-shrink: 0; margin-top: 1px; }

  .geo-aprox-aviso {
    font-size: 0.75rem;
    color: #92400E;
    background: #FFF7ED;
    border: 1px solid #FED7AA;
    border-radius: 8px;
    padding: 7px 10px;
    margin: 0;
  }
  .geo-notfound {
    color: #991B1B;
    background: #FEF2F2;
    border-color: #FECACA;
  }

  .gps-btn-full {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 11px;
    border: 1.5px dashed var(--c-border);
    border-radius: 12px;
    background: white;
    color: var(--c-text-muted);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    font-family: var(--font-ui);
    transition: all 0.15s;
  }
  .gps-btn-full:not(:disabled):hover { border-color: var(--c-primary); color: var(--c-primary); }
  .gps-btn-full:disabled { opacity: 0.7; cursor: default; }

  .mini-spinner {
    width: 14px; height: 14px;
    border: 2px solid #ccc;
    border-top-color: var(--c-primary);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* Textarea */
  .form-textarea {
    width: 100%;
    padding: 10px 14px;
    border: 1.5px solid var(--c-border);
    border-radius: 12px;
    font-size: 0.9rem;
    font-family: var(--font-ui);
    color: var(--c-text);
    background: white;
    outline: none;
    resize: vertical;
    min-height: 80px;
    box-sizing: border-box;
  }
  .form-textarea:focus { border-color: var(--c-primary); }

  /* Otros */
  .form-label-opt { font-weight: 400; color: var(--c-text-muted); }

  .location-preview {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.78rem;
    color: var(--c-primary);
    font-weight: 600;
    background: #F0FDF4;
    border-radius: 8px;
    padding: 7px 10px;
    margin-top: -4px;
  }

  .submit-btn { margin-top: 8px; }

  .aviso-pendiente {
    font-size: 0.75rem;
    color: var(--c-text-muted);
    text-align: center;
    margin-top: 4px;
  }
</style>
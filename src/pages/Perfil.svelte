<script>
  import { onMount } from 'svelte'
  import { get } from 'svelte/store'
  import { currentUser, userProfile, currentPage, saveUserProfile, signOut, verificarAliasDisponible } from '../stores/auth.js'
  import { cargarFotoCacheada } from '../lib/fotocache.js'
  import { provincias, getDepartamentos, getLocalidades, getNombreProvincia, resolverNombresLocalidad } from '../lib/georef.js'
  import { appConfig, cargarConfig, getLocalidadesHabilitadas } from '../stores/config.js'
  import BottomNav from '../components/BottomNav.svelte'

  // ── Form state ────────────────────────────────────────────────────────────
  let alias          = ''
  let provinciaId    = ''
  let departamentoId = ''
  let localidadId    = ''
  let barrio         = ''
  let fotoCustom     = ''

  let saving  = false
  let errors  = {}

  // ── Alias — unicidad ──────────────────────────────────────────────────────
  let aliasDisponible  = null   // null=sin verificar | true=libre | false=ocupado
  let verificandoAlias = false

  // ── Listas dinámicas ──────────────────────────────────────────────────────
  let departamentos = []
  let localidades   = []
  let loadingDepts  = false
  let loadingLocs   = false
  let errorDepts    = false
  let errorLocs     = false

  // ── Restricción de localidades ────────────────────────────────────────────
  let localidadesRestricc  = []
  let cargandoRestricc     = false
  let resolviendoUbicacion = false
  let formCargado          = false  // evita hasChanges prematuro

  $: restriccionActiva = $appConfig?.restriccionActiva && ($appConfig?.localidadesHabilitadas?.length > 0)

  // ── Nombre legible de la localidad actual (para sugerencias de alias) ─────
  $: nombreLocalidadActual = (() => {
    if (!localidadId) return ''
    if (restriccionActiva) return localidadesRestricc.find(l => l.id === localidadId)?.label || ''
    return localidades.find(l => l.id === localidadId)?.nombre || ''
  })()

  // ── Precargar perfil guardado ─────────────────────────────────────────────
  onMount(async () => {
    if (!$appConfig) await cargarConfig()

    if ($appConfig?.restriccionActiva && $appConfig?.localidadesHabilitadas?.length > 0) {
      cargandoRestricc = true
      const ids = $appConfig.localidadesHabilitadas
      const map = await resolverNombresLocalidad(ids).catch(() => new Map())
      localidadesRestricc = ids.map(id => ({
        id,
        label: map.get(`${id}__label`) || map.get(id) || id,
      }))
      cargandoRestricc = false
    }

    if ($userProfile) {
      alias          = $userProfile.alias  || ''
      barrio         = $userProfile.barrio || ''
      provinciaId    = $userProfile.provincia    || ''
      departamentoId = $userProfile.departamento || ''
      localidadId    = $userProfile.localidad    || ''
      if (provinciaId)    cargarDepartamentos(provinciaId,    false)
      if (departamentoId) cargarLocalidades(departamentoId, false)
    }
    formCargado = true
  })

  // ── Check de alias al abandonar el input ─────────────────────────────────
  async function onAliasBlur() {
    const limpio = alias?.trim() || ''

    aliasDisponible = null

    if (limpio.length < 2) return

    // Si no cambió respecto al perfil guardado, no consultar Firestore
    if (limpio === get(userProfile)?.alias?.trim()) {
      aliasDisponible = true
      return
    }

    verificandoAlias = true
    try {
      aliasDisponible = await verificarAliasDisponible(limpio, get(currentUser)?.uid)
    } catch {
      aliasDisponible = null
    } finally {
      verificandoAlias = false
    }
  }

  // ── Sugerencias cuando el alias está ocupado ──────────────────────────────
  $: sugerenciasAlias = aliasDisponible === false
    ? generarSugerencias(alias, nombreLocalidadActual)
    : []

  function generarSugerencias(base, localidad) {
    const b = (base || '').trim()
    if (!b) return []
    // Nombre corto de localidad: primer token antes de espacios o comas
    const locCorta = localidad
      ? localidad.split(/[\s,]/)[0]
      : ''
    const sugs = [
      `${b}_`,
      `${b}2`,
    ]
    if (locCorta) sugs.push(`${b}_${locCorta}`)
    return sugs
  }

  function usarSugerencia(sug) {
    alias = sug
    onAliasBlur()   // blur no dispara al hacer clic en un botón externo
  }

  // ── Cascading geográfico ──────────────────────────────────────────────────
  async function onProvinciaChange() {
    departamentoId = ''
    localidadId    = ''
    departamentos  = []
    localidades    = []
    if (provinciaId) await cargarDepartamentos(provinciaId, true)
  }

  async function onDepartamentoChange() {
    localidadId = ''
    localidades = []
    if (departamentoId) await cargarLocalidades(departamentoId, true)
  }

  async function cargarDepartamentos(provId, resetOnError = true) {
    loadingDepts = true
    errorDepts   = false
    try {
      departamentos = await getDepartamentos(provId)
    } catch {
      errorDepts = true
      if (resetOnError) departamentoId = ''
    } finally {
      loadingDepts = false
    }
  }

  async function cargarLocalidades(deptId, resetOnError = true) {
    loadingLocs = true
    errorLocs   = false
    try {
      localidades = await getLocalidades(deptId)
    } catch {
      errorLocs = true
      if (resetOnError) localidadId = ''
    } finally {
      loadingLocs = false
    }
  }

  // ── User data ─────────────────────────────────────────────────────────────
  $: user       = $currentUser
  $: fotoGoogle = user?.photoURL || cargarFotoCacheada() || ''
  $: nombre     = user?.displayName || ''

  $: if (nombre && !alias && !$userProfile) {
    alias = nombre.split(' ')[0]
  }

  // ── Validación ────────────────────────────────────────────────────────────
  function validate() {
    errors = {}

    if (!alias.trim() || alias.trim().length < 2)
      errors.alias = 'El alias debe tener al menos 2 caracteres.'

    if (aliasDisponible === false)
      errors.alias = 'Este alias ya está en uso. Elegí otro.'

    if (restriccionActiva) {
      if (!localidadId)
        errors.localidad = 'Seleccioná tu localidad.'
    } else {
      if (!provinciaId)
        errors.provincia = 'Seleccioná tu provincia.'
      if (!departamentoId)
        errors.departamento = 'Seleccioná tu departamento o partido.'
      if (!localidadId && localidades.length > 0)
        errors.localidad = 'Seleccioná tu localidad.'
    }
    return Object.keys(errors).length === 0
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  function hasChanges() {
    if (!formCargado || !$userProfile) return false
    return (
      alias          !== ($userProfile.alias          || '') ||
      provinciaId    !== ($userProfile.provincia       || '') ||
      departamentoId !== ($userProfile.departamento    || '') ||
      localidadId    !== ($userProfile.localidad       || '') ||
      barrio         !== ($userProfile.barrio          || '')
    )
  }

  async function handleSubmit() {
    if (!validate() || saving) return

    if ($userProfile && !hasChanges()) {
      currentPage.set('home')
      return
    }

    saving = true
    try {
      await saveUserProfile({
        alias,
        foto:        fotoCustom || fotoGoogle,
        provincia:   provinciaId,
        departamento: departamentoId,
        localidad:   localidadId,
        barrio,
      })
    } catch (e) {
      // El error de alias duplicado viene de la transacción en auth.js
      if (e.message?.includes('alias')) {
        errors.alias   = e.message
        aliasDisponible = false
      } else {
        errors.general = 'No se pudo guardar el perfil. Verificá tu conexión.'
      }
      saving = false
    }
  }

  async function handleSignOut() {
    await signOut()
  }

  // ── Helpers de nombre ─────────────────────────────────────────────────────
  function nombreLocalidad(id) {
    return localidades.find(l => l.id === id)?.nombre || ''
  }
  function nombreDepartamento(id) {
    return departamentos.find(d => d.id === id)?.nombre || ''
  }
  function nombreProvincia(id) {
    return provincias.find(p => p.id === id)?.nombre || ''
  }
</script>

<div class="app-shell perfil-shell">

  <!-- Header -->
  <header class="perfil-header">
    <div class="header-brand">
      <span class="brand-mini">Mejor Precio<span class="dot">.co</span></span>
    </div>
    <button class="btn-salir" on:click={handleSignOut} aria-label="Salir">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
        <polyline points="16 17 21 12 16 7"/>
        <line x1="21" y1="12" x2="9" y2="12"/>
      </svg>
      Salir
    </button>
  </header>

  <!-- Scroll area -->
  <div class="scroll-area">
    <div class="perfil-content fade-in">

      <!-- Hero del perfil -->
      <div class="perfil-hero">
        <div class="avatar-wrap">
          {#if fotoGoogle}
            <img src={fotoGoogle} alt="Foto de perfil" class="avatar avatar-lg" width="88" height="88" />
          {:else}
            <div class="avatar-placeholder">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
          {/if}
          <div class="avatar-badge">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </div>
        </div>
        <div class="hero-text">
          <h1>¡Hola{nombre ? ', ' + nombre.split(' ')[0] : ''}!</h1>
          <p>Completá tu perfil para empezar</p>
        </div>
      </div>

      <!-- Formulario -->
      <div class="card form-card">

        {#if errors.general}
          <div class="alert alert-error mb-16">{errors.general}</div>
        {/if}

        <!-- ── Alias ── -->
        <div class="form-group" class:has-error={errors.alias}>
          <label class="form-label" for="alias">Alias público</label>
          <div class="alias-input-wrap">
            <input
              id="alias"
              type="text"
              class="form-input"
              class:error={errors.alias}
              bind:value={alias}
              placeholder="Ej: JuanDelBarrio"
              maxlength="30"
              autocomplete="off"
              autocorrect="off"
              spellcheck="false"
              on:input={() => aliasDisponible = null}
              on:blur={onAliasBlur}
            />
            <!-- Indicador de disponibilidad -->
            {#if verificandoAlias}
              <span class="alias-status checking" title="Verificando…">⏳</span>
            {:else if aliasDisponible === true && alias.trim() !== ($userProfile?.alias || '')}
              <span class="alias-status ok" title="Alias disponible">✓</span>
            {:else if aliasDisponible === false}
              <span class="alias-status taken" title="Alias ocupado">✕</span>
            {/if}
          </div>

          <!-- Mensaje debajo del input -->
          {#if errors.alias}
            <span class="field-error">{errors.alias}</span>
          {:else if aliasDisponible === false}
            <span class="field-error">Este alias ya está en uso. Elegí otro.</span>
          {:else if aliasDisponible === true && alias.trim() !== ($userProfile?.alias || '')}
            <span class="alias-ok-msg">✓ Alias disponible</span>
          {:else}
            <span class="form-hint">Así te van a ver los demás usuarios.</span>
          {/if}

          <!-- Sugerencias cuando el alias está tomado -->
          {#if sugerenciasAlias.length > 0}
            <div class="alias-sugerencias">
              <span class="sug-label">Probá con:</span>
              {#each sugerenciasAlias as sug}
                <button
                  type="button"
                  class="sug-chip"
                  on:click={() => usarSugerencia(sug)}
                >
                  {sug}
                </button>
              {/each}
            </div>
          {/if}
        </div>

        <div class="divider"></div>

        <!-- Ubicación -->
        <div class="section-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          Tu ubicación
        </div>

        <!-- Argentina (fijo) -->
        <div class="form-group">
          <label class="form-label" for="campo-pais">País</label>
          <div class="input-fixed" id="campo-pais">
            <span class="flag">🇦🇷</span>
            Argentina
          </div>
        </div>

        {#if restriccionActiva}
          <!-- Modo restringido: selector simple de localidades habilitadas -->
          <div class="form-group restricc-aviso">
            <div class="restricc-banner">
              📍 La app está disponible en localidades seleccionadas durante esta etapa de evaluación.
            </div>
          </div>
          <div class="form-group" class:has-error={errors.localidad}>
            <label class="form-label" for="localidad-restricc">Localidad</label>
            {#if cargandoRestricc}
              <div class="form-select" style="color:var(--c-text-light)">Cargando localidades…</div>
            {:else}
              <select
                id="localidad-restricc"
                class="form-select"
                class:error={errors.localidad}
                bind:value={localidadId}
                on:change={async () => {
                  if (!localidadId) { provinciaId = ''; departamentoId = ''; return }
                  resolviendoUbicacion = true
                  try {
                    const url  = `https://apis.datos.gob.ar/georef/api/localidades?id=${localidadId}&campos=id,nombre,provincia,departamento&max=1`
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
                }}
              >
                <option value="">Seleccioná tu localidad…</option>
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
          <!-- Modo normal: selectores en cascada provincia → departamento → localidad -->
          <div class="form-group" class:has-error={errors.provincia}>
            <label class="form-label" for="provincia">Provincia</label>
            <select id="provincia" class="form-select" class:error={errors.provincia}
              bind:value={provinciaId} on:change={onProvinciaChange}>
              <option value="">Seleccioná tu provincia…</option>
              {#each provincias as prov}
                <option value={prov.id}>{prov.nombre}</option>
              {/each}
            </select>
            {#if errors.provincia}
              <span class="field-error">{errors.provincia}</span>
            {/if}
          </div>

          <!-- Departamento / Partido -->
          <div class="form-group" class:has-error={errors.departamento}>
            <label class="form-label" for="departamento">
              {provinciaId === '06' ? 'Partido' : 'Departamento / Partido'}
            </label>
            <select
              id="departamento"
              class="form-select"
              class:error={errors.departamento}
              bind:value={departamentoId}
              on:change={onDepartamentoChange}
              disabled={!provinciaId || loadingDepts}
            >
              <option value="">
                {#if !provinciaId}Primero elegí provincia
                {:else if loadingDepts}Cargando…
                {:else if errorDepts}Error al cargar — revisá conexión
                {:else}Seleccioná…{/if}
              </option>
              {#each departamentos as dept}
                <option value={dept.id}>{dept.nombre}</option>
              {/each}
            </select>
            {#if errors.departamento}
              <span class="field-error">{errors.departamento}</span>
            {/if}
          </div>

          <!-- Localidad -->
          <div class="form-group" class:has-error={errors.localidad}>
            <label class="form-label" for="localidad">Localidad / Ciudad</label>
            <select
              id="localidad"
              class="form-select"
              class:error={errors.localidad}
              bind:value={localidadId}
              disabled={!departamentoId || loadingLocs}
            >
              <option value="">
                {#if !departamentoId}Primero elegí departamento
                {:else if loadingLocs}Cargando…
                {:else if errorLocs}Error al cargar — revisá conexión
                {:else if localidades.length === 0}Sin localidades registradas
                {:else}Seleccioná tu localidad…{/if}
              </option>
              {#each localidades as loc}
                <option value={loc.id}>{loc.nombre}</option>
              {/each}
            </select>
            {#if errors.localidad && localidades.length > 0}
              <span class="field-error">{errors.localidad}</span>
            {/if}
          </div>
        {/if}

        <!-- Barrio -->
        <div class="form-group">
          <label class="form-label" for="barrio">Barrio <span class="optional">(opcional)</span></label>
          <input
            id="barrio"
            type="text"
            class="form-input"
            bind:value={barrio}
            placeholder="Ej: Balneario, Centro, Las Lilas…"
            maxlength="60"
          />
          <span class="form-hint">Te ayudará a encontrar comercios más cercanos a vos.</span>
        </div>

        <!-- Preview de localidad -->
        {#if localidadId}
          <div class="location-preview">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--c-primary)" stroke="none">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
            <span>
              {#if restriccionActiva}
                {nombreLocalidadActual}{provinciaId ? ', ' + getNombreProvincia(provinciaId) : ''}
              {:else}
                {nombreLocalidad(localidadId)},
                {nombreDepartamento(departamentoId)},
                {nombreProvincia(provinciaId)}
              {/if}
              {#if barrio} — {barrio}{/if}
            </span>
          </div>
        {/if}

      </div>

      <!-- Submit -->
      <button
        class="btn btn-primary btn-full submit-btn"
        on:click={handleSubmit}
        disabled={saving || aliasDisponible === false}
      >
        {#if saving}
          <div class="btn-spinner-w"></div>
          Guardando…
        {:else if $userProfile && !hasChanges()}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Volver al inicio
        {:else}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          {$userProfile ? 'Guardar cambios' : 'Listo, empezar'}
        {/if}
      </button>

    </div>
  </div>

  <BottomNav active="perfil" />
</div>

<style>
  .perfil-shell {
    padding-bottom: var(--nav-h);
    background: var(--c-bg);
  }

  /* ── Header ── */
  .perfil-header {
    position: sticky; top: 0; z-index: 10;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    background: rgba(244,247,241,0.9);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--c-border);
  }

  .brand-mini {
    font-family: var(--f-brand);
    font-size: 20px;
    font-weight: 700;
    color: var(--c-primary-dim);
  }
  .dot { color: var(--c-accent); }

  .btn-salir {
    display: flex; align-items: center; gap: 6px;
    background: none; border: none;
    font-family: var(--f-ui); font-size: 13px; font-weight: 600;
    color: var(--c-text-mid); cursor: pointer;
    padding: 6px 10px; border-radius: 8px;
    transition: background 0.15s;
  }
  .btn-salir:hover { background: var(--c-surface-2); }

  /* ── Content ── */
  .perfil-content {
    padding: 0 16px 32px;
    max-width: 440px;
    margin: 0 auto;
    width: 100%;
  }

  /* ── Hero ── */
  .perfil-hero {
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 24px 6px 20px;
  }

  .avatar-wrap { position: relative; flex-shrink: 0; }
  .avatar-lg { width: 88px; height: 88px; box-shadow: var(--s-md); }

  .avatar-placeholder {
    width: 88px; height: 88px;
    border-radius: 50%;
    background: var(--c-primary);
    display: flex; align-items: center; justify-content: center;
  }

  .avatar-badge {
    position: absolute; bottom: 2px; right: 2px;
    width: 24px; height: 24px;
    background: var(--c-accent);
    border-radius: 50%;
    border: 2px solid var(--c-bg);
    display: flex; align-items: center; justify-content: center;
  }

  .hero-text h1 {
    font-family: var(--f-brand);
    font-size: 26px; font-weight: 700;
    color: var(--c-text); line-height: 1.1;
  }
  .hero-text p { font-size: 14px; color: var(--c-text-mid); margin-top: 4px; }

  /* ── Form card ── */
  .form-card { margin-bottom: 20px; }

  .section-label {
    display: flex; align-items: center; gap: 7px;
    font-size: 13px; font-weight: 700;
    color: var(--c-primary);
    text-transform: uppercase; letter-spacing: 0.06em;
    margin-bottom: 16px;
  }

  .input-fixed {
    display: flex; align-items: center; gap: 10px;
    padding: 13px 15px;
    background: var(--c-surface-2);
    border: 1.5px solid var(--c-border);
    border-radius: var(--r-md);
    font-size: 15px; color: var(--c-text-mid);
    font-family: var(--f-ui);
  }
  .flag { font-size: 20px; }

  .optional {
    font-weight: 400; color: var(--c-text-light);
    text-transform: lowercase; letter-spacing: 0;
  }

  .form-input.error, .form-select.error {
    border-color: var(--c-error);
    box-shadow: 0 0 0 3px rgba(198,40,40,0.08);
  }

  .field-error {
    font-size: 12px; color: var(--c-error); font-weight: 500;
  }

  .location-preview {
    display: flex; align-items: flex-start; gap: 8px;
    padding: 12px 14px;
    background: rgba(27,107,58,0.07);
    border-radius: 10px;
    font-size: 13px; color: var(--c-primary-dim);
    line-height: 1.5;
    margin-top: 4px;
  }
  .location-preview svg { margin-top: 1px; flex-shrink: 0; }

  /* ── Submit ── */
  .submit-btn {
    padding: 17px 24px;
    font-size: 16px;
    box-shadow: 0 6px 20px rgba(27,107,58,0.35);
  }

  .btn-spinner-w {
    width: 18px; height: 18px;
    border: 2px solid rgba(255,255,255,0.35);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  /* ── Alias — unicidad ── */
  .alias-input-wrap {
    position: relative;
  }

  .alias-status {
    position: absolute;
    right: 14px; top: 50%;
    transform: translateY(-50%);
    font-size: 14px; font-weight: 700;
    pointer-events: none;
  }
  .alias-status.ok      { color: #059669; }
  .alias-status.taken   { color: var(--c-error); }
  .alias-status.checking { color: var(--c-text-light); font-size: 12px; }

  .alias-ok-msg {
    font-size: 12px; color: #059669; font-weight: 600;
  }

  .alias-sugerencias {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 7px;
    margin-top: 8px;
  }

  .sug-label {
    font-size: 11px;
    font-weight: 700;
    color: var(--c-text-light);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }

  .sug-chip {
    padding: 5px 12px;
    border: 1.5px solid var(--c-primary);
    border-radius: var(--r-full);
    background: transparent;
    color: var(--c-primary);
    font-family: var(--f-ui);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    -webkit-tap-highlight-color: transparent;
  }
  .sug-chip:hover, .sug-chip:active {
    background: var(--c-primary);
    color: white;
  }

  /* ── Restricción de localidades ── */
  .restricc-banner {
    background: rgba(27,107,58,0.08); border: 1px solid rgba(27,107,58,0.25);
    border-radius: var(--r-lg); padding: 12px 14px;
    font-size: 13px; color: var(--c-primary); line-height: 1.5;
  }

  .resolviendo-msg { font-size: 12px; color: var(--c-text-light); margin-top: 4px; display: block; }
  .resolviendo-ok  { font-size: 12px; color: #059669; font-weight: 600; margin-top: 4px; display: block; }

  @keyframes spin { to { transform: rotate(360deg); } }
</style>
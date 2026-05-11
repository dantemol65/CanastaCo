# 🧺 Canasta.co — Módulo 1

PWA para comparar precios de la canasta familiar. Red social de precios construida por y para la comunidad.

## Stack técnico

| Capa | Tecnología |
|------|-----------|
| Frontend | Svelte 4 + Vite 5 |
| Auth | Firebase Authentication (Google) |
| Base de datos | Firestore (con persistencia offline) |
| PWA / SW | vite-plugin-pwa + Workbox |
| Hosting | Netlify |

---

## Setup inicial

### 1. Clonar e instalar dependencias

```bash
git clone https://github.com/TU_USUARIO/canastaco.git
cd canastaco
npm install
```

### 2. Configurar Firebase

1. Ir a [Firebase Console](https://console.firebase.google.com/) → crear proyecto (o usar uno existente)
2. Habilitar **Authentication → Google Sign-In**
3. Crear base de datos **Firestore** en modo producción
4. Agregar una app web → copiar las credenciales

### 3. Variables de entorno

```bash
cp .env.example .env
# Editá .env con tus credenciales de Firebase
```

### 4. Reglas de seguridad Firestore

En Firebase Console → Firestore → Reglas, pegá:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /usuarios/{uid} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

### 5. Correr en desarrollo

```bash
npm run dev
# Abre http://localhost:5173
```

### 6. Build para producción

```bash
npm run build
# Genera la carpeta dist/
```

---

## Deploy en Netlify

1. Conectar el repo de GitHub en Netlify
2. Build command: `npm run build`
3. Publish directory: `dist`
4. Agregar las variables de entorno de Firebase en Netlify → Site Settings → Environment Variables

---

## Estructura del proyecto

```
canastaco/
├── public/
│   ├── favicon.svg
│   └── icons/
│       ├── icon-192.png
│       └── icon-512.png
└── src/
    ├── main.js              ← Entry point
    ├── App.svelte           ← Router principal
    ├── app.css              ← Design system (CSS vars, componentes)
    ├── lib/
    │   └── firebase.js      ← Inicialización Firebase + Firestore offline
    ├── stores/
    │   └── auth.js          ← Estado global: auth, perfil, navegación
    ├── data/
    │   └── argentina.js     ← Provincias, departamentos y localidades
    ├── pages/
    │   ├── Login.svelte     ← Pantalla de login con Google
    │   ├── Perfil.svelte    ← Registro y edición de perfil
    │   └── Home.svelte      ← Shell principal de la app
    └── components/
        └── BottomNav.svelte ← Navegación inferior
```

---

## Schema Firestore — colección `usuarios`

```json
{
  "uid":          "string — ID de Firebase Auth",
  "email":        "string",
  "alias":        "string — nombre público en la app",
  "foto":         "string — URL (Google por defecto)",
  "provincia":    "string — código ISO (ej: AR-A)",
  "departamento": "string — código interno (ej: AR-A-22)",
  "localidad":    "string — código interno (ej: AR-A-22-01)",
  "barrio":       "string — texto libre",
  "creado":       "timestamp",
  "ultimoAcceso": "timestamp"
}
```

---

## Funcionamiento offline

- **Firebase Auth** mantiene la sesión en localStorage/IndexedDB automáticamente
- **Firestore** con `persistentLocalCache()` cachea datos en IndexedDB
- **Workbox** (vía vite-plugin-pwa) cachea: shell JS/CSS/HTML + fonts de Google
- Si el usuario ya inició sesión: puede abrir la app sin conexión y ver perfil y home
- Si no inició sesión nunca: verá pantalla de login con mensaje "Sin conexión"

---

## Módulos planificados

| # | Módulo | Estado |
|---|--------|--------|
| 1 | Login + Perfil + Home shell | ✅ Completo |
| 2 | Búsqueda de productos por localidad | 🔒 Próximamente |
| 3 | Carga de precios (foto, voz → IA) | 🔒 Próximamente |
| 4 | Registro de comercios y listas | 🔒 Próximamente |
| 5 | Estadísticas y evolución de precios | 🔒 Próximamente |

---

## Licencia

Proyecto con fin social — todos los derechos reservados © 2025 Canasta.co

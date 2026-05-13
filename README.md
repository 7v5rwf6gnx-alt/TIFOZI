# Tifozi

App de quiniela para el Mundial 2026 (USA · Canada · Mexico).

**Stack:** React + Tailwind / Node.js + Express / Supabase

---

## Requisitos

- Node.js 20+
- Una cuenta en [Supabase](https://supabase.com) con un proyecto creado

---

## Configuración inicial

### 1. Clonar y entrar al proyecto

```bash
git clone <repo-url>
cd quiniela-mundial-2026
```

### 2. Configurar variables de entorno

**Backend:**
```bash
cp backend/.env.example backend/.env
```
Edita `backend/.env` con tus credenciales de Supabase:
- `SUPABASE_URL` → Settings → API → Project URL
- `SUPABASE_SERVICE_ROLE_KEY` → Settings → API → service_role key (secret)

**Frontend:**
```bash
cp frontend/.env.example frontend/.env
```
Edita `frontend/.env`:
- `VITE_SUPABASE_URL` → mismo Project URL
- `VITE_SUPABASE_ANON_KEY` → Settings → API → anon / public key

### 3. Instalar dependencias

```bash
# Backend
cd backend && npm install

# Frontend
cd ../frontend && npm install
```

---

## Correr el proyecto localmente

Abre **dos terminales**:

**Terminal 1 — Backend:**
```bash
cd backend
npm run dev
# Servidor en http://localhost:3000
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
# App en http://localhost:5173
```

---

## Estructura del proyecto

```
quiniela-mundial-2026/
├── frontend/
│   ├── src/
│   │   ├── lib/supabase.js
│   │   ├── pages/
│   │   ├── components/
│   │   ├── context/
│   │   ├── App.jsx
│   │   └── index.css
│   ├── index.html
│   ├── tailwind.config.js
│   └── .env.example
├── backend/
│   ├── src/
│   └── .env.example
├── .gitignore
└── README.md
```

---

## Scripts disponibles

| Directorio | Comando | Descripción |
|---|---|---|
| `backend` | `npm run dev` | Servidor con hot-reload |
| `backend` | `npm start` | Servidor en producción |
| `frontend` | `npm run dev` | Dev server con HMR |
| `frontend` | `npm run build` | Build de producción |
| `frontend` | `npm run preview` | Preview del build |

---

## Deploy a producción

### Frontend → Vercel

1. Subí el repo a GitHub.
2. En [vercel.com](https://vercel.com), creá un proyecto nuevo y conectalo al repo.
3. Configurá el **Root Directory** a `frontend`.
4. En **Environment Variables** agregá:
   - `VITE_SUPABASE_URL` → tu Project URL
   - `VITE_SUPABASE_ANON_KEY` → tu anon key
5. Deploy. El `vercel.json` ya tiene la regla de rewrite para SPA (todas las rutas → `index.html`).

### Backend → Railway

1. En [railway.app](https://railway.app), creá un nuevo servicio desde GitHub.
2. Apuntalo a la carpeta `backend` (o usá un repo separado solo del backend).
3. Railway detecta el `Dockerfile` automáticamente.
4. En **Variables** agregá:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `FRONTEND_URL` → la URL de tu app en Vercel (ej: `https://quiniela.vercel.app`)
   - `PORT` → `3000` (Railway lo asigna automáticamente, pero se puede declarar)
5. Deploy. Railway buildea la imagen Docker y la corre.

> **Tip:** Si no necesitás validación server-side extra, el backend es opcional — todo el guardado de pronósticos puede ir directo a Supabase desde el frontend.

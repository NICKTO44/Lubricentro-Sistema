# 📦 Instalación del Backend - Sistema de Tienda

## ✅ Checklist antes de empezar

Verifica que tienes:
- ✅ Proyecto Tauri creado en `~/Documents/SistemaEscritorio/backend/sistema-tienda`
- ✅ Carpetas creadas: `database/`, `models/`, `commands/` dentro de `src-tauri/src/`
- ✅ MySQL instalado y corriendo
- ✅ Base de datos `tienda_db` creada

---

## 📁 Estructura de archivos a crear

```
src-tauri/src/
├── main.rs                    ← Actualizar
├── database/
│   ├── mod.rs                 ← Crear
│   └── connection.rs          ← Crear
├── models/
│   ├── mod.rs                 ← Crear
│   ├── usuario.rs             ← Crear
│   ├── producto.rs            ← Crear
│   └── venta.rs               ← Crear
└── commands/
    ├── mod.rs                 ← Crear
    ├── auth.rs                ← Crear
    └── productos.rs           ← Crear
```

---

## 🚀 Opción 1: Instalación Manual (Paso a Paso)

### 1. Copiar archivos de database

```bash
# Estando en ~/Documents/SistemaEscritorio/backend/sistema-tienda/src-tauri/src

# Crear connection.rs
nano database/connection.rs
# Pegar contenido del archivo database_connection.rs

# Crear mod.rs
nano database/mod.rs
# Pegar contenido del archivo database_mod.rs
```

### 2. Copiar archivos de models

```bash
# Crear usuario.rs
nano models/usuario.rs
# Pegar contenido del archivo models_usuario.rs

# Crear producto.rs
nano models/producto.rs
# Pegar contenido del archivo models_producto.rs

# Crear venta.rs
nano models/venta.rs
# Pegar contenido del archivo models_venta.rs

# Crear mod.rs
nano models/mod.rs
# Pegar contenido del archivo models_mod.rs
```

### 3. Copiar archivos de commands

```bash
# Crear auth.rs
nano commands/auth.rs
# Pegar contenido del archivo commands_auth.rs

# Crear productos.rs
nano commands/productos.rs
# Pegar contenido del archivo commands_productos.rs

# Crear mod.rs
nano commands/mod.rs
# Pegar contenido del archivo commands_mod.rs
```

### 4. Actualizar main.rs

```bash
# Reemplazar main.rs
nano main.rs
# Borrar todo y pegar contenido del archivo main_rs.rs
```

---

## 🚀 Opción 2: Instalación con Script (Más Rápido)

### Paso 1: Descargar los archivos

Descarga todos los archivos que te proporcioné y colócalos en:
```
~/Documents/SistemaEscritorio/backend/sistema-tienda/
```

### Paso 2: Dar permisos al script

```bash
cd ~/Documents/SistemaEscritorio/backend/sistema-tienda
chmod +x instalar_backend.sh
```

### Paso 3: Ejecutar el script

```bash
./instalar_backend.sh
```

---

## ⚙️ Configuración de la Base de Datos

### ⚠️ IMPORTANTE: Actualizar contraseña de MySQL

Abre el archivo:
```bash
nano src-tauri/src/database/connection.rs
```

Busca esta línea (aprox. línea 40):
```rust
"tu_password_aqui", // ⚠️ CAMBIAR ESTO
```

Cámbiala por tu contraseña real de MySQL:
```rust
"TuPasswordReal123", // Tu contraseña de MySQL
```

Guarda el archivo (Ctrl+O, Enter, Ctrl+X en nano).

---

## 🧪 Probar la Instalación

### 1. Compilar el proyecto

```bash
cd ~/Documents/SistemaEscritorio/backend/sistema-tienda
npm run tauri dev
```

Si todo está bien, deberías ver:
```
✅ Conexión a base de datos establecida
   Compiling sistema-tienda v0.1.0
```

### 2. Probar la conexión a la BD desde la app

Cuando se abra la ventana de la aplicación, abre la consola de desarrollador (Cmd+Option+I) y ejecuta en la consola:

```javascript
window.__TAURI__.invoke('test_database_connection')
  .then(result => console.log(result))
  .catch(error => console.error(error));
```

Deberías ver: `"Conexión exitosa a la base de datos"`

---

## 📋 Comandos Disponibles

Una vez instalado, estos comandos estarán disponibles para el frontend:

### Autenticación
```javascript
// Login
await invoke('login', { 
  credenciales: { username: 'admin', password: 'tu_contraseña' } 
});

// Test conexión
await invoke('test_database_connection');
```

### Productos
```javascript
// Obtener todos los productos
await invoke('obtener_productos');

// Buscar por código
await invoke('buscar_producto_por_codigo', { codigo: '7501234567890' });

// Agregar producto
await invoke('agregar_producto', { 
  producto: {
    codigo: '123',
    nombre: 'Producto Nuevo',
    precio: 10.00,
    stock: 100,
    stock_minimo: 10,
    categoria_id: 1
  }
});

// Productos con stock bajo
await invoke('obtener_productos_stock_bajo');
```

---

## ❌ Solución de Problemas

### Error: "error: cannot find macro `tauri` in this scope"

Verifica que en `Cargo.toml` esté:
```toml
[dependencies]
tauri = { version = "2.x.x", features = ["..."] }
```

### Error: "could not connect to server"

1. Verifica que MySQL esté corriendo:
   ```bash
   mysql.server status
   # o
   brew services list | grep mysql
   ```

2. Verifica que la contraseña sea correcta en `connection.rs`

3. Prueba la conexión manualmente:
   ```bash
   mysql -u root -p tienda_db
   ```

### Error de compilación en Rust

Limpia y recompila:
```bash
cd src-tauri
cargo clean
cd ..
npm run tauri dev
```

---

## 📚 Estructura Completa Creada

```
sistema-tienda/
├── src/                          ← Frontend (React)
│   ├── App.jsx
│   └── main.jsx
│
├── src-tauri/                    ← Backend (Rust)
│   ├── src/
│   │   ├── main.rs              ✅ Actualizado
│   │   ├── lib.rs
│   │   ├── database/            ✅ Nuevo
│   │   │   ├── mod.rs
│   │   │   └── connection.rs
│   │   ├── models/              ✅ Nuevo
│   │   │   ├── mod.rs
│   │   │   ├── usuario.rs
│   │   │   ├── producto.rs
│   │   │   └── venta.rs
│   │   └── commands/            ✅ Nuevo
│   │       ├── mod.rs
│   │       ├── auth.rs
│   │       └── productos.rs
│   └── Cargo.toml
│
└── package.json
```

---

## ✅ Checklist Final

- [ ] Todos los archivos copiados
- [ ] Contraseña de MySQL actualizada en `connection.rs`
- [ ] Proyecto compila sin errores
- [ ] Test de conexión funciona
- [ ] Puedes obtener productos desde la consola

**Cuando todo esté ✅, estarás listo para desarrollar el frontend.** 🎉

---

## 🎯 Próximos Pasos

1. ✅ Backend instalado
2. ⏭️ Crear interfaz de Login (React)
3. ⏭️ Crear interfaz de POS (Punto de Venta)
4. ⏭️ Crear gestión de inventario
5. ⏭️ Crear reportes

¡Avísame cuando tengas todo funcionando para continuar con el frontend! 🚀
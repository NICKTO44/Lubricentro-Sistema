#!/bin/bash
# Script para instalar archivos del backend

echo "🚀 Instalando archivos del backend..."

# Verificar que estamos en la carpeta correcta
if [ ! -d "src-tauri/src" ]; then
    echo "❌ Error: Debes ejecutar este script desde la carpeta 'sistema-tienda'"
    echo "💡 cd ~/Documents/SistemaEscritorio/backend/sistema-tienda"
    exit 1
fi

# Copiar archivos de database
echo "📁 Copiando archivos de database..."
cp database_connection.rs src-tauri/src/database/connection.rs
cp database_mod.rs src-tauri/src/database/mod.rs

# Copiar archivos de models
echo "📁 Copiando archivos de models..."
cp models_usuario.rs src-tauri/src/models/usuario.rs
cp models_producto.rs src-tauri/src/models/producto.rs
cp models_venta.rs src-tauri/src/models/venta.rs
cp models_mod.rs src-tauri/src/models/mod.rs

# Copiar archivos de commands
echo "📁 Copiando archivos de commands..."
cp commands_auth.rs src-tauri/src/commands/auth.rs
cp commands_productos.rs src-tauri/src/commands/productos.rs
cp commands_mod.rs src-tauri/src/commands/mod.rs

# Copiar main.rs
echo "📁 Actualizando main.rs..."
cp main_rs.rs src-tauri/src/main.rs

echo "✅ ¡Archivos instalados correctamente!"
echo ""
echo "⚠️  IMPORTANTE: Debes actualizar la contraseña de MySQL en:"
echo "   src-tauri/src/database/connection.rs"
echo "   Busca 'tu_password_aqui' y cámbialo por tu contraseña real"
echo ""
echo "🔄 Ahora puedes ejecutar: npm run tauri dev"

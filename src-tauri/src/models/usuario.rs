// models/usuario.rs
// Modelo de Usuario

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Usuario {
    pub id: i32,
    pub username: String,
    pub nombre_completo: String,
    pub email: Option<String>,
    pub rol_id: i32,
    pub activo: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UsuarioLogin {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct UsuarioResponse {
    pub success: bool,
    pub message: String,
    pub usuario: Option<Usuario>,
}

impl Usuario {
    pub fn new(
        id: i32,
        username: String,
        nombre_completo: String,
        email: Option<String>,
        rol_id: i32,
        activo: bool,
    ) -> Self {
        Usuario {
            id,
            username,
            nombre_completo,
            email,
            rol_id,
            activo,
        }
    }
}

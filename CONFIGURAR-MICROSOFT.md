# Configurar el inicio de sesión con Microsoft

XTL Client usa el flujo **oficial** de Microsoft para Minecraft (OAuth 2.0 *device code* → Xbox Live → XSTS → servicios de Minecraft).
Nunca ve ni guarda tu contraseña. Solo guarda un *refresh token*, **cifrado** con el almacén seguro del sistema (DPAPI en Windows, Keychain en macOS, libsecret/kwallet en Linux). Si el sistema no ofrece almacén seguro, la sesión se mantiene solo en memoria.

## Lo que falta para que el login funcione (no se puede hacer por ti)
Necesitas **tu propia aplicación de Azure** y que **Mojang la apruebe**. No se usa el identificador del launcher oficial de Mojang: hacerlo sería suplantarlo.

1. Entra en <https://entra.microsoft.com> → *Identidad → Aplicaciones → Registros de aplicaciones → Nuevo registro*.
2. Nombre: `XTL Client`. Tipos de cuenta: **«Cuentas personales de Microsoft únicamente»**.
3. En *Autenticación* activa **«Permitir flujos de cliente público»** = **Sí**. No hace falta URI de redirección ni secreto.
4. Copia el **Id. de aplicación (cliente)** (un UUID).
5. Solicita a Mojang que apruebe la aplicación para los servicios de Minecraft: <https://aka.ms/AppRegInfo>. Hasta que la aprueben, el último paso del login responde *«Invalid app registration»* y XTL Client te lo explicará con ese mensaje.
6. Pega el Client ID en **Cuentas → Configuración de Microsoft** (o ponlo en `assets/config.json` → `msClientId`, o en la variable de entorno `XTL_CLIENT_ID`).

## Qué comprueba XTL Client antes de jugar
- Sesión válida (la renueva sola con el refresh token).
- Que la cuenta tiene **Minecraft: Java Edition** (perfil de Minecraft existente; si no existe: *«Esta cuenta no tiene Minecraft»*).
- Errores de Xbox conocidos: sin perfil Xbox, región no disponible, verificación de adulto y cuentas de menores (necesitan grupo familiar).

## Skins
Salen del perfil oficial (`api.minecraftservices.com/minecraft/profile`) y se descargan **solo** de `textures.minecraft.net`. Se actualizan al abrir *Cuentas*, con *Actualizar perfil* y antes de cada partida. Modrinth **no** tiene API de skins: no se usa para eso.

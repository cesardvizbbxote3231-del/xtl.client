# Pruebas

`npm test` → 25 pruebas del proceso principal (cuentas, perfiles, Java, versiones, Modrinth, módulos, modpacks, JUGAR, IPC, instalador) contra un mundo **simulado** (sin red).
`npm run test:ui` → 19 pruebas de la interfaz en Chromium real (Playwright), conectadas a los mismos manejadores del backend. Comprueban además que ningún botón queda sin acción conectada y que no hay errores de consola.

## Lo que NO se puede probar sin tu máquina (lista de comprobación manual)
1. **Login real**: necesita tu Client ID de Azure aprobado por Mojang (docs/CONFIGURAR-MICROSOFT.md).
2. **Descargas reales** de Mojang, Adoptium, Modrinth, Forge y NeoForge.
3. **Iniciar Minecraft** de verdad (vanilla, Fabric, Quilt, Forge, NeoForge) con Java real.
4. **Instalador**: `npm run dist` en Windows y probar instalar/desinstalar. La firma requiere el certificado.
5. Ventanas de Electron (cierre en modo ligero, actualizaciones automáticas).
Si algo falla, abre *Ajustes → Registros*: allí está el motivo exacto.

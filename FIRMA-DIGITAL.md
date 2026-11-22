# Firma digital del instalador (Authenticode) y SmartScreen

**Estado actual: el instalador NO está firmado.** No hay certificado real todavía y no se simula ninguno. Todo está preparado para firmar en cuanto lo tengas.

## 1. Qué certificado comprar
| Opción | Para qué | Notas |
|---|---|---|
| **EV Code Signing** (DigiCert, Sectigo, SSL.com, GlobalSign…) | Reputación inmediata en SmartScreen | Requiere empresa verificada. Clave en token/HSM o servicio en la nube. |
| **OV Code Signing** | Muestra tu nombre como editor verificado | SmartScreen puede avisar hasta acumular reputación con descargas. |
| **Azure Artifact (Trusted) Signing** | Firma desde la nube, barata, ideal para CI | Disponible solo para ciertos países/tipos de organización; consulta requisitos vigentes. |

Desde 2023 las CA exigen que la clave privada viva en hardware (token USB/HSM) o en un servicio en la nube. Por eso un `.pfx` descargable ya no se vende para certificados nuevos: para CI usa firma en la nube (SSL.com eSigner, DigiCert KeyLocker, Azure Artifact Signing) o un runner propio con el token.

## 2. Configuración con un .pfx (si tu proveedor aún lo entrega)
1. Convierte el .pfx a Base64: `certutil -encode cert.pfx cert.b64` (o `base64 cert.pfx`).
2. En GitHub → *Settings → Secrets → Actions* crea `WIN_CSC_LINK` (el Base64) y `WIN_CSC_KEY_PASSWORD`.
3. El workflow `.github/workflows/build.yml` ya pasa esas variables a electron-builder, que firma el `.exe` con SHA-256 y marca de tiempo. Sin secretos, compila sin firmar.
4. Cuando el instalador esté firmado, añade en `package.json` → `build.win.publisherName` el **nombre exacto** del certificado: así las actualizaciones automáticas verifican al editor.

Con firma en la nube, sigue la guía del proveedor (electron-builder admite herramientas de firma personalizadas con `win.sign`).

## 3. Comprobar la firma
`Get-AuthenticodeSignature .\XTL-Client-Setup-1.0.0.exe` (debe decir *Valid*) o clic derecho → Propiedades → *Firmas digitales*.

## 4. SmartScreen y antivirus (sin tocar Defender)
- Firma + marca de tiempo; el EV da reputación inmediata, el OV la gana con las descargas.
- Publica siempre las sumas **SHA-256** (el workflow genera `SHA256SUMS.txt`) y el código fuente.
- Descarga solo desde una URL fija (GitHub Releases).
- Si un antivirus da un falso positivo, envía el archivo en el portal de falsos positivos del proveedor y en <https://www.microsoft.com/wdsi/filesubmission>.
- No uses empaquetadores/ofuscadores: aumentan los falsos positivos.

No hay forma legítima de «saltarse» SmartScreen: solo firma y reputación.

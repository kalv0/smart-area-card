# AGENTS.md

Guia para agentes que trabajen en `smart-area-card`.

## Objetivo del Proyecto

`smart-area-card` es una custom card de Home Assistant/Lovelace escrita en TypeScript + Lit.
Su foco es mostrar una vista compacta de un area: imagen de fondo, header con sensores/badges, alertas, automatizaciones y grid de dispositivos.

Prioridad al hacer cambios:
1. Mantener compatibilidad con configuraciones existentes.
2. No romper el editor visual.
3. No introducir regresiones en la card final.
4. Validar siempre con typecheck, build y tests cuando el cambio toque codigo.

## Flujo Git Obligatorio

Despues de cualquier modificacion de archivos:

1. Comprobar si hay cambios:

```powershell
git diff --quiet
```

2. Si hay cambios, anadir todo:

```powershell
git add -A
```

3. Crear commit:

```powershell
git commit -m "Codex: $BreveDescripcion"
```

4. Subir:

```powershell
git push origin HEAD
```

Reglas:
- No hacer push si no hay cambios.
- No pedir confirmacion para commit/push.
- No usar `git reset --hard` ni revertir cambios ajenos salvo peticion explicita del usuario.
- Si `AGENTS.md` aparece modificado antes de empezar, tratarlo como cambio existente del usuario y no revertirlo.

## Comandos de Validacion

Para cambios de codigo:

```powershell
npm run check
npm run build
npm run test:run
```

Para cambios solo de documentacion:
- No es obligatorio ejecutar tests/build.
- Aun asi, revisar `git diff --stat` y el diff final antes de commitear.

Notas:
- `npm run check` ejecuta `tsc --noEmit`.
- `npm run build` genera `dist/smart-area-card.js`.
- `npm run test:run` ejecuta Vitest una vez.

## Mapa Rapido de Archivos

- `src/smart-area-card.ts`: componente de la card final. Render principal, header, alertas, automations, popup de sensores, grid de dispositivos y acciones.
- `src/smart-area-card-editor.ts`: editor visual de la card. Gestiona secciones de Card setup, Header, Sensors, Devices, previews y actualizacion de config.
- `src/styles.ts`: estilos de la card final.
- `src/editor/editor-styles.ts`: estilos del editor visual y previews.
- `src/helpers/types.ts`: tipos principales de configuracion.
- `src/helpers/compute-render-model.ts`: transforma config + estado de Home Assistant en modelo renderizable.
- `src/helpers/room-model.ts`: sensores del header, alertas de sensores, badges y helpers de area.
- `src/helpers/device-model.ts`: estado calculado de dispositivos, badges, alertas, imagenes y acciones.
- `src/helpers/config-helpers.ts`: imagenes, storage keys y helpers de config.
- `src/helpers/validate-config.ts`: warnings de config en runtime.
- `src/editor/*`: helpers especificos del editor visual.
- `src/**/__tests__/*`: tests unitarios.
- `dist/`: salida generada por build.

## Arquitectura Mental

Flujo de la card final:

1. `setConfig()` normaliza defaults y restaura estado persistido.
2. Cuando cambia `hass`, se calcula un `RenderModel`.
3. `computeRenderModel()` resuelve dispositivos, sensores, alertas, automatizaciones e imagen de fondo.
4. `render()` pinta `ha-card`.
5. `_renderHeader()` muestra nombre opcional, icono opcional, badges y sensores.
6. `_renderAlertPanels()`, `_renderAutomationPanel()` y `_renderExpander()` completan el contenido.

Flujo del editor visual:

1. `setConfig()` clona la config y aplica fallback.
2. Las secciones del editor escriben cambios con `_patch()`, `_setRoot()`, `_setUi()`, `_setSensor()`, `_setDevice()`, etc.
3. Cada cambio dispara `config-changed`.
4. Los previews deben reflejar la card final lo maximo posible, pero sin depender de fondos reales cuando se haya decidido usar previews neutros.

## Reglas de Edicion

- Usar `apply_patch` para editar archivos manualmente.
- No reordenar grandes bloques si el cambio pedido es pequeno.
- Mantener cambios acotados al comportamiento solicitado.
- Preferir helpers existentes a nuevos patrones.
- No introducir dependencias nuevas salvo necesidad clara.
- Evitar cambios cosmeticos no solicitados.
- Si se modifica una estructura de config, actualizar tambien:
  - `SmartRoomCardConfig` en `src/helpers/types.ts`
  - defaults en card/editor si aplica
  - render final
  - editor visual
  - tests cuando haya logica observable

## Puntos Delicados

- Header:
  - `room`/Area name es opcional. Si esta vacio, no debe mostrarse texto de nombre en el header.
  - Los badges deben seguir mostrandose aunque no haya nombre.
  - Sensores del header dependen de `ui.header_sensors_enabled`.
  - Click de sensores depende de `ui.header_climate_more_info`.

- Imagen de fondo:
  - La imagen de fondo se renderiza por CSS mediante `buildRoomBackgroundImage()`.
  - El shadow superior negro debe proteger la lectura del header sin oscurecer paneles inferiores.
  - Dark mode no debe cambiar de `<img>` a CSS: mantener una ruta unificada CSS.

- Editor visual:
  - Header preview y devices preview usan fondo neutro/degradado, no la imagen real de background.
  - Card setup mantiene su preview de background bajo el selector de area.
  - Si se cambia una opcion visible en la card final, revisar si el preview debe imitarla.

- Sensors:
  - `Show sensors` controla si aparece la tira de sensores y su configuracion debajo.
  - `Click despliega detalles` solo aparece si `Show sensors` esta activo.
  - Sensores con alerta activa deben aparecer en rojo en el header.
  - Mensajes de alarma de sensores usan formato `Sensorname: Sensorvalue`.

- Automations:
  - `automation_badge_enabled` controla visibilidad del badge.
  - `automation_badge_click_details` controla click/CTA/panel.
  - La animacion CTA del badge y la de sensores en preview deben permanecer coordinadas.

- Devices:
  - El slider de tamano del grid debe estar encima del preview del grid en el editor.
  - Cambios de tipo/preset pueden afectar defaults, estados, alertas e imagenes.

## Criterios de Finalizacion

Antes de responder:

1. Revisar `git diff --stat`.
2. Ejecutar validacion adecuada.
3. Confirmar si tests/build/check pasaron o explicar cualquier fallo.
4. Hacer commit y push si hubo cambios.
5. Responder breve, en espanol, indicando:
   - Que se cambio.
   - Que comandos se ejecutaron.
   - Commit subido.
   - Que archivos de `dist/` debe copiar el usuario a `/config/www/area-card/` para probar el commit en Home Assistant.
   - Como refrescar la prueba en Home Assistant: recargar recurso/dashboard o limpiar cache fuerte del navegador si sigue apareciendo codigo viejo.

## Si Algo Falla

- Si falla `npm run check`, arreglar tipos antes de commitear.
- Si falla `npm run build`, no entregar como terminado.
- Si falla `npm run test:run`, distinguir entre fallo nuevo y fallo preexistente. No ocultarlo.
- Si hay cache de Home Assistant/browser, comprobar primero que el texto/codigo viejo no exista en `src` ni `dist`.



<claude-mem-context>
# Memory Context

# [smart-area] recent context, 2026-05-15 12:52am GMT+2

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision 🚨security_alert 🔐security_note
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 32 obs (12.895t read) | 2.082.563t work | 99% savings

### May 2, 2026
1 10:25p 🔵 smart-area-card: Project Structure and Toolchain
2 " 🔵 smart-area-card: Source File Map and Responsibilities
3 " 🔵 smart-area-card: Main Card Execution Flow
4 " 🔵 smart-area-card: Device Model and State Computation
5 " 🔵 smart-area-card: SmartRoomCardConfig — Full Type System
6 " 🔵 smart-area-card: Visual Editor Architecture
7 " 🔵 smart-area-card: Fragile Zones and Technical Debt
8 " 🟣 Sensors Section UI: Show Toggle + Open Details Checkbox
9 11:24p 🟣 New `header_sensors_enabled` Config Flag with Sensors Panel in Editor
10 " 🔄 Sensor Click Target Merged Into Sensor Strip Element
11 " 🔵 Pre-existing Failing Test: evaluateClimateAlert Room Name
12 11:40p 🔄 Sensor "Primary" tip moved inside sensor card header row
13 11:41p 🟣 Primary sensor tip relocated inside sensor card header — deployed to main
14 11:43p 🔵 Persistent patch-not-sticking issue: same primaryTip change attempted 3+ times
15 11:44p ✅ CTA animations slowed from ~1.5s to 3.2s in editor preview
17 11:45p 🔴 evaluateClimateAlert reason now includes sensor value and unit via formatSensorAlertReason helper
18 11:47p ⚖️ CSS gradient shadow constraint: extend only to 50% of sensors section
16 11:48p 🔵 evaluateClimateAlert signature accepts roomName but doesn't use it in reason string
### May 3, 2026
19 12:12a 🔵 Header shadow gradient architecture: two-layer system in config-helpers.ts and styles.ts
20 " 🔴 Shorten header shadow gradient to stop at ~118px instead of 240px
### May 6, 2026
21 10:08p 🟣 smart-area-card: Performance Mode System Added
22 " 🟣 smart-area-card: Editor Lazy-Loaded via Dynamic Import
23 " 🟣 smart-area-card: Incremental Device Model Recompute
24 " 🔄 smart-area-card: Lit repeat() Directives Replace .map() in All Lists
25 " 🔵 smart-area-card: Git Commit Blocked by index.lock Permission Error
26 10:31p 🟣 Card Performance Maximization — 11 Files Changed, Committed and Pushed
### May 14, 2026
27 11:47p 🟣 Smart Area Card Performance Optimization — Full Pass Completed
28 11:57p 🟣 AGENTS.md Created for Agent Optimization
### May 15, 2026
29 12:40a 🔵 smart-area-card Project Architecture Mapped
30 " ✅ AGENTS.md Rewritten as Comprehensive Agent Guide
31 " 🔵 Git index.lock Permission Denied on Windows
32 12:44a 🔵 Git Operations Require Escalated Sandbox Permissions on This Machine

Access 2083k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>

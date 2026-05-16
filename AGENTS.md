# AGENTS.md

Guia operativa para agentes que reciban tareas concretas sobre `smart-area-card`.

El objetivo de este archivo es que el agente tarde menos en orientarse, toque solo lo necesario, mantenga el diseno deseado de la card/editor y cierre cada tarea con validacion, commit, push y deploy cuando corresponda.

## Prioridades

1. Mantener compatibilidad con configuraciones existentes.
2. No romper el editor visual.
3. No introducir regresiones en la card final.
4. Mantener el resultado visual compacto, pulido y coherente con Home Assistant.
5. Optimizar tiempo y recursos: leer primero los archivos correctos, hacer cambios acotados, validar proporcionalmente y evitar exploracion innecesaria.
6. Si el cambio genera `dist/` y todo pasa, desplegar por SSH a Home Assistant antes de responder.

## Como Empezar Una Tarea

Antes de editar:

1. Revisar estado del repo:

```powershell
git status --short
```

2. Leer solo el contexto necesario segun la tarea:

- Card final: `src/smart-area-card.ts`, `src/styles.ts`, helpers relacionados.
- Editor visual: `src/smart-area-card-editor.ts`, `src/editor/editor-styles.ts`, `src/editor/*`.
- Config/tipos/defaults: `src/helpers/types.ts`, `src/helpers/config-helpers.ts`, card y editor.
- Render/modelos: `src/helpers/compute-render-model.ts`, `src/helpers/room-model.ts`, `src/helpers/device-model.ts`.
- Tests: `src/**/__tests__/*`.

3. Buscar con `rg` antes de asumir nombres o relaciones:

```powershell
rg "nombre_o_config"
rg "metodo_o_clase"
```

4. Si hay cambios previos del usuario, no revertirlos. Trabajar alrededor de ellos o integrarlos si afectan a la tarea.

## Mapa Rapido

- `src/smart-area-card.ts`: componente final. Render principal, header, sensores, badges, alertas, automatizaciones, expander, grid y acciones.
- `src/smart-area-card-editor.ts`: editor visual. Secciones, previews, patching de config y evento `config-changed`.
- `src/styles.ts`: estilos de la card final.
- `src/editor/editor-styles.ts`: estilos del editor, previews y escalado.
- `src/helpers/types.ts`: tipos de config y contratos principales.
- `src/helpers/compute-render-model.ts`: une config + estado de Home Assistant en un modelo renderizable.
- `src/helpers/room-model.ts`: sensores de header, alertas, badges y helpers de area.
- `src/helpers/device-model.ts`: estado calculado de dispositivos, badges, alertas, imagenes y acciones.
- `src/helpers/config-helpers.ts`: defaults, imagenes, storage keys y helpers de config.
- `src/helpers/validate-config.ts`: warnings runtime.
- `src/**/__tests__/*`: tests unitarios.
- `dist/`: salida generada por `npm run build`.

## Rutas De Cambio

### Cambios De UI En La Card Final

Revisar normalmente:

- `src/smart-area-card.ts`
- `src/styles.ts`
- helper que calcule el dato mostrado
- tests si cambia logica observable

Comprobar tambien si el editor debe previsualizar el cambio.

### Cambios Del Editor Visual

Revisar normalmente:

- `src/smart-area-card-editor.ts`
- `src/editor/editor-styles.ts`
- helpers en `src/editor/*`
- tipos/defaults si la opcion toca config

El editor debe seguir siendo robusto aunque falten entidades o haya config parcial.

### Cambios De Config

Actualizar siempre que aplique:

- `SmartRoomCardConfig` en `src/helpers/types.ts`
- defaults/fallbacks en helpers, card y editor
- render final
- editor visual
- validacion en `src/helpers/validate-config.ts`
- tests del comportamiento nuevo

No romper configuraciones antiguas. Si una opcion nueva es opcional, definir fallback claro.

### Cambios De Sensores

Revisar:

- `room-model.ts`
- `compute-render-model.ts`
- render/header en `smart-area-card.ts`
- seccion Sensors del editor
- tests de alertas/sensores

Reglas:

- `ui.header_sensors_enabled` controla la tira de sensores.
- `ui.header_climate_more_info` controla click/detalles cuando los sensores estan activos.
- Sensores con alerta activa deben verse en rojo en el header.
- Mensajes de alarma usan formato `Sensorname: Sensorvalue`.
- Si no hay nombre de area, los sensores y badges deben seguir apareciendo.

### Cambios De Devices

Revisar:

- `device-model.ts`
- render del grid en `smart-area-card.ts`
- estilos del grid en `styles.ts`
- seccion Devices y preview del editor

Reglas:

- El slider de tamano del grid debe estar encima del preview.
- Tipo/preset puede afectar defaults, estado, alertas, imagenes y acciones.
- Mantener dimensiones estables para evitar saltos de layout.

### Cambios De Automations

Revisar:

- render de badge/panel en `smart-area-card.ts`
- modelo si cambia el dato
- seccion correspondiente del editor

Reglas:

- `automation_badge_enabled` controla visibilidad del badge.
- `automation_badge_click_details` controla click, CTA y panel.
- Animaciones CTA del badge y sensores en preview deben sentirse coordinadas.

### Cambios De Background/Header

Revisar:

- `config-helpers.ts`
- `styles.ts`
- header en `smart-area-card.ts`
- previews del editor

Reglas:

- La imagen de fondo se renderiza por CSS con `buildRoomBackgroundImage()`.
- Mantener una ruta unificada CSS tambien en dark mode.
- El shadow superior debe proteger el header sin oscurecer paneles inferiores.
- Header preview y devices preview usan fondo neutro/degradado, no la imagen real.
- Card setup conserva su preview de background bajo el selector de area.

## Diseno Esperado

La card debe sentirse como una pieza nativa, compacta y premium dentro de Lovelace:

- Densa pero legible.
- Jerarquia clara: header, badges/sensores, alertas, automatizaciones y devices.
- Sin texto explicativo innecesario dentro de la UI.
- Sin cambios cosmeticos no pedidos.
- Estados visuales claros para alerta, activo, inactivo, unavailable y acciones clicables.
- Animaciones discretas y utiles, no decorativas.
- Previews del editor fieles a la card final cuando sea importante para configurar.

El editor debe sentirse como herramienta:

- Controles previsibles y agrupados por seccion.
- Opciones dependientes solo visibles cuando aplican.
- Previews estables, escalados y sin romper layout.
- Textos visibles siempre en ingles, precisos y naturales.

## Reglas De Edicion

- Usar `apply_patch` para ediciones manuales.
- No reordenar bloques grandes si la tarea es pequena.
- Preferir helpers existentes antes de crear patrones nuevos.
- No introducir dependencias salvo necesidad clara.
- Mantener cambios acotados al elemento/funcion pedido.
- No modificar `dist/` manualmente; `dist/` debe salir de `npm run build`.
- No usar `git reset --hard`.
- No revertir cambios ajenos salvo peticion explicita.
- Textos visibles de card/editor: siempre en ingles.
- Comentarios de codigo: pocos y solo si aclaran logica no evidente.

## Validacion

Para cambios de codigo, ejecutar en este orden:

```powershell
npm run check
npm run build
npm run test:run
```

Notas:

- `npm run check` ejecuta `tsc --noEmit`.
- `npm run build` genera `dist/smart-area-card.js`.
- `npm run test:run` ejecuta Vitest una vez.
- Si falla `check`, arreglar tipos antes de seguir.
- Si falla `build`, no desplegar ni entregar como terminado.
- Si falla `test:run`, distinguir si es fallo nuevo o preexistente y no ocultarlo.

Para cambios solo de documentacion:

- No es obligatorio ejecutar `check/build/test`.
- Revisar `git diff --stat` y el diff final antes de commit.
- No desplegar por SSH si solo cambio documentacion y `dist/` no cambio.

## Deploy A Home Assistant

Si el cambio toca codigo, estilos o cualquier cosa que requiera `npm run build`, y `check`, `build` y `test:run` pasan, desplegar `dist/` por SSH antes de responder.

Comando obligatorio de deploy:

```powershell
C:\Windows\System32\OpenSSH\ssh.exe -i ~/.ssh/id_rsa_servidor1 yow@192.168.1.13 "mkdir -p /home/yow/docker/homeassistant/config/www/smart-area-card && find /home/yow/docker/homeassistant/config/www/smart-area-card -mindepth 1 -maxdepth 1 -exec rm -rf {} +" ; if ($LASTEXITCODE -eq 0) { C:\Windows\System32\OpenSSH\scp.exe -i ~/.ssh/id_rsa_servidor1 -r .\dist\* yow@192.168.1.13:/home/yow/docker/homeassistant/config/www/smart-area-card/ }
```

Reglas:

- Ejecutar deploy solo despues de validacion OK.
- Borrar antes el contenido remoto con el `find` del comando.
- Si falla el deploy, reportarlo con claridad y no decir que quedo desplegado.
- Si solo se modifico documentacion, no hacer deploy.

## Git Obligatorio

Despues de cualquier modificacion de archivos:

1. Revisar cambios:

```powershell
git diff --stat
git diff
```

2. Comprobar si hay cambios:

```powershell
git diff --quiet
```

3. Si hay cambios, anadir todo:

```powershell
git add -A
```

4. Crear commit:

```powershell
git commit -m "Codex: breve descripcion"
```

5. Subir:

```powershell
git push origin HEAD
```

Reglas:

- No pedir confirmacion para commit/push.
- No hacer commit/push si no hay cambios.
- Si `AGENTS.md` aparece modificado antes de empezar, tratarlo como cambio del usuario y no revertirlo.
- Si git falla por permisos o `index.lock` en Windows, reintentar con permisos escalados si la herramienta lo requiere.

## Cierre De Tarea

Antes de responder al usuario:

1. Confirmar `git diff --stat`.
2. Confirmar validacion ejecutada o explicar por que no aplica.
3. Confirmar commit y push si hubo cambios.
4. Confirmar deploy SSH si hubo build de `dist/`.
5. Responder breve, en espanol, con:
   - que se cambio;
   - comandos ejecutados;
   - commit subido;
   - si se desplego o no;
   - recordatorio de refrescar Home Assistant si ve codigo viejo.

Para refrescar Home Assistant:

- Recargar el recurso/dashboard.
- Si sigue apareciendo codigo viejo, hacer limpieza fuerte de cache del navegador.
- Si aun persiste, comprobar que el texto/codigo viejo no exista en `src` ni en `dist`.

## Fallos Conocidos Y Criterio

- Si aparece `EPERM` con esbuild/Vitest en Windows, comprobar si es bloqueo del entorno. No ocultarlo.
- Si tests fallan, buscar si el fallo ya era preexistente antes de atribuirlo al cambio.
- Si el navegador/Home Assistant muestra cache vieja, verificar primero `src`, luego `dist`, luego deploy remoto.
- Si una tarea pide algo ambiguo, hacer la interpretacion mas conservadora y compatible con el sistema actual.

# Claude Usage Bar

Menu bar / system tray app que muestra tu uso del **bloque de 5h actual de Claude Code** (Pro / Max 5x / Max 20x) leyendo los logs locales en `~/.claude/projects/`.

- macOS: app de barra de menú (sin dock). Título: `▣▣▣░░ 67%`
- Windows: tray icon con tooltip
- Click → popover con tokens usados, ventana del bloque, countdown al reset, mensajes, total del día
- Sin scraping, sin API key, sin llamadas a la red — todo local

## Cómo funciona

Claude Code escribe cada interacción a `~/.claude/projects/<proyecto>/<sesión>.jsonl`. Cada línea trae `message.usage` con `input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`.

La app:
1. Recorre todos los `.jsonl` cada 60s (configurable)
2. Agrupa los mensajes en bloques de 5h (estilo `ccusage`): nuevo bloque al primer mensaje, o tras una pausa ≥5h
3. Encuentra el bloque activo (que contiene `now`) y suma sus tokens
4. Compara contra el límite del plan elegido

## Run

```bash
npm install
npm start
```

Al abrir Settings: elige tu plan (Pro / Max 5x / Max 20x) o pon un límite custom. La estimación de tokens por bloque es aproximada (comunidad):

| Plan      | Tokens / bloque 5h |
|-----------|---------------------|
| Pro       | ~19M                |
| Max 5x    | ~88M                |
| Max 20x   | ~220M               |

## Limitaciones honestas

- Solo cuenta uso de **Claude Code**. Mensajes en claude.ai (web/desktop) **no aparecen** porque Anthropic no expone esa data públicamente.
- Los límites por bloque son estimaciones; Anthropic no publica el número exacto. Ajusta a "Custom" si los tuyos difieren.
- El "bloque activo" se calcula localmente; debería coincidir con lo que muestra Claude Code, pero no hay un endpoint oficial para verificarlo.

## Build

```bash
npm run build:mac   # .dmg
npm run build:win   # .exe NSIS
```

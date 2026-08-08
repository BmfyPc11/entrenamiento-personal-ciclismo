# Rework de la interfaz — "cuaderno técnico"

## Contexto

La interfaz actual funciona pero se navega con una fila de pestañas que ya carga ocho
secciones, y estéticamente se ha quedado en un panel oscuro genérico. Alex quiere algo más
moderno y cómodo de recorrer, con la personalidad que sugiere el nombre del proyecto.

**Restricciones dadas:** el contenido es el que ya existe (no se añaden funcionalidades),
todo en castellano sin mezclar idiomas, sin degradados, alto contraste sobre negro con el
amarillo como acento. El mapa y los "logros y premios" de los bocetos quedan fuera: no son
re-skin sino funcionalidad nueva, y merecen su propia conversación.

**Lo que hace este trabajo poco arriesgado**, medido sobre el código:

- Toda la lógica vive en `lib/` con 52 pruebas. La interfaz se puede rehacer entera sin
  poner en riesgo un solo cálculo.
- Los tokens de diseño ya están centralizados en `globals.css`.
- De los estilos en línea repartidos por los componentes, **solo un tercio toca color**; el
  resto es maquetación que no hay que redecidir.
- El acento rojo actual aparece en **4 sitios** del CSS.
- Son 4.469 líneas en 16 componentes, sin una sola dependencia de interfaz.

**El hallazgo que orienta el diseño:** la app ya habla el idioma que buscamos. Etiquetas en
monoespaciada con mayúsculas y tracking amplio, números tabulares, títulos en mayúsculas
con tracking negativo, líneas finas de separación. No hay que inventar un lenguaje visual,
hay que amplificar el que ya existe y quitarle lo que lo diluye.

## Lenguaje visual

**Menos caja, más línea.** Hoy casi todo bloque es una tarjeta con relleno y borde, y esa
uniformidad aplana la jerarquía: un dato suelto pesa lo mismo que una tabla de veinte
filas. El relleno se reserva para las tarjetas de dato (`.stat`), que sí lo aprovechan, y
el resto pasa a bloques separados por líneas finas.

**Tipografía como estructura.** Los títulos de sección crecen y ganan aire por encima. Las
etiquetas siguen en monoespaciada, mayúsculas y tracking amplio. Todos los números en
monoespaciada con cifras tabulares, que es lo que permite comparar columnas de un vistazo.

**Un solo acento, y con una regla estricta.**

El amarillo de marca (`--acento`) se usa **solo en elementos interactivos y de marca**:
sección activa en la navegación, foco de teclado, marca de la cabecera. **Nunca dentro de
un gráfico.**

La razón: la zona 3 de frecuencia cardíaca ya es ámbar, y el subrayado de los puertos ya es
amarillo. Si el acento de marca fuera el mismo tono, el color dejaría de significar algo
dentro de las gráficas. Por eso el acento es un amarillo más vivo y saturado, reservado al
cromo de la interfaz, mientras los gráficos conservan su paleta semántica intacta.

**Los colores semánticos no se tocan.** Zonas de FC, tramos de dureza y categorías de
puerto significan cosas concretas y están validados contra fondo oscuro. Cambiarlos sería
deshacer trabajo bueno.

## Tokens

En `app/globals.css`, sustituyendo los actuales:

```css
/* superficies: negro más profundo que el actual, para ganar contraste */
--bg:#0A0C0F; --bg2:#111419; --card:#12161C; --card2:#191E26;
--line:#232A34; --line2:#333C48;

/* texto: blanco más puro arriba, misma escala de grises debajo */
--ink:#F2F4F6; --ink2:#A8B2BE; --ink3:#6E7885;

/* acento de marca: solo interfaz, nunca gráficas */
--acento:#F2C230; --acento-ink:#0A0C0F;
```

Los tokens semánticos (`--red`, `--blue`, `--green`, `--amber`, `--orange`, `--z1`…`--z5`)
se mantienen con sus valores actuales.

Se añaden escalas que hoy no existen y que ahora mismo se resuelven con números sueltos
repartidos por el CSS:

```css
--e1:4px; --e2:8px; --e3:12px; --e4:16px; --e5:24px; --e6:32px; --e7:48px;
--r:8px; --r-s:5px;      /* radios más ceñidos que el 10px actual */
```

## Estructura

### Carcasa

Un componente nuevo, `components/Layout.jsx`, con la barra lateral y el área de contenido:

- **Escritorio (>900 px):** barra lateral fija de 232 px. Marca arriba, las ocho secciones
  en medio, tarjeta de usuario y salir abajo.
- **Móvil (≤900 px):** la barra se convierte en cajón. Barra superior delgada con botón de
  menú, capa oscura detrás, cierre al pulsar fuera o con Escape, y el foco vuelve al botón
  al cerrar.

Las secciones conservan sus nombres actuales, todos en castellano: Resumen, Tus datos,
Entrenamientos, Mis ascensiones, Carga y forma, Objetivos, Rutas, Analizar GPX.

### Iconos

Ocho iconos como SVG en línea, trazo de 1,5 px y `currentColor`, en
`components/Iconos.jsx`. Sin dependencias nuevas: una librería de iconos pesaría más que
los ocho dibujos que necesitamos.

### Separar Dashboard.jsx

`Dashboard.jsx` son 596 líneas que mezclan tres cosas: estado y descarga de datos,
navegación, y el contenido de las secciones Resumen y Carga y forma.

Como la navegación se sustituye de todos modos, se aprovecha para separar:

| Archivo | Responsabilidad |
|---|---|
| `Dashboard.jsx` | Estado, descarga de datos, y qué sección se muestra |
| `Layout.jsx` | Carcasa: barra lateral, cajón móvil, cabecera |
| `Resumen.jsx` | La sección Resumen, hoy dentro de Dashboard |
| `CargaForma.jsx` | La sección Carga y forma, hoy dentro de Dashboard |

No es refactor gratuito: sin esta separación el archivo se vuelve inmanejable en cuanto se
le añade la carcasa.

## Fases

| Fase | Qué | Por qué en este orden |
|---|---|---|
| **1** | Tokens nuevos, `Layout` con barra lateral y cajón, separar `Dashboard` | Da la sensación de app nueva con el menor riesgo: el contenido de cada sección no se toca |
| **2** | Reestilizar las clases compartidas: `.stat`, `.panel`, `.card`, `.chart`, tablas, `.callout`, `.chips`, `.goal` | Propaga a las ocho secciones de una vez, sin entrar en ningún componente |
| **3** | Barrer los estilos en línea con color y pulir sección por sección | Es el tedioso, y solo tiene sentido cuando lo de arriba está fijado |

Tras las fases 1 y 2 se para a revisar antes de entrar en la 3.

## Verificación

No hay pruebas automáticas de CSS, así que la verificación es visual y por compilación. En
cada fase:

1. `npm test` — las 52 pruebas siguen en verde. No tocan interfaz: si se rompen, es que se
   ha tocado lógica sin querer.
2. `npm run build` — compila limpio, con el servidor de desarrollo parado.
3. Repaso visual de las ocho secciones, comprobando que ninguna ha perdido contenido.
4. Repaso específico de legibilidad sobre el fondo nuevo: perfil de altimetría, fichas de
   puerto, colores de zona y de dureza, y las tablas.
5. Repaso en móvil: el cajón abre, cierra al pulsar fuera y con Escape, y ninguna tabla
   desborda horizontalmente la página.

## Qué NO entra

- **El mapa** de los bocetos. Los datos (`latlng`) ya están; se valorará más adelante, y la
  primera opción a estudiar será dibujar el trazado como SVG sin teselas ni dependencias.
- **Logros y premios.** No es re-skin: hace falta definir qué cuenta como récord y
  detectarlo. Merece su propia conversación.
- **Funcionalidad nueva de cualquier tipo.** El contenido es exactamente el que ya hay.
- **Cambiar los colores semánticos** de zonas, dureza y categorías.

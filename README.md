# Aurum — Centro de mando Meta Ads

Panel de métricas, embudo de lanzamiento y copiloto de IA sobre tu cuenta de Meta Ads.
Los datos llegan por Windsor.ai; los números que Meta nunca ve (asistentes al webinar,
ventas por ticket, cash recogido) los metes tú y el ROAS sale solo.

## Arrancar

```bash
npm install
npm run dev          # http://localhost:4321
```

## Configuración — `.env.local`

```
WINDSOR_API_KEY=...            # tu clave de Windsor.ai
WINDSOR_ACCOUNT=facebook__...  # id de la cuenta publicitaria
ANTHROPIC_API_KEY=...          # console.anthropic.com/settings/keys
```

El panel funciona sin `ANTHROPIC_API_KEY`; solo se apagan las dos pestañas de IA.

> Las claves viven en el servidor y nunca llegan al navegador. `.env.local` está en
> `.gitignore`. La clave de Windsor que usamos viajó por una URL — si esa URL se ha
> compartido en algún sitio, rótala desde Windsor.

## El límite de 9 campos de Windsor

Windsor acepta como mucho 9 campos por petición. En vez de conformarse con 9 métricas,
`src/lib/windsor.ts` lanza **tres peticiones en paralelo** que comparten las 4 columnas
de grano (`date + campaign + adset_name + ad_name`) y traen 5 métricas cada una, y luego
las une. Resultado: 15 métricas en vez de 5.

El grano incluye `adset_name` a propósito: si dos conjuntos usan el mismo nombre de
anuncio el mismo día, una clave más gruesa duplicaría el gasto en silencio.

Si un lote falla, los otros dos siguen y el panel avisa de que los datos son parciales
en vez de enseñar ceros como si fueran reales.

## Cómo se calculan las métricas

Solo se piden **contadores crudos** (gasto, impresiones, clics, leads…). Todos los
ratios — CTR, CPC, CPM, CPL, coste por registro — se derivan de esas sumas en
`src/lib/metrics.ts`. Promediar los CTR por fila que devuelve Meta daría el mismo peso a
una fila de 3 impresiones que a una de 30.000; derivarlos de sumas es correcto a
cualquier nivel de agregación.

Cuando un ratio no se puede calcular (dividir por cero) devuelve `null` y la interfaz
pinta «—». Nunca un 0 que parezca un dato.

## Pestañas

| Pestaña | Qué hace |
|---|---|
| **Resumen** | KPIs, evolución diaria, reparto del gasto, embudo y dispersión de anuncios |
| **Anuncios** | Tabla ordenable por campaña / conjunto / anuncio, con señal frente a la media |
| **Lanzamientos** | Embudo manual + ventas → ROAS, CAC, break-even y beneficio real |
| **Creativos** | Sube el flyer o pega el guion; Claude lo analiza contra sus métricas |
| **Copiloto IA** | Análisis de toda la cuenta: qué escalar, qué apagar, qué testear |

## Registrados vs leads cualificados

Los dos eventos de Meta no son hermanos, uno contiene al otro:

- **Registrados** (`actions_complete_registration`) — todo el que completó el registro. Es el
  total de leads que entraron.
- **Leads cualificados** (`actions_lead`) — el subconjunto que supera **3 de scoring**. Solo
  estos se reportan a Meta como lead.

Por eso el embudo va `vistas de landing → registrados → leads cualificados`, y la **tasa de
cualificación** (`leads ÷ registrados`) separa dos problemas distintos: un CPL alto con buena
cualificación es un problema de coste de tráfico; una cualificación baja es un problema de
público o de promesa del anuncio. Los prompts de IA llevan este glosario.

## Comparación con el periodo anterior

Cada KPI muestra su variación frente a la ventana equivalente inmediatamente anterior, con el
sentido correcto por métrica: subir leads es bueno, subir el CPL no, y el gasto es neutro (subir
no es ni bueno ni malo por sí solo). La ventana anterior se pide en una **segunda petición
aparte**: duplica las llamadas a Windsor, así que si fuera en la misma los KPIs tardarían ~12 s
en pintar en vez de ~1,4 s. Los deltas entran después sin bloquear nada.

## Tiempo real: Windsor vs Meta directo

Windsor es un **conector programado**: sincroniza con Meta a su ritmo y **no acepta que se le
fuerce** — probamos `refresh`, `sync`, `realtime` y `cache=false` (los ignora, devuelven el mismo
valor) y `force_refresh` (bloqueado con 403). Sus cifras sí se mueven — el gasto de hoy pasó de
115,75 a 115,61 entre dos lecturas nuestras, porque Meta reajusta — pero cuando Windsor quiere.

Para tiempo real de verdad, rellena `META_ACCESS_TOKEN` y `META_AD_ACCOUNT_ID` en `.env.local`:
entonces «Sincronizar» consulta la Marketing API de Meta en directo (`/insights`, nivel anuncio,
`time_increment=1`) y la cabecera indica **«En vivo desde Meta»**. Sin token el panel funciona
igual vía Windsor, y si la llamada en vivo falla cae a Windsor mostrando el motivo en vez de
quedarse en blanco.

## Escalera de costes

Cuánto cuesta **una** unidad de cada paso: una impresión → un clic → un clic en enlace → una
vista de landing → un registrado → un lead cualificado. El multiplicador entre pasos señala dónde
se encarece el embudo. El salto de impresión a clic se excluye del resaltado porque es el inverso
del CTR y siempre sería el mayor.

## Plan de acción

`src/lib/recommendations.ts` es un motor **determinista**: reglas aritméticas sobre las mismas
cifras que ya están en pantalla, así que es instantáneo, gratis, reproducible y siempre enseña
los números que dispararon cada aviso. No compite con el copiloto de IA — es el suelo. La IA
aporta juicio; esto aporta lo que simplemente es cierto.

Reglas: anuncios con tráfico y cero leads · el ganador que merece más presupuesto · fuga entre
clic y landing · fatiga de frecuencia · volumen que no cualifica · concentración de gasto en un
solo creativo · conjuntos sin conversión. Cada una respeta el mismo umbral de muestra que el
resto del panel.

## Peticiones largas a la IA

Los endpoints de IA tardan 60–120 s. `src/lib/api.ts` envuelve esas llamadas con un tiempo
límite y traduce el `Failed to fetch` del navegador — que no dice nada — a una causa accionable
(servidor reiniciado, portátil suspendido, conexión caída). El botón muestra los segundos
transcurridos para que se vea que sigue viva.

## Significancia estadística

Las filas con menos de 50 clics en enlace y menos de 5 leads se marcan como **poca
muestra** en vez de rankearse: su CPL todavía no sirve para decidir. Los prompts de IA
llevan la misma regla, así que Claude dice «aún no se sabe» en vez de inventar una
recomendación con datos insuficientes.

## Rangos de fecha

Chips: **Hoy · Ayer · 7 / 14 / 30 / 90 días · Este mes · Personalizado** (con dos selectores
de fecha). Los rangos rodantes **excluyen el día en curso** a propósito: un día a medias
arrastra el CPL hacia abajo y hace que toda comparación parezca mejor de lo que es. Para la
vista en vivo está el chip «Hoy».

Windsor solo acepta `last_Xd`, `last_Xw`, `last_Xm`, `this_month`, `this_year` y sus variantes
`T`. Cualquier otra cosa (incluido `last_month`) la rechaza. Los rangos día a día y el
personalizado van por `date_from`/`date_to`, los únicos parámetros de rango explícito que
Windsor respeta — `start_date`/`end_date` y `from`/`to` se aceptan y luego **se ignoran en
silencio**, devolviendo una ventana por defecto.

## Huso horario

La cuenta reporta en **New York** (`ACCOUNT_TZ` en `src/lib/ranges.ts`), así que «Hoy» y
«Ayer» son días de Nueva York, no del reloj de tu navegador. Sin esto, desde España después
de medianoche el panel pedía un día que para Windsor todavía era futuro y la petición moría.
Cambia esa constante si la cuenta cambia de huso.

Se mantiene además un recorte automático de seguridad: si Windsor aún no tiene datos de la
fecha pedida, la ventana se ajusta al último día disponible y el panel te dice hasta cuál
está mostrando, en vez de etiquetar mal el día.

## Divisa

Se lee de Windsor (`account_currency`), no se asume. Esta cuenta factura en **USD**. Los
importes usan formato numérico español (1.234,56) con símbolo corto: `1.234,56 $`.

## Persistencia

Lanzamientos, análisis de creativos e informes se guardan en un `store.json`
(escritura atómica vía fichero temporal + rename, y en cola para que dos peticiones
simultáneas no se pisen). La carpeta es `./data` por defecto, o `DATA_DIR` si esa
variable está definida — ver "Desplegar en Render" más abajo. Localmente `data/`
está en `.gitignore`: haz copia si te importa.

## Desplegar en Render

**El disco de un Web Service normal en Render es efímero**: cada redeploy (cada
`git push`, cada reinicio del contenedor) lo borra. Sin nada más, `store.json`
volvería a estar vacío en cada deploy — perderías lanzamientos, análisis e
informes guardados.

Este repo incluye `render.yaml` con un **Persistent Disk** de 1 GB montado en
`/data`, y `DATA_DIR=/data` para que el store escriba ahí en vez de en el
filesystem efímero del contenedor. Con eso:

1. En Render: **New → Blueprint**, apunta al repo, y usa este `render.yaml`
   (requiere plan **Starter** o superior — el plan Free no permite discos).
2. En la pestaña **Environment** del servicio, rellena las claves reales:
   `WINDSOR_API_KEY`, `WINDSOR_ACCOUNT`, `ANTHROPIC_API_KEY` y, si quieres
   sincronización en vivo, `META_ACCESS_TOKEN` + `META_AD_ACCOUNT_ID`. El
   `render.yaml` las declara como `sync: false` a propósito: son secretos y no
   van en un fichero versionado.
3. Despliega. La URL de Render sirve el dashboard igual para cualquier
   dispositivo — las claves viven solo en el servidor, nunca en el navegador,
   así que no hay nada que configurar por dispositivo.

Si despliegas sin Blueprint (servicio manual) y sin disco persistente, el panel
funciona igual pero **cualquier lanzamiento, análisis o informe guardado
desaparece en el próximo deploy**. Está bien para probar; no para uso real.

## Diseño

Paleta dorado + blanco pastel, validada con el verificador de contraste y daltonismo en
los dos modos (peor par adyacente: ΔE CVD 18,2 claro / 13,8 oscuro; visión normal 33,7 /
28,2). Tres tonos en claro quedan por debajo de 3:1 sobre el fondo crema, así que **cada
gráfico lleva etiquetas directas y vista de tabla** — no es decoración, es el canal de
relevo que hace accesible la paleta. Si quitas la vista de tabla, deja de cumplir.

El orden de los colores de serie es el mecanismo de seguridad para daltonismo: no lo
reordenes ni asignes un color por ranking.

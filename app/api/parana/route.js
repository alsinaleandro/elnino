export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SOURCE_URL = 'https://contenidosweb.prefecturanaval.gob.ar/alturas/'

function normalizeText(value) {
  return String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00a0/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractParanaRow(html) {
  const rows = Array.from(html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)).map((match) => match[0])
  const exactRow = rows.find((row) => {
    const text = normalizeText(row)
    const paranaCount = (text.match(/PARANA/gi) || []).length
    return paranaCount >= 2
  })

  if (exactRow) return exactRow

  const pipeMatch = html.match(/\|\s*PARANA\s*\|\s*PARANA\s*\|[\s\S]*?(?=\n\s*\||\n\s*#|\n\s*Prefectura|$)/i)
  return pipeMatch ? pipeMatch[0] : null
}

function parseRowCells(row) {
  const htmlCells = Array.from(row.matchAll(/<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi))
    .map((match) => normalizeText(match[1]))
    .filter(Boolean)

  if (htmlCells.length >= 10) return htmlCells

  const withoutTags = row
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00a0/gi, ' ')
    .replace(/\s*\|\s*/g, '|')

  return withoutTags
    .split('|')
    .map((cell) => normalizeText(cell))
    .filter(Boolean)
}

export async function GET() {
  try {
    const response = await fetch(SOURCE_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    })

    if (!response.ok) {
      return Response.json({ error: 'No se pudo consultar la fuente original.', source: SOURCE_URL }, { status: 502 })
    }

    const html = await response.text()
    const row = extractParanaRow(html)

    if (!row) {
      return Response.json({ error: 'No se encontró información del río Paraná en la fuente original.', source: SOURCE_URL }, { status: 404 })
    }

    const cells = parseRowCells(row)
    const station = cells[0] || 'PARANA'
    const river = cells[1] || 'PARANA'
    const altura = cells[2] || 'N/D'
    const variacion = cells[3] || 'N/D'
    const periodo = cells[4] || 'N/D'
    const fecha = cells[5] || 'N/D'
    const estado = cells[6] || 'N/D'
    const valorAnterior = cells[7] || 'N/D'
    const fechaAnterior = cells[8] || 'N/D'
    const cotaMin = cells[9] || 'N/D'
    const cotaMax = cells[10] || 'N/D'

    return Response.json({
      source: 'Prefectura Naval Argentina',
      url: SOURCE_URL,
      river,
      station,
      data: {
        altura,
        variacion,
        periodo,
        fecha,
        estado,
        valorAnterior,
        fechaAnterior,
        cotaMin,
        cotaMax,
      },
    })
  } catch (error) {
    console.error('Error fetching river data', error)
    return Response.json({ error: 'Error al consultar la información del río Paraná.', source: SOURCE_URL }, { status: 500 })
  }
}

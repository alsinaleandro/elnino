export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const SOURCE_URL = 'https://contenidosweb.prefecturanaval.gob.ar/alturas/'
const SOURCE_MIRROR = 'https://r.jina.ai/http://https://contenidosweb.prefecturanaval.gob.ar/alturas/'

function normalizeText(value) {
  return String(value ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\*\*/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00a0/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function findParanaRows(html) {
  const htmlRows = Array.from(html.matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)).map((match) => match[0])
  const rows = [...htmlRows]

  if (rows.length) {
    const exact = rows.find((row) => {
      const text = normalizeText(row)
      const paranaCount = (text.match(/PARANA/gi) || []).length
      return paranaCount >= 2
    })
    if (exact) return [exact]
  }

  const pipeRows = Array.from(html.matchAll(/(?:^|\n)\s*\|\s*[^|\n]*PARANA[^|\n]*\|[\s\S]*?(?=\n\s*\||\n\s*#|\n\s*Prefectura|$)/gi)).map((match) => match[0])
  return pipeRows.length ? pipeRows : []
}

function extractParanaRow(html) {
  const rows = findParanaRows(html)

  if (!rows.length) return null

  const exactParanaRow = rows.find((row) => {
    const cells = parseRowCells(row)
    const first = normalizeText(cells[0])
    const second = normalizeText(cells[1])
    return first === 'PARANA' || second === 'PARANA'
  })

  return exactParanaRow || rows[0]
}

function parseRowCells(row) {
  const htmlCells = Array.from(row.matchAll(/<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi))
    .map((match) => normalizeText(match[1]))
    .filter(Boolean)

  if (htmlCells.length >= 10) return htmlCells

  const normalizedRow = row
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00a0/gi, ' ')
    .replace(/\*\*/g, ' ')
    .replace(/\s*\|\s*/g, '|')
    .trim()

  const cells = normalizedRow
    .split('|')
    .map((cell) => normalizeText(cell))
    .filter(Boolean)

  return cells.length > 0 ? cells : []
}

async function fetchSourceText() {
  const candidates = [
    { url: SOURCE_URL, label: 'oficial' },
    { url: SOURCE_MIRROR, label: 'mirror' },
  ]

  let lastError = null

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate.url)

      if (!response.ok) {
        lastError = new Error(`Respuesta ${response.status} desde ${candidate.url}`)
        continue
      }

      const text = await response.text()
      if (text && text.toLowerCase().includes('parana')) {
        return { text, url: candidate.url, label: candidate.label }
      }

      lastError = new Error(`No se encontró contenido útil en ${candidate.url}`)
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error('No fue posible consultar la fuente oficial del río Paraná.')
}

export async function GET() {
  try {
    const { text, url, label } = await fetchSourceText()
    const row = extractParanaRow(text)

    if (!row) {
      return Response.json({ error: 'No se encontró información del río Paraná en la fuente original.', source: SOURCE_URL }, { status: 404 })
    }

    const cells = parseRowCells(row)
      .map((cell) => normalizeText(cell).replace(/^!\[.*?\]\(.*?\)$/, ''))
      .filter((cell) => cell && !cell.startsWith('![') && !cell.startsWith('http'))

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
      url,
      access: label,
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
    return Response.json({ error: 'No se pudo consultar la información del río Paraná en la fuente oficial.', source: SOURCE_URL }, { status: 500 })
  }
}

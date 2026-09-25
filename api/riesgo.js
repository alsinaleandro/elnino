const fs = require('fs')
const path = require('path')

const GEOJSON_PATH = path.join(process.cwd(), 'client', 'public', 'riesgo_hidrico_AMGR_todas.geojson')

let geojsonCache = null

function normalizeRiskName(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function canonicalRiskName(value) {
  const normalized = normalizeRiskName(value)

  const exact = {
    'zona prohibida': 'Zona Prohibida',
    'zona de restriccion severa': 'Zona de Restricción Severa',
    'zona de restriccion severa temporaria': 'Zona de Restricción Severa Temporaria',
    'zona de restriccion leve': 'Zona de Restricción Leve',
    'fuera de cualquier zona de riesgo': 'Fuera de cualquier zona de riesgo',
    'sin datos de riesgo': 'Sin datos de riesgo',
  }

  return exact[normalized] || String(value ?? 'Sin datos de riesgo')
}

function isPointInRing(point, ring) {
  let inside = false

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]
    const yi = ring[i][1]
    const xj = ring[j][0]
    const yj = ring[j][1]

    const intersects =
      yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi + Number.EPSILON) + xi

    if (intersects) {
      inside = !inside
    }
  }

  return inside
}

function isPointInPolygon(point, polygonCoordinates) {
  if (!polygonCoordinates || polygonCoordinates.length === 0) return false

  const rings = Array.isArray(polygonCoordinates[0]) && Array.isArray(polygonCoordinates[0][0])
    ? polygonCoordinates
    : [polygonCoordinates]

  for (const ring of rings) {
    if (isPointInRing(point, ring)) {
      return true
    }
  }

  return false
}

function loadGeojson() {
  if (geojsonCache) return geojsonCache

  try {
    const raw = fs.readFileSync(GEOJSON_PATH, 'utf8')
    geojsonCache = JSON.parse(raw)
    return geojsonCache
  } catch (error) {
    console.error('No se pudo cargar el GeoJSON', error)
    return null
  }
}

function getRiskColor(zoneName) {
  const palette = {
    'Zona Prohibida': '#2ec4b6',
    'Zona de Restricción Severa': '#1d4ed8',
    'Zona de Restricción Severa Temporaria': '#f59e0b',
    'Zona de Restricción Leve': '#7dd3a8',
  }

  return palette[zoneName] || '#4f7ee3'
}

function findRiskZoneForPoint(latitude, longitude) {
  const geojson = loadGeojson()

  if (!geojson || !geojson.features) {
    return { zone: 'Sin datos de riesgo', color: '#4f7ee3' }
  }

  const point = [longitude, latitude]

  for (const feature of geojson.features) {
    if (!feature || !feature.properties || !feature.geometry) continue

    const name = canonicalRiskName(feature.properties.categoria)
    const geometry = feature.geometry

    if (geometry.type === 'Polygon' && isPointInPolygon(point, geometry.coordinates)) {
      return { zone: name, color: getRiskColor(name) }
    }

    if (geometry.type === 'MultiPolygon') {
      for (const polygon of geometry.coordinates) {
        if (isPointInPolygon(point, polygon)) {
          return { zone: name, color: getRiskColor(name) }
        }
      }
    }
  }

  return { zone: 'Fuera de cualquier zona de riesgo', color: '#2e7d32' }
}

module.exports = async function handler(req, res) {
  try {
    const latitude = Number(req.query.lat)
    const longitude = Number(req.query.lng)

    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      return res.status(400).json({
        error: 'Parámetros lat y lng requeridos y válidos.',
      })
    }

    const risk = findRiskZoneForPoint(latitude, longitude)
    return res.status(200).json(risk)
  } catch (error) {
    console.error('Error al calcular el riesgo', error)
    return res.status(500).json({ error: 'Error interno del servidor.' })
  }
}

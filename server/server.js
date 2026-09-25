const express = require('express')
const fs = require('fs')
const path = require('path')

const paranaHandler = require('../api/parana.js')

const app = express()
const PORT = process.env.PORT || 3001

const geojsonPath = path.join(__dirname, '..', 'client', 'public', 'riesgo_hidrico_AMGR_todas.geojson')
const geojsonData = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'))

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

function findRiskZoneForPoint(latitude, longitude) {
  if (!geojsonData || !geojsonData.features) {
    return {
      zone: 'Sin datos de riesgo',
      color: '#4f7ee3',
    }
  }

  const point = [longitude, latitude]

  for (const feature of geojsonData.features) {
    if (!feature || !feature.properties || !feature.geometry) continue

    const name = canonicalRiskName(feature.properties.categoria)
    const geometry = feature.geometry

    if (geometry.type === 'Polygon') {
      if (isPointInPolygon(point, geometry.coordinates)) {
        return {
          zone: name,
          color: {
            'Zona Prohibida': '#2ec4b6',
            'Zona de Restricción Severa': '#1d4ed8',
            'Zona de Restricción Severa Temporaria': '#f59e0b',
            'Zona de Restricción Leve': '#7dd3a8',
          }[name] || '#4f7ee3',
        }
      }
    }

    if (geometry.type === 'MultiPolygon') {
      for (const polygon of geometry.coordinates) {
        if (isPointInPolygon(point, polygon)) {
          return {
            zone: name,
            color: {
              'Zona Prohibida': '#2ec4b6',
              'Zona de Restricción Severa': '#1d4ed8',
              'Zona de Restricción Severa Temporaria': '#f59e0b',
              'Zona de Restricción Leve': '#7dd3a8',
            }[name] || '#4f7ee3',
          }
        }
      }
    }
  }

  return {
    zone: 'Fuera de cualquier zona de riesgo',
    color: '#2e7d32',
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, message: 'API de riesgo operativa' })
})

app.get('/api/riesgo', (req, res) => {
  const latitude = Number(req.query.lat)
  const longitude = Number(req.query.lng)

  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return res.status(400).json({
      error: 'Parámetros lat y lng requeridos y válidos.',
    })
  }

  const result = findRiskZoneForPoint(latitude, longitude)
  return res.json(result)
})

app.get('/api/parana', (req, res) => paranaHandler(req, res))

app.listen(PORT, () => {
  console.log(`Servidor de riesgo escuchando en http://localhost:${PORT}`)
})

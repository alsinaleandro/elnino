import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'

const defaultCenter = [-74.08175, 4.60971]
const riskColors = {
  'Zona Prohibida': '#2ec4b6',
  'Zona de Restricción Severa': '#1d4ed8',
  'Zona de Restricción Severa Temporaria': '#f59e0b',
  'Zona de Restricción Leve': '#7dd3a8',
}

const riskMeta = {
  'Zona Prohibida': {
    label: 'Muy alto',
    severity: 100,
    description: 'Se recomienda evitar la zona por restricciones importantes.',
  },
  'Zona de Restricción Severa': {
    label: 'Alto',
    severity: 75,
    description: 'Existe una restricción fuerte para actividades sensibles.',
  },
  'Zona de Restricción Severa Temporaria': {
    label: 'Medio alto',
    severity: 60,
    description: 'La zona presenta una restricción temporal importante.',
  },
  'Zona de Restricción Leve': {
    label: 'Bajo',
    severity: 30,
    description: 'La zona tiene menor nivel de restricción, pero requiere atención.',
  },
  'Fuera de cualquier zona de riesgo': {
    label: 'Sin riesgo',
    severity: 0,
    description: 'La ubicación no coincide con ninguna zona de riesgo del mapa.',
  },
  'Sin datos de riesgo': {
    label: 'Sin datos',
    severity: 0,
    description: 'Todavía no se pudo identificar la zona de riesgo asociada.',
  },
}

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

function getFeatureColor(feature) {
  const properties = feature?.properties || {}
  const category = canonicalRiskName(properties.categoria)

  return (
    properties.color ||
    properties.fill ||
    properties.stroke ||
    riskColors[category] ||
    '#4f7ee3'
  )
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

function findRiskZoneForPoint(latitude, longitude, geojsonData) {
  if (!geojsonData || !geojsonData.features) {
    return {
      name: 'Sin datos de riesgo',
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
          name,
          color: riskColors[name] || '#4f7ee3',
        }
      }
    }

    if (geometry.type === 'MultiPolygon') {
      for (const polygon of geometry.coordinates) {
        if (isPointInPolygon(point, polygon)) {
          return {
            name,
            color: riskColors[name] || '#4f7ee3',
          }
        }
      }
    }
  }

  return {
    name: 'Fuera de cualquier zona de riesgo',
    color: '#2e7d32',
  }
}

function App() {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markerRef = useRef(null)
  const geojsonDataRef = useRef(null)
  const lastCoordsRef = useRef(null)
  const lastRiskUpdateRef = useRef(0)
  const [status, setStatus] = useState('Consultando ubicación y zona de riesgo…')
  const [coords, setCoords] = useState(null)
  const [locationReady, setLocationReady] = useState(false)
  const [activeTab, setActiveTab] = useState('map')
  const [riskZone, setRiskZone] = useState('Sin datos de riesgo')
  const [riskColor, setRiskColor] = useState('#4f7ee3')
  const [riverInfo, setRiverInfo] = useState(null)
  const [riverLoading, setRiverLoading] = useState(false)

  const centerOnLocation = () => {
    const map = mapInstanceRef.current
    if (!map || !coords) return

    map.flyTo([coords[1], coords[0]], 16, {
      animate: true,
      duration: 1,
    })
  }

  const updateRiskFromPosition = async (latitude, longitude, accuracy) => {
    const startedAt = performance.now()

    try {
      const response = await fetch(`/api/riesgo?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}`, {
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error('API de riesgo no disponible')
      }

      const data = await response.json()
      const nextZoneName = data.zone || 'Sin datos de riesgo'
      const nextColor = data.color || '#4f7ee3'
      const elapsedMs = Math.round(performance.now() - startedAt)

      setRiskZone(nextZoneName)
      setRiskColor(nextColor)
      setStatus(`Estás en: ${nextZoneName} (${elapsedMs} ms)`)
      return
    } catch (error) {
      if (!geojsonDataRef.current) {
        setRiskZone('Sin datos de riesgo')
        setRiskColor('#4f7ee3')
        setStatus('Ubicación detectada. Cargando zonas de riesgo…')
        return
      }

      const nextZone = findRiskZoneForPoint(latitude, longitude, geojsonDataRef.current)
      setRiskZone(nextZone.name)
      setRiskColor(nextZone.color)

      setStatus(`Estás en: ${nextZone.name}`)
    }
  }

  const currentRisk = riskMeta[canonicalRiskName(riskZone)] || riskMeta['Sin datos de riesgo']

  const distanceBetweenCoordinates = (a, b) => {
    if (!a || !b) return Number.POSITIVE_INFINITY

    const toRad = (value) => (value * Math.PI) / 180
    const dLat = toRad(b[1] - a[1])
    const dLng = toRad(b[0] - a[0])
    const lat1 = toRad(a[1])
    const lat2 = toRad(b[1])

    const haversine =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2)

    const c = 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
    return 6371000 * c
  }

  useEffect(() => {
    if (!mapRef.current) return

    const map = L.map(mapRef.current, {
      zoomControl: true,
      attributionControl: true,
    }).setView(defaultCenter, 14)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    mapInstanceRef.current = map

    fetch('/riesgo_hidrico_AMGR_todas.geojson')
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        return response.json()
      })
      .then((data) => {
        geojsonDataRef.current = data

        const featureLayer = L.geoJSON(data, {
          style: (feature) => {
            const layerColor = getFeatureColor(feature)
            return {
              color: layerColor,
              weight: 1.5,
              fillColor: layerColor,
              fillOpacity: 0.42,
            }
          },
          onEachFeature: (feature, layer) => {
            const category = feature?.properties?.categoria || 'Zona sin categoría'
            layer.bindPopup(`<strong>${category}</strong>`)
          },
        })

        featureLayer.addTo(map)

        if (coords && locationReady) {
          updateRiskFromPosition(coords[1], coords[0], 0)
        }
      })
      .catch(() => {
        setStatus('No se pudieron cargar las capas de riesgo hídrico.')
      })

    const resizeMap = () => {
      setTimeout(() => map.invalidateSize(), 0)
    }

    resizeMap()
    window.addEventListener('resize', resizeMap)

    return () => {
      window.removeEventListener('resize', resizeMap)
      map.remove()
    }
  }, [])

  useEffect(() => {
    determineRiskZone()
  }, [])

  useEffect(() => {
    if (activeTab === 'map' && mapInstanceRef.current) {
      setTimeout(() => mapInstanceRef.current.invalidateSize(), 0)
    }

    if (activeTab === 'risk') {
      let ignore = false
      setRiverLoading(true)
      fetch('/api/parana', { cache: 'no-store' })
        .then((response) => {
          if (!response.ok) {
            throw new Error('No se pudo consultar la fuente del río Paraná')
          }
          return response.json()
        })
        .then((data) => {
          if (!ignore) {
            setRiverInfo(data)
          }
        })
        .catch(() => {
          if (!ignore) {
            setRiverInfo({
              error: 'No se pudo consultar la información del río Paraná en la fuente oficial.',
            })
          }
        })
        .finally(() => {
          if (!ignore) {
            setRiverLoading(false)
          }
        })

      return () => {
        ignore = true
      }
    }
  }, [activeTab])

  const determineRiskZone = () => {
    if (!navigator.geolocation) {
      setStatus('Tu dispositivo no permite geolocalización.')
      return
    }

    setStatus('Consultando ubicación y zona de riesgo…')

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords
        const nextCoords = [longitude, latitude]

        lastCoordsRef.current = nextCoords
        lastRiskUpdateRef.current = Date.now()

        setCoords(nextCoords)
        setLocationReady(true)

        await updateRiskFromPosition(latitude, longitude, accuracy)

        const map = mapInstanceRef.current
        if (!map) return

        if (markerRef.current) {
          markerRef.current.remove()
        }

        const marker = L.circleMarker([latitude, longitude], {
          radius: 12,
          color: '#0b172a',
          weight: 3,
          fillColor: '#ffffff',
          fillOpacity: 1,
        }).addTo(map)

        markerRef.current = marker
        map.flyTo([latitude, longitude], 16, {
          animate: true,
          duration: 1,
        })
      },
      () => {
        setLocationReady(false)
        setStatus('No se pudo acceder a tu ubicación. Activa el GPS y vuelve a intentarlo.')
      },
      {
        enableHighAccuracy: false,
        timeout: 20000,
        maximumAge: 30000,
      }
    )
  }

  return (
    <main className="app-shell">
      <nav className="tab-bar" aria-label="Pestañas de la app">
        <button
          type="button"
          className={activeTab === 'map' ? 'tab-button active' : 'tab-button'}
          onClick={() => setActiveTab('map')}
        >
          Mapa
        </button>
        <button
          type="button"
          className={activeTab === 'risk' ? 'tab-button active' : 'tab-button'}
          onClick={() => setActiveTab('risk')}
        >
          Riesgo
        </button>
      </nav>

      <div className={activeTab === 'map' ? 'panel visible' : 'panel hidden'}>
        <section className="status-card">
          <span className={`dot ${locationReady ? 'active' : ''}`} aria-hidden="true" />
          <p>{status}</p>
        </section>

        <div className="map-wrapper">
          <div ref={mapRef} className="map" aria-label="Mapa con ubicación del usuario" />

          <div className="map-actions">
            {locationReady && (
              <button type="button" className="locate-button secondary" onClick={centerOnLocation}>
                Centrar
              </button>
            )}
          </div>
        </div>

        {coords && (
          <section className="coords-card">
            <span>Latitud</span>
            <strong>{coords[1].toFixed(5)}</strong>
            <span>Longitud</span>
            <strong>{coords[0].toFixed(5)}</strong>
          </section>
        )}
      </div>

      <div className={activeTab === 'risk' ? 'panel visible' : 'panel hidden'}>
        <section className="risk-panel">
          <div className="risk-header">
            <p className="risk-label">Zona de riesgo hídrico</p>
            <strong>{riskZone}</strong>
          </div>

          <div className="risk-meter" aria-label="Indicador de nivel de riesgo">
            <div className="risk-meter-track">
              <div
                className="risk-meter-fill"
                style={{
                  width: `${currentRisk.severity}%`,
                  background: riskColor,
                }}
              />
            </div>
            <span className="risk-meter-label">{currentRisk.label}</span>
          </div>

          <div className="risk-legend" style={{ borderLeft: `6px solid ${riskColor}` }}>
            <p>{currentRisk.description}</p>
          </div>

          <div className="risk-details">
            <div>
              <span>Estado</span>
              <strong>{currentRisk.label}</strong>
            </div>
            <div>
              <span>Color</span>
              <strong>{riskColor}</strong>
            </div>
            <div>
              <span>Coordenadas</span>
              <strong>
                {coords ? `${coords[1].toFixed(5)}, ${coords[0].toFixed(5)}` : 'Sin ubicación'}
              </strong>
            </div>
          </div>

          <div className="river-info">
            <h3>Información del río Paraná</h3>
            {riverLoading ? (
              <p>Cargando información de la fuente oficial…</p>
            ) : riverInfo?.error ? (
              <p>{riverInfo.error}</p>
            ) : riverInfo ? (
              <>
                <p className="river-source">Fuente: {riverInfo.source}</p>
                <ul>
                  <li><strong>Estación:</strong> {riverInfo.station}</li>
                  <li><strong>Altura actual:</strong> {riverInfo.data?.altura} m</li>
                  <li><strong>Variación:</strong> {riverInfo.data?.variacion} m</li>
                  <li><strong>Estado:</strong> {riverInfo.data?.estado}</li>
                  <li><strong>Fecha:</strong> {riverInfo.data?.fecha}</li>
                  <li><strong>Cota mínima:</strong> {riverInfo.data?.cotaMin} m</li>
                  <li><strong>Cota máxima:</strong> {riverInfo.data?.cotaMax} m</li>
                </ul>
              </>
            ) : (
              <p>Sin información disponible.</p>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}

export default App

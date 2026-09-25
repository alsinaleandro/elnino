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
  const [status, setStatus] = useState('Solicitando ubicación...')
  const [coords, setCoords] = useState(null)
  const [locationReady, setLocationReady] = useState(false)
  const [activeTab, setActiveTab] = useState('map')
  const [riskZone, setRiskZone] = useState('Sin datos de riesgo')
  const [riskColor, setRiskColor] = useState('#4f7ee3')

  const centerOnLocation = () => {
    const map = mapInstanceRef.current
    if (!map || !coords) return

    map.flyTo([coords[1], coords[0]], 16, {
      animate: true,
      duration: 1,
    })
  }

  const updateRiskFromPosition = (latitude, longitude, accuracy) => {
    const nextZone = findRiskZoneForPoint(latitude, longitude, geojsonDataRef.current)
    setRiskZone(nextZone.name)
    setRiskColor(nextZone.color)

    setStatus(
      `Estás en: ${nextZone.name}. Precisión aprox. ${Math.round(accuracy)} m.`
    )
  }

  const currentRisk = riskMeta[canonicalRiskName(riskZone)] || riskMeta['Sin datos de riesgo']

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
      .then((response) => response.json())
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
    if (activeTab === 'map' && mapInstanceRef.current) {
      setTimeout(() => mapInstanceRef.current.invalidateSize(), 0)
    }
  }, [activeTab])

  useEffect(() => {
    if (!navigator.geolocation) {
      setStatus('Tu dispositivo no permite geolocalización.')
      return
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords
        const nextCoords = [longitude, latitude]

        setCoords(nextCoords)
        setLocationReady(true)

        updateRiskFromPosition(latitude, longitude, accuracy)

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
        setStatus('No se pudo acceder a tu ubicación. Activa el GPS.')
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

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

          {locationReady && (
            <button type="button" className="locate-button" onClick={centerOnLocation}>
              Centrar
            </button>
          )}
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
        </section>
      </div>
    </main>
  )
}

export default App

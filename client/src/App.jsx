import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'

const defaultCenter = [-74.08175, 4.60971]
const riskColors = {
  'Zona Prohibida': '#d93025',
  'Zona de restricción severa': '#ea4335',
  'Zona de restricción Severa temporaria': '#f39c12',
  'Zona de restricción Leve': '#34a853',
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

  let insideAnyRing = false

  for (const ring of rings) {
    if (isPointInRing(point, ring)) {
      insideAnyRing = true
      break
    }
  }

  return insideAnyRing
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

    const name = feature.properties.categoria
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
  const riskLayerRef = useRef(null)
  const geojsonDataRef = useRef(null)
  const [status, setStatus] = useState('Solicitando ubicación...')
  const [coords, setCoords] = useState(null)
  const [locationReady, setLocationReady] = useState(false)
  const [riskZone, setRiskZone] = useState('Sin datos')
  const [riskColor, setRiskColor] = useState('#4f7ee3')

  const centerOnLocation = () => {
    const map = mapInstanceRef.current
    if (!map || !coords) return

    map.flyTo([coords[1], coords[0]], 16, {
      animate: true,
      duration: 1,
    })
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

    const riskLayer = L.layerGroup().addTo(map)
    riskLayerRef.current = riskLayer
    mapInstanceRef.current = map

    fetch('/riesgo_hidrico_AMGR_todas.geojson')
      .then((response) => response.json())
      .then((data) => {
        geojsonDataRef.current = data

        const featureLayer = L.geoJSON(data, {
          style: (feature) => {
            const category = feature?.properties?.categoria
            return {
              color: riskColors[category] || '#4f7ee3',
              weight: 1.5,
              fillColor: riskColors[category] || '#4f7ee3',
              fillOpacity: 0.28,
            }
          },
          onEachFeature: (feature, layer) => {
            const category = feature?.properties?.categoria || 'Zona sin categoría'
            layer.bindPopup(`<strong>${category}</strong>`)
          },
        })

        featureLayer.addTo(riskLayer)
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

        const zone = findRiskZoneForPoint(latitude, longitude, geojsonDataRef.current)
        setRiskZone(zone.name)
        setRiskColor(zone.color)

        setStatus(
          `Estás en: ${zone.name}. Precisión aprox. ${Math.round(accuracy)} m.`
        )

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
      <header className="topbar">
        <div>
          <p className="eyebrow">Mapa en vivo</p>
          <h1>Mi ubicación</h1>
        </div>
      </header>

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

      <section className="risk-card" style={{ borderLeft: `6px solid ${riskColor}` }}>
        <p className="risk-label">Zona de riesgo hídrico</p>
        <strong>{riskZone}</strong>
      </section>
    </main>
  )
}

export default App

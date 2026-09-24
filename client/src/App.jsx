import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import './App.css'

const defaultCenter = [-74.08175, 4.60971]

function App() {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markerRef = useRef(null)
  const [status, setStatus] = useState('Solicitando ubicación...')
  const [coords, setCoords] = useState(null)
  const [locationReady, setLocationReady] = useState(false)

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

    mapInstanceRef.current = map

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
        setStatus(
          `Tu ubicación está activa. Precisión aprox. ${Math.round(accuracy)} m.`
        )

        const map = mapInstanceRef.current
        if (!map) return

        if (markerRef.current) {
          markerRef.current.remove()
        }

        const marker = L.circleMarker([latitude, longitude], {
          radius: 12,
          color: '#1f8fff',
          weight: 3,
          fillColor: '#60a5fa',
          fillOpacity: 0.45,
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
    </main>
  )
}

export default App

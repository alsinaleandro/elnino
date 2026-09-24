import { useEffect, useRef, useState } from 'react'
import Map from 'ol/Map'
import View from 'ol/View'
import TileLayer from 'ol/layer/Tile'
import XYZ from 'ol/source/XYZ'
import VectorLayer from 'ol/layer/Vector'
import VectorSource from 'ol/source/Vector'
import Feature from 'ol/Feature'
import Point from 'ol/geom/Point'
import { fromLonLat } from 'ol/proj'
import { Circle as CircleStyle, Fill, Stroke, Style } from 'ol/style'
import 'ol/ol.css'
import './App.css'

const defaultCenter = [-74.08175, 4.60971]

function App() {
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const markerLayerRef = useRef(null)
  const [status, setStatus] = useState('Solicitando ubicación...')
  const [coords, setCoords] = useState(null)
  const [locationReady, setLocationReady] = useState(false)

  const centerOnLocation = () => {
    const map = mapInstanceRef.current
    if (!map || !coords) return

    map.getView().animate({
      center: fromLonLat(coords),
      zoom: 16,
      duration: 600,
    })
  }

  useEffect(() => {
    if (!mapRef.current) return

    mapRef.current.style.width = '100%'
    mapRef.current.style.height = '420px'

    const map = new Map({
      target: mapRef.current,
      layers: [
        new TileLayer({
          source: new XYZ({
            url: 'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
            crossOrigin: 'anonymous',
            maxZoom: 19,
          }),
        }),
      ],
      view: new View({
        center: fromLonLat(defaultCenter),
        zoom: 14,
        minZoom: 2,
        maxZoom: 20,
      }),
    })

    const markerLayer = new VectorLayer({
      source: new VectorSource(),
    })

    map.addLayer(markerLayer)
    mapInstanceRef.current = map
    markerLayerRef.current = markerLayer

    const resizeMap = () => {
      requestAnimationFrame(() => map.updateSize())
    }

    resizeMap()

    const resizeObserver = new ResizeObserver(() => {
      resizeMap()
    })

    resizeObserver.observe(mapRef.current)

    return () => {
      resizeObserver.disconnect()
      map.setTarget(undefined)
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
        const markerLayer = markerLayerRef.current

        if (!map || !markerLayer) return

        const source = markerLayer.getSource()
        source.clear()

        const feature = new Feature({
          geometry: new Point(fromLonLat(nextCoords)),
        })

        feature.setStyle(
          new Style({
            image: new CircleStyle({
              radius: 12,
              fill: new Fill({ color: 'rgba(33, 150, 243, 0.28)' }),
              stroke: new Stroke({ color: '#1f8fff', width: 3 }),
            }),
          })
        )

        source.addFeature(feature)
        map.getView().animate({
          center: fromLonLat(nextCoords),
          zoom: 16,
          duration: 800,
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
          <p className="eyebrow">Mapa en vivo2</p>
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

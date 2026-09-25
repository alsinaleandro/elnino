import './globals.css'

export const metadata = {
  title: 'El Niño',
  description: 'Mapa de riesgo hídrico con datos oficiales',
}

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}

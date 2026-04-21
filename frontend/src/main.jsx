import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Register AskDB number format expression function for Vega-Lite specs.
import './chart-ir/formatting/registerVegaFormat';
import './index.css'
import './components/dashboard/presets'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

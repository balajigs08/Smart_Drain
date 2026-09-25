import React, { useEffect, useRef } from 'react'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler
)

const COLORS = {
  water:  { line: '#3b82f6', fill: 'rgba(59,130,246,0.08)' },
  flow:   { line: '#06b6d4', fill: 'rgba(6,182,212,0.08)' },
  rain:   { line: '#8b5cf6', fill: 'rgba(139,92,246,0.08)' },
  rise:   { line: '#f97316', fill: 'rgba(249,115,22,0.08)' },
  risk:   { line: '#ef4444', fill: 'rgba(239,68,68,0.08)' },
}

function buildDataset(history, key, color, label) {
  return {
    label,
    data: history.map(h => h[key] ?? null),
    borderColor: color.line,
    backgroundColor: color.fill,
    fill: true,
    tension: 0.4,
    pointRadius: 2,
    pointHoverRadius: 5,
    borderWidth: 2,
    spanGaps: true,
  }
}

const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  animation: { duration: 300 },
  plugins: {
    legend: {
      display: true,
      labels: { color: '#8ba3c7', boxWidth: 12, font: { size: 11 } },
    },
    tooltip: {
      backgroundColor: '#111927',
      borderColor: '#1e2d40',
      borderWidth: 1,
      titleColor: '#e8f0fe',
      bodyColor: '#8ba3c7',
    },
  },
  scales: {
    x: {
      ticks: { color: '#4a6080', maxTicksLimit: 8, font: { size: 10 } },
      grid:  { color: 'rgba(30,45,64,0.5)' },
    },
    y: {
      ticks: { color: '#4a6080', font: { size: 10 } },
      grid:  { color: 'rgba(30,45,64,0.5)' },
    },
  },
}

function formatTime(ts) {
  const d = new Date(ts)
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function WaterLevelChart({ history }) {
  const labels = history.map(h => formatTime(h.timestamp))
  const data = {
    labels,
    datasets: [
      buildDataset(history, 'water_level_percent', COLORS.water, 'Water Level (%)'),
    ],
  }
  const opts = {
    ...baseOptions,
    scales: {
      ...baseOptions.scales,
      y: { ...baseOptions.scales.y, min: 0, max: 100,
           ticks: { ...baseOptions.scales.y.ticks, callback: v => v + '%' } },
    },
  }
  return (
    <div className="chart-container">
      <Line data={data} options={opts} />
    </div>
  )
}

export function FlowChart({ history }) {
  const labels = history.map(h => formatTime(h.timestamp))
  const data = {
    labels,
    datasets: [
      buildDataset(history, 'flow_rate_lpm', COLORS.flow, 'Flow Rate (L/min)'),
    ],
  }
  const opts = {
    ...baseOptions,
    scales: {
      ...baseOptions.scales,
      y: { ...baseOptions.scales.y, min: 0,
           ticks: { ...baseOptions.scales.y.ticks, callback: v => v + ' L/m' } },
    },
  }
  return (
    <div className="chart-container">
      <Line data={data} options={opts} />
    </div>
  )
}

export function MultiChart({ history }) {
  const labels = history.map(h => formatTime(h.timestamp))
  const data = {
    labels,
    datasets: [
      buildDataset(history, 'water_level_percent', COLORS.water, 'Level %'),
      buildDataset(history, 'risk_score',          COLORS.risk,  'Risk Score'),
    ],
  }
  const opts = {
    ...baseOptions,
    scales: {
      ...baseOptions.scales,
      y: { ...baseOptions.scales.y, min: 0, max: 100 },
    },
  }
  return (
    <div className="chart-container">
      <Line data={data} options={opts} />
    </div>
  )
}

export function RiseRateChart({ history }) {
  const labels = history.map(h => formatTime(h.timestamp))
  const data = {
    labels,
    datasets: [
      buildDataset(history, 'water_rise_rate_cm_min', COLORS.rise, 'Rise Rate (cm/min)'),
    ],
  }
  return (
    <div className="chart-container">
      <Line data={data} options={baseOptions} />
    </div>
  )
}

import React, { useEffect, useRef, useState } from 'react';
import './App.css';

const data = {
  points: [
    { x: -100, y: 300, z: 100 },
    { x: 0, y: 300, z: 300 },
    { x: 100, y: 300, z: 150 },
    { x: -150, y: 450, z: 100 },
    { x: 50, y: 450, z: 300 },
    { x: 125, y: 450, z: 150 },

  ],
  triangles: [
    { a: 0, b: 1, c: 2, color: { r: 255, g: 0, b: 0 } },
    { a: 3, b: 4, c: 5, color: { r: 255, g: 127, b: 0 } }
  ]
}

const pov = { x: 0, y: -200, z: 0 }

interface Point2D {
  x: number,
  y: number
}

const distance2D = (a: Point2D, b: Point2D) => {
  return Math.sqrt(Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2))
}

interface Point3D {
  x: number,
  y: number,
  z: number,
}

class Line {
  m: number
  q: number
  zero: number

  constructor(a: Point2D, b: Point2D) {
    if (a.x === b.x) {
      this.m = Number.POSITIVE_INFINITY
      this.q = 0
      this.zero = a.x
    } else {
      this.m = (a.y - b.y) / (a.x - b.x)
      this.q = a.y - (this.m * a.x)
      this.zero = -this.q / this.m
    }
  }

  relation(point: Point2D) {
    const proj = point.x * this.m + this.q
    if (proj <= point.y) {
      return "over"
    } else {
      return "under"
    }
  }
}


function App() {
  const canvasRef = useRef(null)
  const [affine, setAffine] = useState({ translation: { x: 0, y: 0, z: 0 }, rotation: { xy: 0, yz: 0 } })

  const move = (vec: Point3D) => {
    setAffine((affine) => ({
      ...affine,
      translation: {
        x: affine.translation.x + vec?.x,
        y: affine.translation.y + vec?.y,
        z: affine.translation.z + vec?.z
      }
    }))
  }

  const rotate = ({ xy, yz }: { xy: number, yz: number }) => {
    setAffine((affine) => ({
      ...affine,
      rotation: {
        xy: affine.rotation.xy + xy,
        yz: affine.rotation.yz + yz
      }
    }))
  }

  useEffect(() => {
    const canvas: HTMLCanvasElement = canvasRef.current
    const context = canvas.getContext('2d')
    const [width, height] = [context.canvas.width, context.canvas.height]

    const translation = affine.translation
    const rotation = affine.rotation
    const screenSpacePoints = data.points
      .map(point => ({
        x: point.x * Math.cos(rotation.xy) - point.y * Math.sin(rotation.xy),
        y: point.x * Math.sin(rotation.xy) + point.y * Math.cos(rotation.xy),
        z: point.z
      }))
      .map(point => ({
        x: point.x,
        y: point.y * Math.cos(rotation.yz) - point.z * Math.sin(rotation.yz),
        z: point.y * Math.sin(rotation.yz) + point.z * Math.cos(rotation.yz)
      }))
      .map(point => ({
        x: point.x + translation.x,
        y: point.y + translation.y,
        z: point.z + translation.z
      }))
      .map(point => ({
        x: new Line({ x: point.x, y: point.y }, { x: pov.x, y: pov.y }).zero,
        y: new Line({ x: point.z, y: point.y }, { x: pov.z, y: pov.y }).zero,
        depth: Math.sqrt(Math.pow(point.x - pov.x, 2) + Math.pow(point.y - pov.y, 2) + Math.pow(point.z - pov.z, 2))
      }))

    const processedTris = data.triangles.map(triangle => {
      const points = [screenSpacePoints[triangle.a], screenSpacePoints[triangle.b], screenSpacePoints[triangle.c]]
      let highestIndex = 0
      for (let index = 1; index < 3; index++) {
        if (points[index].y > points[highestIndex].y) {
          highestIndex = index
        }
      }
      const highest = points[highestIndex]
      points.splice(highestIndex, 1)

      const overLines = points.map(point => new Line({ x: highest.x, y: highest.y }, { x: point.x, y: point.y }))
      const underLine = new Line({ x: points[0].x, y: points[0].y }, { x: points[1].x, y: points[1].y })

      const calculateDepth = (g: Point2D) => {
        const linePerpToUnder = new Line({ x: highest.x, y: highest.y }, g)
        const x = (underLine.q - linePerpToUnder.q) / (linePerpToUnder.m - underLine.m)
        const y = linePerpToUnder.m * x + linePerpToUnder.q

        const p = { x, y }
        const [a, b] = points
        const preBeta = distance2D(p, a) / distance2D(b, a)
        const preAlfa = 1 - preBeta

        const h = highest
        const gamma = distance2D(g, p) / distance2D(h, p)

        const alfa = preAlfa * (1 - gamma)
        const beta = preBeta * (1 - gamma)
        return h.depth * gamma + a.depth * alfa + b.depth * beta

      }

      return { overLines, underLine, color: triangle.color, calculateDepth }
    })


    const imageData = context.createImageData(width, height);

    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {

        const pixelIndex = (y * width + x) * 4
        let minDepth = Number.POSITIVE_INFINITY
        const point = { x, y }

        processedTris.forEach(triangle => {
          if (triangle.overLines[0].relation(point) === "under" &&
            triangle.overLines[1].relation(point) === "under" &&
            triangle.underLine.relation(point) === "over") {

            let depth = triangle.calculateDepth(point)
            if (depth < minDepth) {
              minDepth = depth
              imageData.data[pixelIndex] = triangle.color.r      //r
              imageData.data[pixelIndex + 1] = triangle.color.g  //g
              imageData.data[pixelIndex + 2] = triangle.color.b  //b
              imageData.data[pixelIndex + 3] = 255  //a
            }
          }
        })
      }

    }

    context.putImageData(imageData, 0, 0)

  }, [affine])

  return <div>
    <canvas ref={canvasRef} />
    <button onClick={() => move({ x: 0, y: 0, z: 10 })}>Su</button>
    <button onClick={() => move({ x: 0, y: 0, z: -10 })}>Giu</button>
    <button onClick={() => move({ x: -10, y: 0, z: 0 })}>Sinistra</button>
    <button onClick={() => move({ x: 10, y: 0, z: 0 })}>Destra</button>

    <button onClick={() => rotate({ xy: .1, yz: 0 })}>Ruota +xy</button>
    <button onClick={() => rotate({ xy: -.1, yz: 0 })}>Ruota -xy</button>

    <button onClick={() => rotate({ xy: 0, yz: .1 })}>Ruota +yz</button>
    <button onClick={() => rotate({ xy: 0, yz: -.1 })}>Ruota -yz</button>
  </div>
}

export default App;

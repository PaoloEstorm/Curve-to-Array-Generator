import React, { useState, useMemo, useRef } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Copy, Check } from 'lucide-react';

export default function CurveGenerator() {
  const [minValue, setMinValue] = useState(0);
  const [maxValue, setMaxValue] = useState(255);
  const [numPoints, setNumPoints] = useState(128);
  const [curvature, setCurvature] = useState(1);
  const [curveType, setCurveType] = useState('exponential');
  const [invertLeft, setInvertLeft] = useState(false);
  const [curvatureRight, setCurvatureRight] = useState(1);
  const [curveTypeRight, setCurveTypeRight] = useState('exponential');
  const [invertRight, setInvertRight] = useState(false);
  const [arrayName, setArrayName] = useState('curve');
  const [addConst, setAddConst] = useState(true);
  const [addProgmem, setAddProgmem] = useState(false);
  const [copied, setCopied] = useState(false);
  const [useMidpoint, setUseMidpoint] = useState(false);
  const [midpointX, setMidpointX] = useState(0.5);
  const [midpointY, setMidpointY] = useState(0.5);
  const [isDragging, setIsDragging] = useState(false);
  const chartRef = useRef(null);

  // Determine optimal data type
  const getDataType = (min, max) => {
    if (min >= 0 && max <= 255) return 'uint8_t';
    if (min >= -128 && max <= 127) return 'int8_t';
    if (min >= 0 && max <= 65535) return 'uint16_t';
    return 'int16_t';
  };

  const dataType = getDataType(minValue, maxValue);

  // Interpolation function for custom midpoint with curvature
  const interpolateWithMidpoint = (t, midX, midY, curveLeft, curvatureLeft, curveRight, curvatureRight, invertL, invertR) => {
    // Helper function to apply curve with optional inversion
    const applyCurve = (localT, type, curve, invert) => {
      // If inverted, flip the input t but keep output range
      const inputT = invert ? (1 - localT) : localT;
      let result;
      
      switch(type) {
        case 'parabolic':
          result = Math.pow(inputT, 2 * curve);
          break;
        case 'exponential':
          result = Math.pow(inputT, curve);
          break;
        case 'doubleExponential':
          result = Math.pow(Math.pow(inputT, curve), curve);
          break;
        case 'sigmoid':
          const k = curve * 2;
          const sigmoid = 1 / (1 + Math.exp(-k * (inputT - 0.5)));
          result = (sigmoid - 1 / (1 + Math.exp(k * 0.5))) / 
                   (1 / (1 + Math.exp(-k * 0.5)) - 1 / (1 + Math.exp(k * 0.5)));
          break;
        default:
          result = inputT;
      }
      
      // If inverted, flip the output to maintain correct direction
      if (invert) {
        result = 1 - result;
      }
      
      return result;
    };
    
    if (t <= midX) {
      // First segment: 0 to midpoint
      const localT = t / midX;
      const curvedT = applyCurve(localT, curveLeft, curvatureLeft, invertL);
      return curvedT * midY;
    } else {
      // Second segment: midpoint to 1
      const localT = (t - midX) / (1 - midX);
      const curvedT = applyCurve(localT, curveRight, curvatureRight, invertR);
      return midY + curvedT * (1 - midY);
    }
  };

  // Generate curve points
  const curveData = useMemo(() => {
    const points = [];
    const range = maxValue - minValue;
    
    for (let i = 0; i < numPoints; i++) {
      const t = i / (numPoints - 1); // Normalized 0-1
      let normalizedValue;
      
      if (useMidpoint) {
        // Custom curve with midpoint and separate curvatures
        normalizedValue = interpolateWithMidpoint(t, midpointX, midpointY, curveType, curvature, curveTypeRight, curvatureRight, invertLeft, invertRight);
      } else {
        // Standard curve types
        const inputT = invertLeft ? (1 - t) : t;
        let result;
        
        switch(curveType) {
          case 'parabolic':
            result = Math.pow(inputT, 2 * curvature);
            break;
          case 'exponential':
            if (curvature === 1) {
              result = inputT;
            } else if (curvature > 1) {
              result = Math.pow(inputT, curvature);
            } else {
              result = Math.pow(inputT, 1 / (2 - curvature));
            }
            break;
          case 'doubleExponential':
            result = Math.pow(Math.pow(inputT, curvature), curvature);
            break;
          case 'sigmoid':
            const k = curvature * 2;
            result = 1 / (1 + Math.exp(-k * (inputT - 0.5)));
            result = (result - 1 / (1 + Math.exp(k * 0.5))) / 
                     (1 / (1 + Math.exp(-k * 0.5)) - 1 / (1 + Math.exp(k * 0.5)));
            break;
          default:
            result = inputT;
        }
        
        // If inverted, flip the output to maintain correct direction
        normalizedValue = invertLeft ? (1 - result) : result;
      }
      
      const value = minValue + range * normalizedValue;
      
      points.push({
        x: i,
        y: Math.round(value)
      });
    }
    
    return points;
  }, [minValue, maxValue, numPoints, curvature, curveType, useMidpoint, midpointX, midpointY, curvatureRight, curveTypeRight, invertLeft, invertRight]);

  // Generate C/C++ code
  const generateCode = () => {
    const values = curveData.map(p => p.y);
    let code = '';
    
    if (addConst) code += 'const ';
    code += `${dataType} ${arrayName}[${numPoints}]`;
    if (addProgmem) code += ' PROGMEM';
    code += ' = {\n  ';
    
    // Format with 12 values per line
    const valuesPerLine = 12;
    for (let i = 0; i < values.length; i++) {
      code += values[i];
      if (i < values.length - 1) {
        code += ', ';
        if ((i + 1) % valuesPerLine === 0) {
          code += '\n  ';
        }
      }
    }
    
    code += '\n};';
    return code;
  };

  const code = generateCode();

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Copy error:', err);
    }
  };

  // Custom dot component for draggable midpoint
  const CustomDot = (props) => {
    const { cx, cy, index } = props;
    const midIndex = Math.round((numPoints - 1) * midpointX);
    
    if (!useMidpoint || index !== midIndex) return null;

    return (
      <g>
        {/* Cerchio visibile con trasparenza */}
        <circle
          cx={cx}
          cy={cy}
          r={12}
          fill="#1E3A8A"
          fillOpacity={0.75}
          stroke="#3B82F6"
          strokeWidth={2}
          pointerEvents="none"
        />
        {/* Cerchio invisibile più grande per catturare gli eventi del mouse */}
        <circle
          cx={cx}
          cy={cy}
          r={20}
          fill="transparent"
          style={{ cursor: 'grab' }}
          onMouseDown={(e) => {
            e.stopPropagation();
            setIsDragging(true);
          }}
        />
      </g>
    );
  };

  // Handle mouse move for dragging
  const handleChartMouseMove = (e) => {
    if (!isDragging || !chartRef.current) return;

    const chartElement = chartRef.current.container;
    const rect = chartElement.getBoundingClientRect();
    
    // Calculate relative position
    const x = (e.clientX - rect.left) / rect.width;
    const y = 1 - (e.clientY - rect.top) / rect.height;
    
    // Clamp values
    const clampedX = Math.max(0.1, Math.min(0.9, x));
    const clampedY = Math.max(0, Math.min(1, y));
    
    setMidpointX(clampedX);
    setMidpointY(clampedY);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Get curve type label
  const getCurveTypeLabel = () => {
    if (curvature < 1) return 'gentle';
    if (curvature > 1) return 'steep';
    return 'linear';
  };

  return (
    <div 
      className="min-h-screen bg-gray-900 text-gray-100"
      onMouseMove={handleChartMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-8">Curve to Array Generator</h1>
        
        {/* Layout a due colonne */}
        <div className="flex gap-6">
          {/* Colonna sinistra: Controlli */}
          <div className="w-96 flex-shrink-0">
            <div className="bg-gray-800 rounded-lg p-6 space-y-6 sticky top-6">
              <h2 className="text-xl font-semibold mb-4">Controls</h2>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Min Value</label>
                  <input
                    type="number"
                    value={minValue}
                    onChange={(e) => setMinValue(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Max Value</label>
                  <input
                    type="number"
                    value={maxValue}
                    onChange={(e) => setMaxValue(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Number of Points</label>
                <input
                  type="number"
                  value={numPoints}
                  onChange={(e) => setNumPoints(Math.max(2, Number(e.target.value)))}
                  className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  {useMidpoint ? 'Curve Type 1' : 'Curve Type'}
                </label>
                <select
                  value={curveType}
                  onChange={(e) => setCurveType(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                >
                  <option value="parabolic">Parabolic</option>
                  <option value="exponential">Exponential</option>
                  <option value="doubleExponential">Double Exponential</option>
                  <option value="sigmoid">Sigmoid</option>
                </select>
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={invertLeft}
                    onChange={(e) => setInvertLeft(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Flip Curve</span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  {useMidpoint ? 'Curve 1: ' : 'Curvature: '}{curvature.toFixed(2)} 
                  <span className="ml-2 text-gray-400 text-xs">
                    ({getCurveTypeLabel()})
                  </span>
                </label>
                <input
                  type="range"
                  min="0.1"
                  max="5"
                  step="0.1"
                  value={curvature}
                  onChange={(e) => setCurvature(Number(e.target.value))}
                  className="w-full"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useMidpoint}
                    onChange={(e) => setUseMidpoint(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">Custom Midpoint</span>
                </label>
              </div>

              {useMidpoint && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-2">Curve Type 2</label>
                    <select
                      value={curveTypeRight}
                      onChange={(e) => setCurveTypeRight(e.target.value)}
                      className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                    >
                      <option value="parabolic">Parabolic</option>
                      <option value="exponential">Exponential</option>
                      <option value="doubleExponential">Double Exponential</option>
                      <option value="sigmoid">Sigmoid</option>
                    </select>
                  </div>

                  <div>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={invertRight}
                        onChange={(e) => setInvertRight(e.target.checked)}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">Flip Curve</span>
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">
                      Curve 2: {curvatureRight.toFixed(2)}
                    </label>
                    <input
                      type="range"
                      min="0.1"
                      max="5"
                      step="0.1"
                      value={curvatureRight}
                      onChange={(e) => setCurvatureRight(Number(e.target.value))}
                      className="w-full"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium mb-2">Array Name</label>
                <input
                  type="text"
                  value={arrayName}
                  onChange={(e) => setArrayName(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
                />
              </div>

              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addConst}
                    onChange={(e) => setAddConst(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span>const</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addProgmem}
                    onChange={(e) => {
                      setAddProgmem(e.target.checked);
                      if (e.target.checked) setAddConst(true);
                    }}
                    className="w-4 h-4"
                  />
                  <span>PROGMEM</span>
                </label>
              </div>

              <div className="text-sm text-gray-400">
                Data type: <span className="text-blue-400 font-mono">{dataType}</span>
              </div>
            </div>
          </div>

          {/* Colonna destra: Grafico e Output Array */}
          <div className="flex-1 space-y-6">
            {/* Chart */}
            <div className="bg-gray-800 rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Chart</h2>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={curveData} ref={chartRef}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis 
                    dataKey="x" 
                    stroke="#9CA3AF"
                    label={{ value: 'Index', position: 'insideBottom', offset: -5, fill: '#9CA3AF' }}
                  />
                  <YAxis 
                    stroke="#9CA3AF"
                    domain={[minValue, maxValue]}
                    label={{ value: 'Value', angle: -90, position: 'insideLeft', fill: '#9CA3AF' }}
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1F2937', border: '1px solid #374151' }}
                    labelStyle={{ color: '#9CA3AF' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="y" 
                    stroke="#3B82F6" 
                    strokeWidth={2}
                    dot={<CustomDot />}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Generated code */}
            <div className="bg-gray-800 rounded-lg p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">C/C++ Array</h2>
                <button
                  onClick={copyToClipboard}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                >
                  {copied ? (
                    <>
                      <Check size={18} />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy size={18} />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <pre className="bg-gray-900 p-4 rounded border border-gray-700 overflow-x-auto">
                <code className="text-sm text-green-400">{code}</code>
              </pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

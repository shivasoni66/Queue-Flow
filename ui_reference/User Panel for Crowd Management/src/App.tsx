import { useState, useEffect, useRef } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell, PieChart, Pie, Legend,
} from 'recharts'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Particle { x: number; y: number; vx: number; vy: number; tx: number; ty: number; r: number; hue: number }
interface QueueConfig { ticket: string; counter: string; service: string; position: number; total: number }

// ─── Canvas crowd animation ───────────────────────────────────────────────────

function CrowdCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<{ phase: 'before' | 'transition-in' | 'after' | 'transition-out'; t: number }>({ phase: 'before', t: 0 })
  const particlesRef = useRef<Particle[]>([])

  useEffect(() => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!
    const W = canvas.width, H = canvas.height, N = 72
    const cols = 9, rowCount = Math.ceil(N / cols)
    const xPad = W * 0.08, xStep = (W - xPad * 2) / (cols - 1)
    const yStart = H * 0.35, yStep = (H * 0.55) / (rowCount - 1)

    particlesRef.current = Array.from({ length: N }, (_, i) => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - 0.5) * 2.4, vy: (Math.random() - 0.5) * 2.4,
      tx: xPad + (i % cols) * xStep, ty: yStart + Math.floor(i / cols) * yStep,
      r: Math.random() * 2.2 + 1.6, hue: Math.random() * 40,
    }))

    const PHASE_DURATION = { before: 220, 'transition-in': 100, after: 220, 'transition-out': 100 }
    const ease = (t: number) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
    const lerp = (a: number, b: number, t: number) => a + (b - a) * t
    let animId: number

    function tick() {
      const s = stateRef.current; s.t++
      const dur = PHASE_DURATION[s.phase], progress = Math.min(s.t / dur, 1)
      if (s.t >= dur) {
        s.t = 0
        const order: typeof s.phase[] = ['before', 'transition-in', 'after', 'transition-out']
        s.phase = order[(order.indexOf(s.phase) + 1) % 4]
      }
      ctx.fillStyle = 'rgba(7,11,9,0.18)'; ctx.fillRect(0, 0, W, H)
      const isAfter = s.phase === 'after', isTransIn = s.phase === 'transition-in', isTransOut = s.phase === 'transition-out'
      let org = isAfter ? 1 : isTransIn ? ease(progress) : isTransOut ? 1 - ease(progress) : 0

      particlesRef.current.forEach(p => {
        const chaos = 1 - org
        p.x += p.vx * chaos * 0.9; p.y += p.vy * chaos * 0.9
        if (p.x < 0 || p.x > W) p.vx *= -1; if (p.y < 0 || p.y > H) p.vy *= -1
        if (org > 0.01) { p.x = lerp(p.x, p.tx, org * 0.12); p.y = lerp(p.y, p.ty, org * 0.12) }
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(${Math.round(lerp(255,0,org))},${Math.round(lerp(80+p.hue*1.5,255,org))},${Math.round(lerp(60,135,org))},${0.55+org*0.3})`
        ctx.fill()
        if (org > 0.4) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r+3, 0, Math.PI*2); ctx.strokeStyle=`rgba(0,255,135,${(org-0.4)*0.25})`; ctx.lineWidth=0.8; ctx.stroke() }
        if (org > 0.7) particlesRef.current.forEach(q => { const d=Math.hypot(p.x-q.x,p.y-q.y); if(d<40&&d>0){ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.strokeStyle=`rgba(0,255,135,${(org-0.7)*0.18})`;ctx.lineWidth=0.4;ctx.stroke()} })
      })

      const la = isTransIn||isTransOut ? (isTransIn?1-progress:progress) : 1
      if (s.phase==='before'||isTransOut) { ctx.textAlign='center'; ctx.font='700 15px Outfit,sans-serif'; ctx.fillStyle=`rgba(255,90,90,${la})`; ctx.fillText('BEFORE QUEUEMASTER',W/2,28); ctx.font='400 11px Outfit,sans-serif'; ctx.fillStyle=`rgba(255,150,150,${la*0.65})`; ctx.fillText('Chaos. Confusion. Frustration.',W/2,46) }
      if (s.phase==='after'||isTransIn) { const a2=isTransIn?progress:1; ctx.textAlign='center'; ctx.font='700 15px Outfit,sans-serif'; ctx.fillStyle=`rgba(0,255,135,${a2})`; ctx.fillText('AFTER QUEUEMASTER',W/2,28); ctx.font='400 11px Outfit,sans-serif'; ctx.fillStyle=`rgba(100,255,180,${a2*0.65})`; ctx.fillText('Order. Clarity. Peace of mind.',W/2,46) }
      animId = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(animId)
  }, [])

  return <canvas ref={canvasRef} width={390} height={280} className="w-full h-full block" />
}

// ─── Shared micro-components ──────────────────────────────────────────────────

function PulsingDot({ color = '#00ff87' }: { color?: string }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60" style={{ backgroundColor: color }} />
      <span className="relative inline-flex rounded-full h-2.5 w-2.5" style={{ backgroundColor: color }} />
    </span>
  )
}

function QueueProgressBar({ total, position }: { total: number; position: number }) {
  const pct = ((total - position) / total) * 100
  return (
    <div className="w-full">
      <div className="flex justify-between text-[10px] mb-1.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
        <span className="mono">QUEUE START</span><span className="mono">YOUR TURN</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
        <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#00ff87,#00d4ff)', boxShadow: '0 0 10px rgba(0,255,135,0.5)' }} />
      </div>
      <div className="flex mt-1.5">
        {Array.from({ length: Math.min(total, 30) }).map((_, i) => {
          const done = i < Math.floor((total - position) / total * 30)
          const current = i === Math.floor((total - position) / total * 30)
          return <div key={i} className="flex-1 h-0.5 mx-px rounded-full transition-all duration-500" style={{ background: done ? '#00ff87' : current ? 'rgba(0,255,135,0.4)' : 'rgba(255,255,255,0.06)' }} />
        })}
      </div>
    </div>
  )
}

function Avatar({ initials, index }: { initials: string; index: number }) {
  const colors = ['#6366f1','#ec4899','#f97316','#06b6d4','#8b5cf6','#10b981']
  return (
    <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold text-white border-2"
      style={{ background: colors[index%colors.length], borderColor: '#070b09', marginLeft: index>0?'-8px':'0', zIndex: 10-index, position: 'relative' }}>
      {initials}
    </div>
  )
}

// ─── Edit drawer ──────────────────────────────────────────────────────────────

function EditField({ label, value, onChange, mono, type='text', min, max }: { label:string; value:string|number; onChange:(v:string)=>void; mono?:boolean; type?:'text'|'number'; min?:number; max?:number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="mono text-[10px] tracking-widest" style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</label>
      <input type={type} value={value} min={min} max={max} onChange={e=>onChange(e.target.value)}
        className={`w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all ${mono?'mono':''}`}
        style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.12)', color:'#fff', caretColor:'#00ff87' }}
        onFocus={e=>(e.currentTarget.style.borderColor='rgba(0,255,135,0.5)')}
        onBlur={e=>(e.currentTarget.style.borderColor='rgba(255,255,255,0.12)')} />
    </div>
  )
}

function EditDrawer({ open, config, onClose, onChange }: { open:boolean; config:QueueConfig; onClose:()=>void; onChange:(c:QueueConfig)=>void }) {
  const set = (key: keyof QueueConfig) => (v: string) => {
    const num = key==='position'||key==='total'
    onChange({ ...config, [key]: num ? Math.max(1, Number(v)||1) : v })
  }
  return (
    <>
      <div className="absolute inset-0 z-40 transition-opacity duration-300" style={{ background:'rgba(0,0,0,0.6)', opacity:open?1:0, pointerEvents:open?'auto':'none', backdropFilter:'blur(4px)' }} onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 z-50 rounded-t-3xl transition-transform duration-300" style={{ background:'#0f1712', border:'1px solid rgba(255,255,255,0.08)', transform:open?'translateY(0)':'translateY(100%)' }}>
        <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full" style={{ background:'rgba(255,255,255,0.15)' }} /></div>
        <div className="px-5 pb-2 pt-3 flex items-center justify-between">
          <h2 className="font-700 text-base" style={{ color:'#fff' }}>Edit Queue Details</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background:'rgba(255,255,255,0.08)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-4 overflow-y-auto" style={{ maxHeight:'55vh' }}>
          <EditField label="TICKET NUMBER" value={config.ticket} onChange={set('ticket')} mono />
          <EditField label="COUNTER / DESK" value={config.counter} onChange={set('counter')} />
          <EditField label="SERVICE TYPE" value={config.service} onChange={set('service')} />
          <div className="grid grid-cols-2 gap-3">
            <EditField label="YOUR POSITION" value={config.position} onChange={set('position')} type="number" min={1} max={config.total} />
            <EditField label="TOTAL IN QUEUE" value={config.total} onChange={set('total')} type="number" min={1} />
          </div>
        </div>
        <div className="px-5 pt-2 pb-8">
          <button onClick={onClose} className="w-full py-3.5 rounded-2xl font-600 text-sm transition-all active:scale-[0.98]" style={{ background:'linear-gradient(135deg,#00ff87,#00d4ff)', color:'#070b09' }}>Apply Changes</button>
        </div>
      </div>
    </>
  )
}

// ─── Join Queue Flow ──────────────────────────────────────────────────────────

const SERVICE_CENTERS = [
  { id: 'bank',    label: 'Bank',             icon: '🏦', color: '#6366f1' },
  { id: 'hospital',label: 'Hospital',         icon: '🏥', color: '#ef4444' },
  { id: 'govt',    label: 'Govt. Office',     icon: '🏛️',  color: '#f59e0b' },
  { id: 'railway', label: 'Railway Counter',  icon: '🚉', color: '#06b6d4' },
  { id: 'support', label: 'Customer Support', icon: '🎧', color: '#8b5cf6' },
]

const SERVICES: Record<string, string[]> = {
  bank:    ['Account Opening', 'Cash Deposit', 'Loan Enquiry', 'Cheque Collection', 'Forex'],
  hospital:['General OPD', 'Lab Reports', 'Pharmacy', 'Specialist Consult', 'Billing'],
  govt:    ['License Renewal', 'Certificate', 'Tax Payment', 'Property Records', 'Permits'],
  railway: ['Ticket Booking', 'Cancellation', 'PNR Enquiry', 'Season Pass', 'Refunds'],
  support: ['New Complaint', 'Follow-up', 'Billing Issue', 'Returns', 'Technical Help'],
}

const BUSY_HOURS = [
  { h: '9AM', load: 40 }, { h: '10AM', load: 85 }, { h: '11AM', load: 92 },
  { h: '12PM', load: 55 }, { h: '1PM', load: 30 }, { h: '2PM', load: 48 },
  { h: '3PM', load: 78 }, { h: '4PM', load: 88 }, { h: '5PM', load: 60 },
]

function JoinQueueFlow({ onJoined }: { onJoined: () => void }) {
  const [step, setStep] = useState<1|2|3>(1)
  const [center, setCenter] = useState('')
  const [service, setService] = useState('')
  const [smsOpt, setSmsOpt] = useState(false)

  const currentHour = new Date().getHours()
  const hourLabel = currentHour < 12 ? `${currentHour}AM` : currentHour === 12 ? '12PM' : `${currentHour-12}PM`
  const busynow = BUSY_HOURS.find(b => b.h === hourLabel)?.load ?? 65
  const busyColor = busynow > 75 ? '#ef4444' : busynow > 50 ? '#f59e0b' : '#00ff87'
  const busyLabel = busynow > 75 ? 'High' : busynow > 50 ? 'Moderate' : 'Low'

  return (
    <div className="flex-1 overflow-y-auto px-5 pb-10 pt-4">
      {/* Step pills */}
      <div className="flex items-center gap-2 mb-6">
        {[1,2,3].map(s => (
          <div key={s} className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-700 transition-all"
              style={{ background: step>=s ? '#00ff87' : 'rgba(255,255,255,0.08)', color: step>=s ? '#070b09' : 'rgba(255,255,255,0.3)' }}>
              {step>s ? '✓' : s}
            </div>
            {s < 3 && <div className="flex-1 h-px w-8" style={{ background: step>s ? '#00ff87' : 'rgba(255,255,255,0.1)' }} />}
          </div>
        ))}
        <span className="ml-2 text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
          {step===1?'Select Center':step===2?'Select Service':'Confirm'}
        </span>
      </div>

      {step === 1 && (
        <>
          <h2 className="font-700 text-lg mb-1" style={{ color: '#fff' }}>Where are you headed?</h2>
          <p className="text-[12px] mb-5" style={{ color: 'rgba(255,255,255,0.4)' }}>Select your service center to join the virtual queue</p>

          {/* Current footfall IoT badge */}
          <div className="flex items-center gap-3 rounded-2xl px-4 py-3 mb-5"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(0,212,255,0.1)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
            </div>
            <div className="flex-1">
              <p className="text-[11px] font-600" style={{ color: '#00d4ff' }}>IoT Live Footfall</p>
              <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                <span className="font-700" style={{ color: '#fff' }}>247</span> people currently across all centers
              </p>
            </div>
            <PulsingDot color="#00d4ff" />
          </div>

          <div className="grid grid-cols-1 gap-2.5 mb-6">
            {SERVICE_CENTERS.map(sc => (
              <button key={sc.id} onClick={() => { setCenter(sc.id); setStep(2) }}
                className="flex items-center gap-4 rounded-2xl px-4 py-3.5 text-left transition-all active:scale-[0.98]"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0" style={{ background: `${sc.color}18` }}>
                  {sc.icon}
                </div>
                <div className="flex-1">
                  <p className="font-600 text-sm" style={{ color: '#fff' }}>{sc.label}</p>
                  <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Avg wait: {10+Math.round(Math.random()*15)} min today</p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            ))}
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <button onClick={() => setStep(1)} className="flex items-center gap-1.5 mb-4 transition-opacity hover:opacity-70">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.4)' }}>Back</span>
          </button>
          <h2 className="font-700 text-lg mb-1" style={{ color: '#fff' }}>Select Service</h2>
          <p className="text-[12px] mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {SERVICE_CENTERS.find(s=>s.id===center)?.label} · Choose what you need
          </p>

          {/* Busy-hour prediction */}
          <div className="rounded-2xl p-4 mb-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-[11px] font-600 tracking-wider" style={{ color: 'rgba(255,255,255,0.4)' }}>PREDICTED FOOTFALL TODAY</p>
              <span className="mono text-[10px] px-2 py-0.5 rounded-md" style={{ background: `${busyColor}18`, color: busyColor }}>{busyLabel} now</span>
            </div>
            <div className="flex items-end gap-1 h-12">
              {BUSY_HOURS.map(b => {
                const isNow = b.h === hourLabel
                const c = b.load > 75 ? '#ef4444' : b.load > 50 ? '#f59e0b' : '#00ff87'
                return (
                  <div key={b.h} className="flex-1 flex flex-col items-center gap-1">
                    <div className="w-full rounded-sm transition-all" style={{ height: `${b.load * 0.44}px`, background: isNow ? c : `${c}50`, border: isNow ? `1px solid ${c}` : 'none' }} />
                    <span className="mono text-[8px]" style={{ color: isNow ? '#fff' : 'rgba(255,255,255,0.25)', fontSize: 7 }}>{b.h.replace('M','')}</span>
                  </div>
                )
              })}
            </div>
            <p className="text-[11px] mt-2" style={{ color: 'rgba(255,255,255,0.35)' }}>
              💡 Best time to visit: <span style={{ color: '#00ff87' }}>1 PM – 2 PM</span> (Low footfall predicted)
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            {(SERVICES[center] || []).map(svc => (
              <button key={svc} onClick={() => { setService(svc); setStep(3) }}
                className="flex items-center justify-between rounded-2xl px-4 py-3.5 text-left transition-all active:scale-[0.98]"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <span className="text-sm font-500" style={{ color: '#fff' }}>{svc}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
              </button>
            ))}
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <button onClick={() => setStep(2)} className="flex items-center gap-1.5 mb-4">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
            <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.4)' }}>Back</span>
          </button>
          <h2 className="font-700 text-lg mb-1" style={{ color: '#fff' }}>Confirm & Get Token</h2>
          <p className="text-[12px] mb-5" style={{ color: 'rgba(255,255,255,0.4)' }}>Review your details before joining the virtual queue</p>

          <div className="rounded-2xl p-4 mb-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {[
              { label: 'CENTER', value: SERVICE_CENTERS.find(s=>s.id===center)?.label ?? '' },
              { label: 'SERVICE', value: service },
              { label: 'EST. WAIT', value: `${12 + Math.round(busynow / 10)} min` },
              { label: 'QUEUE LENGTH', value: '14 ahead of you' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-2.5" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <span className="mono text-[10px] tracking-widest" style={{ color: 'rgba(255,255,255,0.35)' }}>{label}</span>
                <span className="text-sm font-600" style={{ color: '#fff' }}>{value}</span>
              </div>
            ))}
          </div>

          {/* Notification preferences */}
          <div className="rounded-2xl p-4 mb-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <p className="text-[11px] font-600 tracking-widest mb-3" style={{ color: 'rgba(255,255,255,0.35)' }}>NOTIFY ME VIA</p>
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: 'rgba(0,255,135,0.1)' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#00ff87" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                  </div>
                  <div>
                    <p className="text-[12px] font-600" style={{ color: '#fff' }}>App Notification</p>
                    <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>When your turn is near</p>
                  </div>
                </div>
                <div className="w-9 h-5 rounded-full flex items-center px-0.5" style={{ background: '#00ff87' }}>
                  <div className="w-4 h-4 rounded-full ml-auto" style={{ background: '#070b09' }} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: smsOpt ? 'rgba(0,212,255,0.1)' : 'rgba(255,255,255,0.05)' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={smsOpt ? '#00d4ff' : 'rgba(255,255,255,0.4)'} strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  </div>
                  <div>
                    <p className="text-[12px] font-600" style={{ color: smsOpt ? '#fff' : 'rgba(255,255,255,0.6)' }}>SMS Alert</p>
                    <p className="text-[10px]" style={{ color: 'rgba(255,255,255,0.35)' }}>Text message to your number</p>
                  </div>
                </div>
                <button onClick={() => setSmsOpt(v => !v)} className="w-9 h-5 rounded-full flex items-center px-0.5 transition-all" style={{ background: smsOpt ? '#00d4ff' : 'rgba(255,255,255,0.12)' }}>
                  <div className="w-4 h-4 rounded-full transition-all" style={{ background: '#fff', marginLeft: smsOpt ? 'auto' : 0 }} />
                </button>
              </div>
            </div>
          </div>

          <button onClick={onJoined} className="w-full py-4 rounded-2xl font-700 text-sm tracking-wide transition-all active:scale-[0.98]"
            style={{ background: 'linear-gradient(135deg,#00ff87,#00d4ff)', color: '#070b09', boxShadow: '0 0 30px rgba(0,255,135,0.3)' }}>
            🎫 Join Queue & Get Token
          </button>
        </>
      )}
    </div>
  )
}

// ─── User panel (in-queue view) ───────────────────────────────────────────────

const ACTIVITY = [
  { time: '2 min ago', msg: '3 people ahead of you left the queue', type: 'success' as const },
  { time: '8 min ago', msg: 'Queue moved faster than expected', type: 'info' as const },
  { time: '15 min ago', msg: 'Your token was confirmed via SMS & App', type: 'success' as const },
  { time: '22 min ago', msg: 'Reminder: keep your phone nearby', type: 'alert' as const },
]
const TYPE_COLORS = { info: '#00d4ff', alert: '#f59e0b', success: '#00ff87' }

function UserInQueue({ config, setConfig, editOpen, setEditOpen, notifyEnabled, setNotifyEnabled }:
  { config: QueueConfig; setConfig: (c:QueueConfig)=>void; editOpen:boolean; setEditOpen:(v:boolean)=>void; notifyEnabled:boolean; setNotifyEnabled:(v:boolean)=>void }) {
  const queuePos = config.position
  const totalQ = config.total
  const waitMin = Math.round(queuePos * 1.5)
  const aheadInitials = ['SR','MK','TJ','AP','LN']

  return (
    <div className="flex-1 overflow-y-auto px-5 pb-10 -mt-6 relative z-10">
      {/* Active badge row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{ background:'rgba(0,255,135,0.08)', border:'1px solid rgba(0,255,135,0.2)' }}>
          <PulsingDot /><span className="text-[11px] font-600 tracking-widest" style={{ color:'#00ff87' }}>ACTIVE IN QUEUE</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setEditOpen(true)} className="w-8 h-8 rounded-full flex items-center justify-center transition-all active:scale-90" style={{ background:'rgba(0,255,135,0.08)', border:'1px solid rgba(0,255,135,0.2)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#00ff87" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          </div>
        </div>
      </div>

      {/* Main ticket */}
      <div className="rounded-2xl p-5 mb-4" style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.08)', backdropFilter:'blur(20px)' }}>
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[11px] font-500 tracking-widest mb-1" style={{ color:'rgba(255,255,255,0.35)' }}>YOUR TICKET</p>
            <h1 className="mono text-5xl font-700 leading-none" style={{ color:'#ffffff' }}>#{config.ticket}</h1>
          </div>
          <div className="text-right">
            <div className="inline-block px-2.5 py-1 rounded-lg mb-2" style={{ background:'rgba(0,212,255,0.1)', border:'1px solid rgba(0,212,255,0.25)' }}>
              <span className="text-[10px] font-600 tracking-wider" style={{ color:'#00d4ff' }}>{config.counter}</span>
            </div>
            <p className="text-[11px]" style={{ color:'rgba(255,255,255,0.3)' }}>City Hall</p>
            <p className="text-[11px]" style={{ color:'rgba(255,255,255,0.3)' }}>{config.service}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[
            { label:'POSITION', value:`${queuePos}th`, highlight:true },
            { label:'AHEAD', value:`${queuePos-1}`, highlight:false },
            { label:'EST. WAIT', value:`${waitMin}m`, highlight:false },
          ].map(({ label, value, highlight }) => (
            <div key={label} className="rounded-xl p-3 text-center" style={{ background:highlight?'rgba(0,255,135,0.08)':'rgba(255,255,255,0.03)', border:highlight?'1px solid rgba(0,255,135,0.2)':'1px solid rgba(255,255,255,0.06)' }}>
              <p className="mono text-[9px] mb-1" style={{ color:highlight?'rgba(0,255,135,0.6)':'rgba(255,255,255,0.3)' }}>{label}</p>
              <p className="mono text-xl font-700 leading-none" style={{ color:highlight?'#00ff87':'#ffffff' }}>{value}</p>
            </div>
          ))}
        </div>
        <QueueProgressBar total={totalQ} position={queuePos} />
      </div>

      {/* IoT footfall */}
      <div className="rounded-2xl px-4 py-3 mb-4 flex items-center gap-3" style={{ background:'rgba(0,212,255,0.05)', border:'1px solid rgba(0,212,255,0.15)' }}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background:'rgba(0,212,255,0.12)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-600" style={{ color:'#00d4ff' }}>IoT Sensor · Live Building Footfall</p>
          <p className="text-[12px]" style={{ color:'rgba(255,255,255,0.5)' }}><span className="font-700 text-white">134</span> people in building · <span style={{ color:'#f59e0b' }}>Moderate</span> crowd</p>
        </div>
        <PulsingDot color="#00d4ff" />
      </div>

      {/* People ahead */}
      <div className="rounded-2xl p-4 mb-4 flex items-center justify-between" style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)' }}>
        <div>
          <p className="text-[11px] font-500 tracking-widest mb-0.5" style={{ color:'rgba(255,255,255,0.3)' }}>PEOPLE AHEAD</p>
          <p className="text-2xl font-700" style={{ color:'#ffffff' }}>{queuePos-1}<span className="text-sm font-400 ml-1" style={{ color:'rgba(255,255,255,0.35)' }}>in line</span></p>
        </div>
        <div className="flex items-center">
          {aheadInitials.slice(0,4).map((init,i) => <Avatar key={i} initials={init} index={i} />)}
          {queuePos > 5 && <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-700 border-2" style={{ background:'rgba(255,255,255,0.08)', borderColor:'#070b09', color:'rgba(255,255,255,0.5)', marginLeft:'-8px', position:'relative', zIndex:0 }}>+{queuePos-5}</div>}
        </div>
      </div>

      {/* Notification + SMS options */}
      <div className="rounded-2xl p-4 mb-4" style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)' }}>
        <p className="text-[11px] font-600 tracking-widest mb-3" style={{ color:'rgba(255,255,255,0.3)' }}>NOTIFICATIONS</p>
        <div className="flex flex-col gap-3">
          {[
            { label:'App Alert', sub:'When 5 people ahead', color:'#00ff87', icon:<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>, active:true, onToggle:()=>{} },
            { label:'SMS Alert', sub:'Text to your registered number', color:'#00d4ff', icon:<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>, active:notifyEnabled, onToggle:()=>setNotifyEnabled(!notifyEnabled) },
          ].map(({ label, sub, color, icon, active, onToggle }) => (
            <div key={label} className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background:`${color}14` }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={active?color:'rgba(255,255,255,0.35)'} strokeWidth="2">{icon}</svg>
                </div>
                <div>
                  <p className="text-[12px] font-600" style={{ color:active?'#fff':'rgba(255,255,255,0.5)' }}>{label}</p>
                  <p className="text-[10px]" style={{ color:'rgba(255,255,255,0.3)' }}>{sub}</p>
                </div>
              </div>
              <button onClick={onToggle} className="w-9 h-5 rounded-full flex items-center px-0.5 transition-all" style={{ background:active?color:'rgba(255,255,255,0.1)' }}>
                <div className="w-4 h-4 rounded-full transition-all" style={{ background:active?'#070b09':'rgba(255,255,255,0.6)', marginLeft:active?'auto':0 }} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="rounded-2xl p-4 flex flex-col items-center gap-2" style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.8"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          <span className="text-[10px] font-500" style={{ color:'rgba(255,255,255,0.4)' }}>Share</span>
        </div>
        <div className="rounded-2xl p-4 flex flex-col items-center gap-2" style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.07)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.8"><rect x="3" y="3" width="5" height="5"/><rect x="16" y="3" width="5" height="5"/><rect x="3" y="16" width="5" height="5"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M12 3h.01"/></svg>
          <span className="text-[10px] font-500" style={{ color:'rgba(255,255,255,0.4)' }}>Scan QR</span>
        </div>
        <div className="rounded-2xl p-4 flex flex-col items-center gap-2" style={{ background:'rgba(255,50,50,0.05)', border:'1px solid rgba(255,50,50,0.12)' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,100,100,0.7)" strokeWidth="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          <span className="text-[10px] font-500" style={{ color:'rgba(255,100,100,0.7)' }}>Leave</span>
        </div>
      </div>

      {/* Activity feed */}
      <p className="text-[11px] font-600 tracking-widest mb-3" style={{ color:'rgba(255,255,255,0.3)' }}>RECENT UPDATES</p>
      <div className="flex flex-col gap-2.5 mb-6">
        {ACTIVITY.map((item,i) => (
          <div key={i} className="flex items-start gap-3 rounded-xl p-3.5" style={{ background:'rgba(255,255,255,0.025)', border:'1px solid rgba(255,255,255,0.05)' }}>
            <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background:TYPE_COLORS[item.type], boxShadow:`0 0 6px ${TYPE_COLORS[item.type]}80` }} />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-400 leading-snug" style={{ color:'rgba(255,255,255,0.7)' }}>{item.msg}</p>
              <p className="mono text-[10px] mt-1" style={{ color:'rgba(255,255,255,0.25)' }}>{item.time}</p>
            </div>
          </div>
        ))}
      </div>

      <button className="w-full py-4 rounded-2xl font-600 text-sm tracking-wide transition-all active:scale-[0.98]"
        style={{ background:'linear-gradient(135deg,#00ff87,#00d4ff)', color:'#070b09', boxShadow:'0 0 30px rgba(0,255,135,0.25)' }}>
        View Full Queue Status
      </button>
    </div>
  )
}

// ─── Admin screen ─────────────────────────────────────────────────────────────

const COUNTERS_INIT = [
  { id:'A', label:'Counter A', serving:'A-234', waiting:8,  served:31, status:'active' as const },
  { id:'B', label:'Counter B', serving:'A-247', waiting:12, served:28, status:'active' as const },
  { id:'C', label:'Counter C', serving:'A-219', waiting:3,  served:41, status:'active' as const },
  { id:'D', label:'Counter D', serving:'—',     waiting:0,  served:19, status:'break'  as const },
]

const LIVE_LOG_INIT = [
  { t:'09:41', event:'A-247 called to Counter B', tag:'called' },
  { t:'09:38', event:'A-246 served in 4m 12s',  tag:'done'   },
  { t:'09:35', event:'Counter D on break',       tag:'break'  },
  { t:'09:31', event:'A-244 no-show — skipped', tag:'skip'   },
  { t:'09:28', event:'A-243 served in 6m 05s',  tag:'done'   },
]

const TAG_STYLES: Record<string,{bg:string;color:string}> = {
  called: { bg:'rgba(249,115,22,0.12)', color:'#f97316' },
  done:   { bg:'rgba(34,197,94,0.10)',  color:'#22c55e' },
  break:  { bg:'rgba(148,163,184,0.15)',color:'#94a3b8' },
  skip:   { bg:'rgba(239,68,68,0.10)',  color:'#ef4444' },
}

// Analytics data
const FOOTFALL_DATA = [
  {h:'8AM',actual:32,predicted:30},{h:'9AM',actual:58,predicted:55},
  {h:'10AM',actual:91,predicted:88},{h:'11AM',actual:104,predicted:95},
  {h:'12PM',actual:67,predicted:70},{h:'1PM',actual:38,predicted:42},
  {h:'2PM',actual:55,predicted:58},{h:'3PM',actual:89,predicted:85},
  {h:'4PM',actual:98,predicted:90},{h:'5PM',actual:null,predicted:72},
]

const SERVICE_DEMAND = [
  { name:'License Renewal', value:28, color:'#6366f1' },
  { name:'Tax Payment',     value:22, color:'#f97316' },
  { name:'Certificate',     value:18, color:'#06b6d4' },
  { name:'Property Rec.',   value:15, color:'#8b5cf6' },
  { name:'Other',           value:17, color:'#94a3b8' },
]

const UTIL_DATA = [
  { name:'Counter A', util:78 },
  { name:'Counter B', util:92 },
  { name:'Counter C', util:45 },
  { name:'Counter D', util:0  },
]

const ALERTS = [
  { type:'warn', title:'Spike predicted at 3 PM', desc:'Historical data suggests +40 visitors between 3–4 PM. Consider opening Counter E.', action:'Open Counter E' },
  { type:'ok',   title:'Counter C underutilised', desc:'Only 45% utilisation. Recommend redirecting some B-queue visitors.', action:'Redirect Flow' },
  { type:'info', title:'Avg wait up by 3 min',   desc:'Service time at Counter B increased. Flagged for review.', action:'View Details' },
]

function StatPill({ label, value, sub }: { label:string; value:string|number; sub?:string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl py-4 px-2" style={{ background:'#fff', border:'1px solid #f0ede8', boxShadow:'0 1px 4px rgba(0,0,0,0.05)' }}>
      <span className="text-2xl font-800 leading-none" style={{ color:'#1c1917' }}>{value}</span>
      {sub && <span className="mono text-[9px] mt-0.5" style={{ color:'#f97316' }}>{sub}</span>}
      <span className="text-[10px] font-500 mt-1 text-center leading-tight" style={{ color:'#a8a29e' }}>{label}</span>
    </div>
  )
}

type AdminTab = 'live' | 'analytics' | 'alerts'

function AdminScreen() {
  const [counters, setCounters] = useState(COUNTERS_INIT)
  const [log, setLog] = useState(LIVE_LOG_INIT)
  const [tab, setTab] = useState<AdminTab>('live')
  const now = new Date()
  const timeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`

  const totalWaiting = counters.reduce((s,c)=>s+c.waiting,0)
  const totalServed  = counters.reduce((s,c)=>s+c.served,0)
  const activeCount  = counters.filter(c=>c.status==='active').length

  function callNext(id: string) {
    setCounters(prev => prev.map(c => {
      if (c.id!==id) return c
      const next = `${c.id}-${parseInt(c.serving.split('-')[1]||'200')+1}`
      return { ...c, serving:next, waiting:Math.max(0,c.waiting-1), served:c.served+1 }
    }))
    const ct = counters.find(c=>c.id===id)!
    const nextNum = parseInt(ct.serving.split('-')[1]||'200')+1
    setLog(prev => [{ t:timeStr, event:`${id}-${nextNum} called to Counter ${id}`, tag:'called' }, ...prev.slice(0,4)])
  }

  function toggleBreak(id: string) {
    setCounters(prev => prev.map(c => c.id===id ? { ...c, status:c.status==='break'?'active':'break' } : c))
  }

  const TABS: { key: AdminTab; label: string }[] = [
    { key:'live', label:'Live' }, { key:'analytics', label:'Analytics' }, { key:'alerts', label:'Alerts' },
  ]

  return (
    <div className="w-full max-w-[390px] min-h-screen flex flex-col overflow-hidden" style={{ background:'#faf9f6' }}>
      {/* Status bar */}
      <div className="flex items-center justify-between px-5 pt-4 pb-1">
        <span className="mono text-[11px]" style={{ color:'#a8a29e' }}>{timeStr}</span>
        <div className="flex gap-1 items-center">
          {[3,4,5,6].map(h=><div key={h} className="w-[3px] rounded-sm" style={{ height:h, background:'#78716c' }} />)}
          <div className="w-4 h-2 rounded-sm ml-1 flex items-center pl-[1px]" style={{ border:'1px solid #a8a29e' }}>
            <div className="h-[6px] rounded-sm" style={{ width:'85%', background:'#22c55e' }} />
          </div>
        </div>
      </div>

      {/* Header */}
      <div className="px-5 pt-3 pb-3 flex items-center justify-between" style={{ borderBottom:'1px solid #f0ede8' }}>
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background:'#f97316' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <span className="font-800 text-base tracking-tight" style={{ color:'#1c1917' }}>QueueMaster</span>
            <span className="mono text-[9px] px-1.5 py-0.5 rounded-md font-600" style={{ background:'rgba(249,115,22,0.1)', color:'#f97316' }}>ADMIN</span>
          </div>
          <p className="text-[11px]" style={{ color:'#a8a29e' }}>City Hall — Branch 02 · Operator: Sarah M.</p>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full" style={{ background:'#22c55e' }} />
          <span className="text-[11px] font-600" style={{ color:'#22c55e' }}>LIVE</span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex px-5 pt-3 gap-2 pb-0">
        {TABS.map(t => (
          <button key={t.key} onClick={()=>setTab(t.key)}
            className="flex-1 py-2 rounded-xl text-[12px] font-600 transition-all"
            style={{ background:tab===t.key?'#f97316':'rgba(0,0,0,0.04)', color:tab===t.key?'#fff':'#a8a29e' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 pb-10 pt-4">

        {/* ── LIVE TAB ── */}
        {tab === 'live' && (
          <>
            <div className="grid grid-cols-4 gap-2 mb-4">
              <StatPill label="Waiting" value={totalWaiting} />
              <StatPill label="Avg Wait" value="14m" sub="↓2m" />
              <StatPill label="Served" value={totalServed} />
              <StatPill label="Active" value={`${activeCount}/4`} />
            </div>

            {/* IoT footfall live widget */}
            <div className="rounded-2xl px-4 py-3 mb-4 flex items-center gap-3" style={{ background:'rgba(6,182,212,0.06)', border:'1px solid rgba(6,182,212,0.2)' }}>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <PulsingDot color="#06b6d4" />
                  <p className="text-[11px] font-600" style={{ color:'#06b6d4' }}>IoT Live Footfall Sensor</p>
                </div>
                <p className="text-[12px]" style={{ color:'#44403c' }}><span className="font-700 text-[18px]" style={{ color:'#1c1917' }}>247</span> people in premises right now</p>
              </div>
              <div className="text-right">
                <p className="mono text-[10px]" style={{ color:'#a8a29e' }}>CAPACITY</p>
                <div className="w-20 h-2 rounded-full overflow-hidden mt-1" style={{ background:'#f5f3f0' }}>
                  <div className="h-full rounded-full" style={{ width:'62%', background:'linear-gradient(90deg,#22c55e,#f59e0b)' }} />
                </div>
                <p className="mono text-[10px] mt-0.5" style={{ color:'#f59e0b' }}>62% full</p>
              </div>
            </div>

            <p className="mono text-[10px] tracking-widest mb-3" style={{ color:'#a8a29e' }}>COUNTERS</p>
            <div className="flex flex-col gap-3 mb-5">
              {counters.map(c => (
                <div key={c.id} className="rounded-2xl overflow-hidden" style={{ background:'#fff', border:c.status==='active'?'1px solid #f0ede8':'1px solid #fcd34d40', boxShadow:'0 1px 6px rgba(0,0,0,0.04)' }}>
                  <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5" style={{ borderBottom:'1px solid #f7f5f2' }}>
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center font-800 text-sm" style={{ background:c.status==='active'?'rgba(249,115,22,0.1)':'rgba(148,163,184,0.15)', color:c.status==='active'?'#f97316':'#94a3b8' }}>{c.id}</div>
                      <div>
                        <p className="font-600 text-sm leading-tight" style={{ color:'#1c1917' }}>{c.label}</p>
                        <p className="text-[11px]" style={{ color:'#a8a29e' }}>{c.status==='active'?`${c.waiting} waiting · ${c.served} served`:'On break'}</p>
                      </div>
                    </div>
                    <span className="mono text-[9px] px-2 py-1 rounded-lg font-600" style={{ background:c.status==='active'?'rgba(34,197,94,0.1)':'rgba(234,179,8,0.12)', color:c.status==='active'?'#22c55e':'#ca8a04' }}>
                      {c.status==='active'?'ACTIVE':'BREAK'}
                    </span>
                  </div>
                  <div className="px-4 pt-3 pb-3.5 flex items-center justify-between gap-3">
                    <div>
                      <p className="mono text-[10px] mb-0.5" style={{ color:'#a8a29e' }}>NOW SERVING</p>
                      <p className="mono text-2xl font-700 leading-none" style={{ color:'#1c1917' }}>{c.serving}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={()=>toggleBreak(c.id)} className="px-3 py-2 rounded-xl text-[11px] font-600 transition-all active:scale-95" style={{ background:'#f7f5f2', color:'#78716c', border:'1px solid #e7e5e4' }}>{c.status==='active'?'Break':'Resume'}</button>
                      <button onClick={()=>callNext(c.id)} disabled={c.status==='break'||c.waiting===0} className="px-4 py-2 rounded-xl text-[11px] font-700 transition-all active:scale-95 disabled:opacity-40" style={{ background:'linear-gradient(135deg,#f97316,#fb923c)', color:'#fff', boxShadow:c.status==='active'?'0 2px 10px rgba(249,115,22,0.3)':'none' }}>Call Next →</button>
                    </div>
                  </div>
                  {c.status==='active' && (
                    <div className="px-4 pb-3.5">
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background:'#f5f3f0' }}>
                        <div className="h-full rounded-full transition-all duration-700" style={{ width:`${Math.min(100,(c.waiting/20)*100)}%`, background:c.waiting>12?'linear-gradient(90deg,#ef4444,#f97316)':c.waiting>6?'linear-gradient(90deg,#f97316,#fbbf24)':'linear-gradient(90deg,#22c55e,#86efac)' }} />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <p className="mono text-[10px] tracking-widest mb-3" style={{ color:'#a8a29e' }}>LIVE LOG</p>
            <div className="rounded-2xl overflow-hidden mb-5" style={{ background:'#fff', border:'1px solid #f0ede8' }}>
              {log.map((item,i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom:i<log.length-1?'1px solid #f7f5f2':'none' }}>
                  <span className="mono text-[10px] flex-shrink-0" style={{ color:'#a8a29e', width:36 }}>{item.t}</span>
                  <span className="mono text-[9px] px-2 py-0.5 rounded-md font-600 flex-shrink-0" style={{ background:TAG_STYLES[item.tag].bg, color:TAG_STYLES[item.tag].color }}>{item.tag.toUpperCase()}</span>
                  <span className="text-[12px] leading-snug" style={{ color:'#44403c' }}>{item.event}</span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button className="py-3.5 rounded-2xl font-600 text-sm border transition-all active:scale-[0.98]" style={{ background:'#fff', color:'#ef4444', borderColor:'rgba(239,68,68,0.2)' }}>Pause All</button>
              <button className="py-3.5 rounded-2xl font-600 text-sm transition-all active:scale-[0.98]" style={{ background:'linear-gradient(135deg,#f97316,#fb923c)', color:'#fff', boxShadow:'0 4px 20px rgba(249,115,22,0.3)' }}>Reset Queue</button>
            </div>
          </>
        )}

        {/* ── ANALYTICS TAB ── */}
        {tab === 'analytics' && (
          <>
            <p className="font-700 text-sm mb-0.5" style={{ color:'#1c1917' }}>Footfall Today</p>
            <p className="text-[11px] mb-3" style={{ color:'#a8a29e' }}>Actual vs. predicted visitor count (IoT + ML model)</p>
            <div className="rounded-2xl p-4 mb-4" style={{ background:'#fff', border:'1px solid #f0ede8', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={FOOTFALL_DATA} margin={{ top:4, right:8, left:-24, bottom:0 }}>
                  <XAxis dataKey="h" tick={{ fontSize:9, fill:'#a8a29e', fontFamily:'JetBrains Mono' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize:9, fill:'#a8a29e', fontFamily:'JetBrains Mono' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background:'#fff', border:'1px solid #f0ede8', borderRadius:12, fontSize:11 }} />
                  <Line type="monotone" dataKey="actual" stroke="#f97316" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="predicted" stroke="#f9731640" strokeWidth={2} strokeDasharray="4 3" dot={false} />
                </LineChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-2">
                <div className="flex items-center gap-1.5"><div className="w-4 h-0.5" style={{ background:'#f97316' }} /><span className="text-[10px]" style={{ color:'#a8a29e' }}>Actual</span></div>
                <div className="flex items-center gap-1.5"><div className="w-4 h-0.5 border-t border-dashed" style={{ borderColor:'#f97316' }} /><span className="text-[10px]" style={{ color:'#a8a29e' }}>Predicted</span></div>
              </div>
            </div>

            <p className="font-700 text-sm mb-0.5" style={{ color:'#1c1917' }}>Counter Utilisation</p>
            <p className="text-[11px] mb-3" style={{ color:'#a8a29e' }}>% of time actively serving (last 3 hours)</p>
            <div className="rounded-2xl p-4 mb-4" style={{ background:'#fff', border:'1px solid #f0ede8', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
              <ResponsiveContainer width="100%" height={130}>
                <BarChart data={UTIL_DATA} margin={{ top:4, right:8, left:-24, bottom:0 }}>
                  <XAxis dataKey="name" tick={{ fontSize:9, fill:'#a8a29e', fontFamily:'JetBrains Mono' }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0,100]} tick={{ fontSize:9, fill:'#a8a29e', fontFamily:'JetBrains Mono' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={(v) => `${v}%`} contentStyle={{ background:'#fff', border:'1px solid #f0ede8', borderRadius:12, fontSize:11 }} />
                  <Bar dataKey="util" radius={[6,6,0,0]}>
                    {UTIL_DATA.map((d,i) => <Cell key={i} fill={d.util>80?'#f97316':d.util>50?'#fbbf24':'#22c55e'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <p className="font-700 text-sm mb-0.5" style={{ color:'#1c1917' }}>Service Demand</p>
            <p className="text-[11px] mb-3" style={{ color:'#a8a29e' }}>Token distribution by service type today</p>
            <div className="rounded-2xl p-4 mb-4" style={{ background:'#fff', border:'1px solid #f0ede8', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={SERVICE_DEMAND} dataKey="value" cx="50%" cy="50%" outerRadius={70} innerRadius={40} paddingAngle={3}>
                    {SERVICE_DEMAND.map((d,i) => <Cell key={i} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => `${v}%`} contentStyle={{ background:'#fff', border:'1px solid #f0ede8', borderRadius:12, fontSize:11 }} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize:10, fontFamily:'JetBrains Mono' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Avg wait trend */}
            <div className="rounded-2xl p-4" style={{ background:'#fff', border:'1px solid #f0ede8', boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
              <p className="font-600 text-sm mb-3" style={{ color:'#1c1917' }}>Avg Wait Time by Counter (min)</p>
              {[{id:'A',avg:11},{id:'B',avg:18},{id:'C',avg:7},{id:'D',avg:0}].map(c => (
                <div key={c.id} className="flex items-center gap-3 mb-2">
                  <span className="mono text-[11px] w-16 flex-shrink-0" style={{ color:'#78716c' }}>Counter {c.id}</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background:'#f5f3f0' }}>
                    <div className="h-full rounded-full transition-all" style={{ width:`${(c.avg/20)*100}%`, background:c.avg>15?'#f97316':c.avg>8?'#fbbf24':'#22c55e' }} />
                  </div>
                  <span className="mono text-[11px] w-8 text-right flex-shrink-0" style={{ color:'#44403c' }}>{c.avg>0?`${c.avg}m`:'—'}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── ALERTS TAB ── */}
        {tab === 'alerts' && (
          <>
            <div className="flex items-center gap-2 rounded-2xl px-4 py-3 mb-5" style={{ background:'rgba(249,115,22,0.06)', border:'1px solid rgba(249,115,22,0.2)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <p className="text-[12px] font-600" style={{ color:'#f97316' }}>3 action items require attention</p>
            </div>

            <p className="mono text-[10px] tracking-widest mb-3" style={{ color:'#a8a29e' }}>AI-DRIVEN RECOMMENDATIONS</p>
            <div className="flex flex-col gap-3 mb-6">
              {ALERTS.map((a,i) => {
                const borderColor = a.type==='warn'?'rgba(249,115,22,0.25)':a.type==='ok'?'rgba(34,197,94,0.25)':'rgba(6,182,212,0.25)'
                const tagBg = a.type==='warn'?'rgba(249,115,22,0.1)':a.type==='ok'?'rgba(34,197,94,0.1)':'rgba(6,182,212,0.1)'
                const tagColor = a.type==='warn'?'#f97316':a.type==='ok'?'#22c55e':'#06b6d4'
                const tagLabel = a.type==='warn'?'WARNING':a.type==='ok'?'SUGGEST':'INFO'
                return (
                  <div key={i} className="rounded-2xl p-4" style={{ background:'#fff', border:`1px solid ${borderColor}`, boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
                    <div className="flex items-start justify-between mb-2">
                      <span className="mono text-[9px] px-2 py-0.5 rounded-md font-600" style={{ background:tagBg, color:tagColor }}>{tagLabel}</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a8a29e" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                    </div>
                    <p className="font-700 text-sm mb-1" style={{ color:'#1c1917' }}>{a.title}</p>
                    <p className="text-[12px] leading-relaxed mb-3" style={{ color:'#78716c' }}>{a.desc}</p>
                    <button className="w-full py-2 rounded-xl text-[12px] font-600 transition-all active:scale-[0.98]" style={{ background:tagBg, color:tagColor, border:`1px solid ${borderColor}` }}>{a.action}</button>
                  </div>
                )
              })}
            </div>

            <p className="mono text-[10px] tracking-widest mb-3" style={{ color:'#a8a29e' }}>RESOURCE ALLOCATION</p>
            <div className="rounded-2xl p-4 mb-4" style={{ background:'#fff', border:'1px solid #f0ede8' }}>
              <p className="font-600 text-sm mb-3" style={{ color:'#1c1917' }}>Recommended Counter Config</p>
              {[
                { time:'Now',     config:'4 counters', note:'Current demand OK' },
                { time:'3–4 PM',  config:'5 counters', note:'Spike expected (+40 visitors)' },
                { time:'4–5 PM',  config:'4 counters', note:'Demand normalising' },
                { time:'5–6 PM',  config:'2 counters', note:'Wind-down period' },
              ].map(r => (
                <div key={r.time} className="flex items-center gap-3 py-2.5" style={{ borderBottom:'1px solid #f7f5f2' }}>
                  <span className="mono text-[10px] w-14 flex-shrink-0" style={{ color:'#a8a29e' }}>{r.time}</span>
                  <div className="flex-1">
                    <p className="text-[12px] font-600" style={{ color:'#1c1917' }}>{r.config}</p>
                    <p className="text-[10px]" style={{ color:'#a8a29e' }}>{r.note}</p>
                  </div>
                </div>
              ))}
            </div>

            <p className="mono text-[10px] tracking-widest mb-3" style={{ color:'#a8a29e' }}>SMS / BROADCAST ALERTS</p>
            <div className="rounded-2xl p-4 mb-5" style={{ background:'#fff', border:'1px solid #f0ede8' }}>
              <p className="text-[12px] mb-3" style={{ color:'#78716c' }}>Send a bulk SMS or app notification to all queued visitors</p>
              <textarea rows={3} placeholder="Type your message here..." className="w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-none" style={{ background:'#faf9f6', border:'1px solid #e7e5e4', color:'#1c1917' }} />
              <button className="w-full mt-3 py-3 rounded-xl font-600 text-sm transition-all active:scale-[0.98]" style={{ background:'linear-gradient(135deg,#f97316,#fb923c)', color:'#fff' }}>Send to All Queued Visitors</button>
            </div>
          </>
        )}
      </div>

      {/* Bottom nav */}
      <div className="px-6 pt-3 pb-6 flex items-center justify-around" style={{ background:'#faf9f6', borderTop:'1px solid #f0ede8' }}>
        {[
          { label:'Dashboard', active:true, icon:<><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></> },
          { label:'Counters', active:false, icon:<><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></> },
          { label:'Reports', active:false, icon:<><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></> },
          { label:'Settings', active:false, icon:<><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M4.93 4.93a10 10 0 0 0 0 14.14"/></> },
        ].map(({ label, active, icon }) => (
          <button key={label} className="flex flex-col items-center gap-1">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active?'#f97316':'#a8a29e'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
            <span className="text-[9px] font-500" style={{ color:active?'#f97316':'#a8a29e' }}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Root App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [screen, setScreen] = useState<'user'|'admin'>('user')
  const [joined, setJoined] = useState(false)
  const [notifyEnabled, setNotifyEnabled] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [config, setConfig] = useState<QueueConfig>({ ticket:'A-247', counter:'COUNTER B', service:'License Renewal', position:12, total:40 })

  useEffect(() => {
    if (!joined) return
    const iv = setInterval(() => setConfig(c => ({ ...c, position: c.position > 1 ? c.position - 1 : c.position })), 8000)
    return () => clearInterval(iv)
  }, [joined])

  return (
    <div className="min-h-screen flex flex-col items-center" style={{ background:'#101010' }}>
      {/* Screen switcher */}
      <div className="sticky top-0 z-50 w-full flex justify-center py-3 px-4"
        style={{ background:'rgba(16,16,16,0.88)', backdropFilter:'blur(12px)', borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex rounded-xl p-1 gap-1" style={{ background:'rgba(255,255,255,0.06)' }}>
          {(['user','admin'] as const).map(s => (
            <button key={s} onClick={()=>setScreen(s)} className="px-5 py-2 rounded-lg text-sm font-600 transition-all duration-200"
              style={{ background:screen===s ? (s==='user'?'#00ff87':'#f97316') : 'transparent', color:screen===s?'#070b09':'rgba(255,255,255,0.45)' }}>
              {s==='user'?'👤 User Panel':'🖥️ Admin Panel'}
            </button>
          ))}
        </div>
      </div>

      {screen === 'admin' ? <AdminScreen /> : (
        <div className="relative w-full max-w-[390px] min-h-screen flex flex-col overflow-hidden" style={{ background:'#070b09' }}>
          <EditDrawer open={editOpen} config={config} onClose={()=>setEditOpen(false)} onChange={setConfig} />

          {/* Status bar */}
          <div className="flex items-center justify-between px-6 pt-4 pb-2">
            <span className="mono text-[11px]" style={{ color:'rgba(255,255,255,0.3)' }}>9:41</span>
            <div className="flex gap-1.5 items-center">
              {[3,4,5,6].map(h=><div key={h} className="w-[3px] rounded-sm" style={{ height:h, background:'rgba(255,255,255,0.5)' }} />)}
              <div className="w-4 h-2 rounded-sm ml-1 flex items-center pl-[1px]" style={{ border:'1px solid rgba(255,255,255,0.35)' }}>
                <div className="h-[6px] rounded-sm" style={{ width:'70%', background:'#00ff87' }} />
              </div>
            </div>
          </div>

          {/* Canvas hero */}
          <div className="relative w-full overflow-hidden" style={{ height:280 }}>
            <CrowdCanvas />
            <div className="absolute inset-x-0 bottom-0 h-24 pointer-events-none" style={{ background:'linear-gradient(to bottom,transparent,#070b09)' }} />
            <div className="absolute inset-x-0 top-0 h-10 pointer-events-none" style={{ background:'linear-gradient(to top,transparent,rgba(7,11,9,0.7))' }} />
          </div>

          {/* Join flow OR in-queue panel */}
          {!joined
            ? <JoinQueueFlow onJoined={() => setJoined(true)} />
            : <UserInQueue config={config} setConfig={setConfig} editOpen={editOpen} setEditOpen={setEditOpen} notifyEnabled={notifyEnabled} setNotifyEnabled={setNotifyEnabled} />
          }

          {/* Bottom nav */}
          <div className="sticky bottom-0 px-6 pt-3 pb-6 flex items-center justify-around" style={{ background:'linear-gradient(to top,#070b09 60%,transparent)', borderTop:'1px solid rgba(255,255,255,0.05)' }}>
            {[
              { label:'Home', active:true,  icon:<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/> },
              { label:'Queues', active:false, icon:<><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></> },
              { label:'Scan', active:false, icon:<><rect x="3" y="3" width="5" height="5"/><rect x="16" y="3" width="5" height="5"/><rect x="3" y="16" width="5" height="5"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/></> },
              { label:'History', active:false, icon:<><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></> },
              { label:'Profile', active:false, icon:<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></> },
            ].map(({ label, active, icon }) => (
              <button key={label} className="flex flex-col items-center gap-1">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={active?'#00ff87':'rgba(255,255,255,0.28)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
                <span className="text-[9px] font-500" style={{ color:active?'#00ff87':'rgba(255,255,255,0.25)' }}>{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

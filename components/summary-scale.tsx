'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Drop, RoadHorizon, Truck } from '@phosphor-icons/react';
import type { Batch, Route } from '../lib/triage';

const format=(value:number)=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:1}).format(value);
const GaugeComponent=dynamic(()=>import('react-gauge-component'),{ssr:false,loading:()=> <div className="gauge-loading"><span className="spinner"/></div>});

export default function SummaryScale({totalKg,loads,routeWeights,readings,onRoute}:{totalKg:number;loads:number;routeWeights:Record<Route,number>;readings:Batch[];onRoute:(route:Route)=>void}){
 const [reduceMotion,setReduceMotion]=useState(true);
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduceMotion(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);},[]);
 const maximum=Math.max(10000,Math.ceil(totalKg/5000)*5000);
 const water=totalKg?readings.reduce((sum,batch)=>sum+batch.water*batch.kg,0)/totalKg:null;
 return <section className="summary-scale" aria-label="Ringkasan muatan selesai">
  <div className="speed-primary">
   <div className="speed-main-stat"><div className="speed-label"><div className="speed-icon cyan" aria-hidden="true"><RoadHorizon size={19}/></div><span>Diarahkan</span></div><strong>{format(totalKg/1000)}<small> ton</small></strong></div>
   <div className="speed-main-stat"><div className="speed-label"><div className="speed-icon violet" aria-hidden="true"><Truck size={19}/></div><span>Muatan selesai</span></div><strong>{format(loads)}</strong></div>
   <div className="speed-main-stat"><div className="speed-label"><div className="speed-icon aqua" aria-hidden="true"><Drop size={18}/></div><span>Air rerata</span></div><strong>{water===null?'—':format(water)}<small> %</small></strong></div>
  </div>
  <div className="speed-secondary">
   {(['U','B','M'] as Route[]).map(route=><button className={`speed-mini-stat speed-route-${route}`} key={route} onClick={()=>onRoute(route)} aria-label={`Tujuan ${route}, ${format(routeWeights[route])} kilogram`}><div className="speed-icon" aria-hidden="true">{route}</div><strong>{format(routeWeights[route])}<small> kg</small></strong></button>)}
  </div>
  <div className="weight-gauge" data-weight-kg={totalKg} data-total-kg={totalKg} role="img" aria-label={`Total ${format(totalKg)} kilogram. Rentang nol sampai ${format(maximum)} kilogram.`}>
   <GaugeComponent
    type="semicircle"
    value={totalKg}
    minValue={0}
    maxValue={maximum}
    marginInPercent={{top:.09,bottom:.08,left:.1,right:.1}}
    arc={{width:.09,padding:0,cornerRadius:6,subArcs:totalKg<=0?[{color:'#dbe3ed'}]:totalKg>=maximum?[{color:'#629af2'}]:[{limit:totalKg,color:'#629af2'},{color:'#dbe3ed'}]}}
    pointer={{type:'needle',color:'#ef4444',baseColor:'#ef4444',strokeColor:'#ef4444',strokeWidth:3,length:.72,width:.01,animate:true,elastic:false,animationDuration:reduceMotion?0:1000,animationDelay:0}}
    labels={{valueLabel:{formatTextValue:value=>`${format(Number(value))} kg`,style:{fill:'#172640',fontSize:'18px',fontFamily:'Barlow Condensed, Arial Narrow, sans-serif',fontWeight:500,textShadow:'none'}},tickLabels:{type:'inner',ticks:[0,maximum*.25,maximum*.5,maximum*.75,maximum].map(value=>({value})),defaultTickValueConfig:{formatTextValue:value=>format(Number(value)),style:{fill:'#526278',fontSize:'18px',fontFamily:'Barlow Condensed, Arial Narrow, sans-serif'}}}}}
   />
  </div>
 </section>;
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { CameraSlash } from '@phosphor-icons/react';

export type ScanPhase='idle'|'feeding'|'scanning';

export default function ConveyorScanner({phase,part,weight,percent,position,onPosition,onFeedComplete}:{phase:ScanPhase;part:number;weight:string;percent:string;position:number;onPosition:(value:number)=>void;onFeedComplete:()=>void}){
 const videoRef=useRef<HTMLVideoElement>(null);
 const callbacks=useRef({onPosition,onFeedComplete});
 const [ready,setReady]=useState(false),[unavailable,setUnavailable]=useState(false);
 useEffect(()=>{callbacks.current={onPosition,onFeedComplete};},[onPosition,onFeedComplete]);
 useEffect(()=>{
  const video=videoRef.current;
  if(!video)return;
  if(phase!=='feeding'){video.pause();return;}
  let cancelled=false,fallbackStarted=false;
  let stopTimer:ReturnType<typeof setTimeout>|undefined;
  let loadTimer:ReturnType<typeof setTimeout>|undefined;
  const finish=()=>{
   if(cancelled)return;
   cancelled=true;
   clearTimeout(stopTimer);clearTimeout(loadTimer);
   video.pause();
   callbacks.current.onPosition(video.currentTime);
   callbacks.current.onFeedComplete();
  };
  const fallback=()=>{
   if(cancelled||fallbackStarted)return;
   fallbackStarted=true;setUnavailable(true);video.pause();clearTimeout(loadTimer);
   stopTimer=setTimeout(finish,1000);
  };
  loadTimer=setTimeout(fallback,5000);
  video.play().then(()=>{
   if(cancelled||fallbackStarted){video.pause();return;}
   clearTimeout(loadTimer);setUnavailable(false);
   stopTimer=setTimeout(finish,1000);
  }).catch(fallback);
  return()=>{cancelled=true;clearTimeout(stopTimer);clearTimeout(loadTimer);video.pause();};
 },[phase,part]);

 return <div className={`camera-placeholder conveyor-camera ${phase==='scanning'?'scanning':''}`} data-phase={phase}>
  <video ref={videoRef} className="conveyor-video" src="/trash_conveyor_horizontal_final.mp4" preload="auto" muted playsInline loop aria-label="Video contoh sampah di konveyor" onLoadedMetadata={event=>{const video=event.currentTarget;if(position>0&&Number.isFinite(video.duration)&&video.duration>0)video.currentTime=position%video.duration;}} onLoadedData={()=>{setReady(true);setUnavailable(false);}} onTimeUpdate={event=>callbacks.current.onPosition(event.currentTarget.currentTime)} onPause={event=>callbacks.current.onPosition(event.currentTarget.currentTime)} onError={()=>setUnavailable(true)}/>
  <div className="conveyor-scrim"/>
  <i className="corner tl"/><i className="corner tr"/><i className="corner bl"/><i className="corner br"/>
  <div className="conveyor-status" role="status"><i className={phase==='feeding'?'is-moving':''}/>{phase==='feeding'?'Konveyor berjalan…':phase==='scanning'?`Memindai bagian ${part}…`:'Konveyor berhenti'}</div>
  {phase==='scanning'&&<div className="scanner-line"/>}
  {!ready&&!unavailable&&<div className="conveyor-message"><span className="spinner"/><span>Menyiapkan video…</span></div>}
  {unavailable&&<div className="conveyor-message" data-testid="video-fallback"><CameraSlash size={30}/><strong>Video tidak tersedia</strong><span>Pemindaian contoh tetap bisa dilanjutkan.</span></div>}
  <span className="weight-chip conveyor-weight">{weight} kg | {percent}% muatan</span>
 </div>;
}

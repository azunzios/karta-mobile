import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeBatch, recommend, remaining, simulate } from './triage.ts';
import type { Job } from './triage.ts';
const job=():Job=>({id:'test',tps:'TPS Uji',plate:'AD 1',total:1200,batchSize:500,batches:[],done:false,createdAt:''});
const komposisi=(o:number,p:number,i:number)=>[{name:'Organik',value:o,color:''},{name:'Plastik',value:p,color:''},{name:'Inert',value:i,color:''}];
describe('Triase per bagian (Tabel 3.7)',()=>{
 it('memilih U hanya jika batas atas kadar air ≤ 20%',()=>{const r=simulate(2);assert.equal(recommend(r),'U');assert.equal(recommend({...r,upper:21}),'B');assert.equal(recommend({...r,upper:20}),'U');});
 it('M butuh kadar air ≥ 60%, organik ≥ 60%, plastik ≤ 5%',()=>{assert.equal(recommend(simulate(0)),'M');assert.equal(recommend({...simulate(0),water:62,composition:komposisi(70,6,2)}),'B');assert.equal(recommend({...simulate(0),water:59,composition:komposisi(70,3,2)}),'B');});
 it('R untuk inert ≥ 20% walaupun kering',()=>{assert.equal(recommend({...simulate(2),composition:komposisi(30,30,20)}),'R');assert.equal(recommend(simulate(3)),'R');});
 it('R untuk muatan sangat basah dan tercampur',()=>{assert.equal(recommend({water:70,upper:78,lhv:2,composition:komposisi(45,20,5)}),'R');assert.equal(recommend({water:64,upper:70,lhv:3,composition:komposisi(45,20,5)}),'B');});
 it('data lama dengan nama "Residu" tetap dihitung sebagai inert',()=>{assert.equal(recommend({water:30,upper:35,lhv:8,composition:[{name:'Residu',value:25,color:''}]}),'R');});
 it('mengalokasikan 500 + 500 + 200 kg tanpa melebihi berat dan menjaga rute berbeda',()=>{const j=job();for(let i=0;i<3;i++){const r=simulate(i);j.batches.push(makeBatch(j,r,recommend(r),''));}assert.deepEqual(j.batches.map(b=>b.kg),[500,500,200]);assert.deepEqual(j.batches.map(b=>b.route),['M','B','U']);assert.equal(remaining(j),0);assert.throws(()=>makeBatch(j,simulate(0),'M',''));});
 it('perubahan rute perlu alasan dan mempertahankan rekomendasi asli',()=>{assert.throws(()=>makeBatch(job(),simulate(0),'B',''));const b=makeBatch(job(),simulate(0),'B','Perlu pemilahan plastik ulang');assert.equal(b.recommended,'M');assert.equal(b.route,'B');assert.equal(b.water,68);});
 it('enam fraksi berjumlah 100 persen',()=>{for(let i=0;i<4;i++){const r=simulate(i);assert.equal(r.composition.length,6);assert.equal(r.composition.reduce((s,c)=>s+c.value,0),100);}});
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeBatch, recommend, remaining, simulate } from './triage.ts';
import type { Job } from './triage.ts';
const job=():Job=>({id:'test',tps:'TPS Uji',plate:'AD 1',total:1200,batchSize:500,batches:[],done:false,createdAt:''});
describe('Triase per bagian',()=>{
 it('memilih U hanya jika batas atas kadar air aman',()=>{const r=simulate(2);assert.equal(recommend(r),'U');assert.equal(recommend({...r,upper:21}),'B');assert.equal(recommend({...r,upper:20}),'U');});
 it('mensyaratkan organik dominan dan plastik rendah untuk M',()=>{assert.equal(recommend(simulate(0)),'M');assert.equal(recommend({...simulate(0),composition:[{name:'Organik',value:70,color:''},{name:'Plastik',value:13,color:''}]}),'B');});
 it('mengalokasikan 500 + 500 + 200 kg tanpa melebihi berat dan menjaga rute berbeda',()=>{const j=job();for(let i=0;i<3;i++){const r=simulate(i);j.batches.push(makeBatch(j,r,recommend(r),''));}assert.deepEqual(j.batches.map(b=>b.kg),[500,500,200]);assert.deepEqual(j.batches.map(b=>b.route),['M','B','U']);assert.equal(remaining(j),0);assert.throws(()=>makeBatch(j,simulate(0),'M',''));});
 it('perubahan rute perlu alasan dan mempertahankan rekomendasi asli',()=>{assert.throws(()=>makeBatch(job(),simulate(0),'B',''));const b=makeBatch(job(),simulate(0),'B','Perlu pemilahan plastik ulang');assert.equal(b.recommended,'M');assert.equal(b.route,'B');assert.equal(b.water,68);});
 it('enam fraksi berjumlah 100 persen',()=>{for(let i=0;i<4;i++){const r=simulate(i);assert.equal(r.composition.length,6);assert.equal(r.composition.reduce((s,c)=>s+c.value,0),100);}});
});

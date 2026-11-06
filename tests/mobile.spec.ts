import {test,expect} from '@playwright/test';

test('reset data dari login menghapus muatan dan bertahan setelah dimuat ulang',async({page})=>{
 await page.goto('/');
 await page.evaluate(()=>localStorage.setItem('karta-reset-unrelated','tetap'));
 await page.getByRole('button',{name:'Reset data',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('Data berhasil direset.');
 await page.reload();
 await page.getByRole('button',{name:'Coba demo'}).click();
 await expect(page.locator('.speed-main-stat').filter({hasText:'Diarahkan'}).locator('strong')).toHaveText('0 ton');
 await expect(page.locator('.weight-gauge')).toContainText('0 kg');
 const saved=await page.evaluate(()=>({data:JSON.parse(localStorage.getItem('karta-prototype-v1')!),other:localStorage.getItem('karta-reset-unrelated')}));
 expect(saved.data.jobs).toEqual([]);
 expect(saved.data.activeId).toBeNull();
 expect(saved.other).toBe('tetap');
});

test('ringkasan 3 ton tampil sebagai 3.000 kg tanpa nilai demo tetap',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'Coba demo'}).click();
 await expect(page.getByRole('heading',{name:'Halo, Adi.'})).toBeVisible();
 await page.evaluate(()=>{
  const data=JSON.parse(localStorage.getItem('karta-prototype-v1')!);
  const job=data.jobs[0];
  const samples=job.batches;
  job.total=3000;
  job.batches=Array.from({length:6},(_,index)=>({...samples[index%samples.length],id:index+1,kg:500}));
  localStorage.setItem('karta-prototype-v1',JSON.stringify(data));
 });
 await page.reload();
 await expect(page.locator('.speed-main-stat').filter({hasText:'Diarahkan'}).locator('strong')).toHaveText('3 ton');
 await expect(page.locator('.weight-gauge')).toHaveAttribute('data-weight-kg','3000');
 await expect(page.locator('.weight-gauge')).toContainText('3.000 kg');
 await expect(page.locator('.summary-scale')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
});
test('alur muatan parsial, keputusan, laporan, dan pemulihan sesi',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 // Model diblokir agar data simulasi yang dipakai dan angka uji tetap.
 await page.route('**/models/karta-seg.json',route=>route.abort());
 await page.route('**/api.open-meteo.com/**',route=>route.fulfill({json:{hourly:{time:[],precipitation:[]}}}));
 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Masuk' ,exact:false})).toBeVisible();
 await page.screenshot({path:'artifacts/01-masuk.png',fullPage:true});
 await page.getByRole('button',{name:'Pindai kartu petugas'}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog')).not.toBeVisible();
 await page.getByRole('button',{name:'Coba demo'}).click();
 await expect(page.getByRole('heading',{name:'Halo, Adi.'})).toBeVisible();
 await expect(page.locator('.summary-scale')).toHaveCount(1);
 await expect(page.locator('.weight-gauge')).toHaveAttribute('data-total-kg','1000');
 await expect(page.locator('.weight-gauge')).toContainText('1.000 kg');
 await expect(page.locator('.weight-gauge .pointer circle')).toBeVisible();
 await expect(page.locator('.weight-gauge .pointer path')).toHaveCSS('fill','none');
 await expect(page.locator('.speed-main-stat')).toHaveCount(3);
 await expect(page.locator('.speed-mini-stat')).toHaveCount(4);
 await expect(page.locator('.speed-main-stat').filter({hasText:'Air rerata'}).locator('strong')).toHaveText('41 %');
 await expect(page.locator('.speed-icon')).toHaveCount(7);
 await expect(page.getByText('GERBANG CERDAS',{exact:true})).toHaveCount(0);
 await page.screenshot({path:'artifacts/02-beranda.png',fullPage:true});
 await page.getByRole('button',{name:'Mulai muatan baru'}).click();
 await expect(page.getByRole('button',{name:'Mulai pindai',exact:true})).toBeDisabled();
 await page.getByLabel('Berat bersih (kg)').fill('1200');
 await page.getByRole('button',{name:'Pindai ID petugas TPS',exact:false}).click();
 await page.keyboard.press('Escape');
 await expect(page.getByRole('dialog')).toBeVisible();
 await expect(page.getByLabel('Berat bersih (kg)')).toHaveValue('1200');
 await page.getByRole('button',{name:'Pindai ID petugas TPS',exact:false}).click();
 await page.getByRole('button',{name:'Gunakan kartu contoh'}).click();
 await expect(page.getByLabel('Berat bersih (kg)')).toHaveValue('1200');
 await expect(page.getByLabel('TPS asal')).toHaveValue('TPS Pasar Gede');
 await expect(page.getByLabel('Pelat kendaraan')).toHaveValue('AD 1436 HA');
 await expect(page.getByText('3 bagian pemindaian')).toBeVisible();
 await page.getByRole('button',{name:'Mulai pindai'}).click();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('karta-prototype-v1')!).jobs[0].tpsWorkerId)).toBe('TPS-017');
 await expect(page.getByText('Model belum dapat dimuat')).toBeVisible();
 for(let i=0;i<3;i++){
  await page.getByRole('button',{name:'Pakai data simulasi'}).click();
  await expect(page.getByRole('heading',{name:`Hasil bagian ${i+1}`})).toBeVisible();
  if(i===0){
   await page.getByRole('button',{name:'Rute B Bio-drying'}).click();
   await expect(page.getByRole('button',{name:'Simpan rute'})).toBeDisabled();
   await page.getByLabel('Alasan perubahan rute *').fill('Kontaminasi plastik perlu dipilah ulang');
   await page.screenshot({path:'artifacts/03-keputusan.png',fullPage:true});
  }
  await page.getByRole('button',{name:'Simpan rute'}).click();
 }
 await expect(page.getByRole('heading',{name:'Muatan selesai'})).toBeVisible();
 await page.getByRole('button',{name:'Lihat ringkasan'}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await page.getByText('Rincian bagian',{exact:true}).click();
 await expect(page.getByText('Bagian 3 · 200 kg')).toBeVisible();
 await expect(page.getByText('Rekomendasi awal: Rute M')).toBeVisible();
 const download=page.waitForEvent('download');
 await page.getByRole('button',{name:'Unduh laporan'}).click();
 expect((await download).suggestedFilename()).toMatch(/SORA-.*\.csv/);
 await page.screenshot({path:'artifacts/04-ringkasan.png',fullPage:true});
 await page.keyboard.press('Escape');
 await page.reload();
 await expect(page.getByRole('heading',{name:'Halo, Adi.'})).toBeVisible();
 await page.getByRole('button',{name:'Riwayat',exact:true}).click();
 await expect(page.getByRole('button',{name:/TPS Pasar Gede/})).toBeVisible();
 // A mixed truck contributes only its matching parts to each destination.
 for(const [route,count,kg] of [['U',2,'700'],['B',2,'1.000'],['M',1,'500']] as const){
  await page.getByRole('button',{name:'Beranda',exact:true}).click();
  await expect(page.locator('.weight-gauge')).toHaveAttribute('data-total-kg','2200');
  await expect(page.locator('.weight-gauge')).toContainText('2.200 kg');
  await expect(page.locator('.speed-main-stat').filter({hasText:'Air rerata'}).locator('strong')).toHaveText('44,7 %');
  await page.locator(`.route-tile:has(.route-letter:text-is("${route}"))`).click();
  await expect(page.getByRole('heading',{name:`Tujuan ${route}`,exact:true})).toBeVisible();
  await expect(page.locator('.route-scan-card')).toHaveCount(count);
  await expect(page.locator('.history-summary h2')).toHaveText(`${kg} kg`);
 }
 await page.locator('.route-scan-card').first().click();
 await expect(page.getByRole('dialog').getByText(/Unit maggot BSF & kompos.*Zona M/)).toBeVisible();
 expect(errors).toEqual([]);
});
test('video gagal dimuat tetap dapat dilanjutkan dengan data simulasi',async({page})=>{
 await page.route('**/trash_conveyor_horizontal_final.mp4',route=>route.abort());
 await page.addInitScript(()=>localStorage.setItem('karta-prototype-v1',JSON.stringify({logged:true,userId:'OP-042',activeId:'TEST-VIDEO',jobs:[{id:'TEST-VIDEO',tps:'TPS Uji Video',plate:'AD 1234 HA',total:1000,batchSize:500,batches:[],done:false,createdAt:new Date().toISOString()}]})));
 await page.goto('/');
 await page.getByRole('button',{name:'Pindai',exact:true}).click();
 await expect(page.getByTestId('video-fallback')).toBeVisible();
 await page.getByRole('button',{name:'Beranda',exact:true}).click();
 await page.getByRole('button',{name:'Pindai',exact:true}).click();
 await expect(page.getByTestId('video-fallback')).toBeVisible();
 await page.getByRole('button',{name:'Pakai data simulasi'}).click();
 await expect(page.getByRole('heading',{name:'Hasil bagian 1'})).toBeVisible();
 await page.getByRole('button',{name:'Simpan rute'}).click();
 await expect(page.getByRole('heading',{name:'Hasil bagian 2'})).toHaveCount(0);
 await expect(page.getByTestId('video-fallback')).toBeVisible();
});
test('tampilan ponsel, lanskap, dan gerakan berkurang',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/');
 await page.getByRole('button',{name:'Coba demo'}).click();
 await expect(page.getByRole('heading',{name:'Halo, Adi.'})).toBeVisible();
 for(const size of [{width:320,height:740},{width:375,height:812},{width:430,height:932},{width:844,height:390},{width:1440,height:900}]){
  await page.setViewportSize(size);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();
  expect(await page.locator('.app-shell').evaluate(el=>el.getBoundingClientRect().width)).toBeLessThanOrEqual(461);
 }
 await page.setViewportSize({width:375,height:812});
 await expect(page.locator('.weight-gauge .pointer circle')).toBeVisible();
 await page.getByRole('button',{name:'Bantuan',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Bantuan'})).toBeVisible();
 await page.getByText('Apakah seluruh truk harus masuk satu rute?').click();
 await expect(page.getByText('Tidak. Muatan dibagi per bagian', {exact:false})).toBeVisible();
 await page.screenshot({path:'artifacts/05-bantuan.png',fullPage:true});
});

test('model segmentasi berjalan di peramban dari video contoh dan foto',async({page})=>{
 test.setTimeout(120000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api.open-meteo.com/**',route=>route.fulfill({json:{hourly:{time:[],precipitation:[]}}}));
 await page.addInitScript(()=>localStorage.setItem('karta-prototype-v1',JSON.stringify({logged:true,userId:'OP-042',activeId:'TEST-MODEL',jobs:[{id:'TEST-MODEL',tps:'TPS Uji Model',plate:'AD 1 HA',total:700,batchSize:500,batches:[],done:false,createdAt:new Date().toISOString(),tpsType:'pasar',rain24:12,rain72:20}]})));
 await page.goto('/');
 await page.getByRole('button',{name:'Pindai',exact:true}).click();
 await expect(page.locator('.model-line')).toContainText('SORA-Seg',{timeout:60000});
 const scan=page.getByRole('button',{name:'Mulai analisis'});
 await expect(scan).toBeEnabled({timeout:30000});
 await scan.click();
 await expect(page.getByRole('heading',{name:'Hasil bagian 1'})).toBeVisible({timeout:60000});
 await expect(page.locator('.result-snapshot')).toBeVisible();
 await expect(page.locator('.range-block')).toBeVisible();
 const total=await page.locator('.composition-legend strong').evaluateAll(els=>els.reduce((s,e)=>s+parseInt(e.textContent||'0',10),0));
 expect(total).toBe(100);
 expect(['U','B','M','R']).toContain(await page.locator('.big-route').textContent());
 await page.screenshot({path:'artifacts/06-hasil-model.png',fullPage:true});
 await page.getByRole('button',{name:'Simpan rute'}).click();
 await page.getByRole('button',{name:/Foto/}).click();
 await page.locator('input[type=file]').setInputFiles('tests/fixtures/sampah-contoh.jpg');
 await expect(scan).toBeEnabled();
 await scan.click();
 await expect(page.getByRole('heading',{name:'Hasil bagian 2'})).toBeVisible({timeout:60000});
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('karta-prototype-v1')!).jobs[0].batches[0]);
 expect(saved.source).toBe('model');
 expect(saved.snapshot).toBeUndefined();
 expect(saved.lower).toBeLessThanOrEqual(saved.water);
 expect(errors).toEqual([]);
});

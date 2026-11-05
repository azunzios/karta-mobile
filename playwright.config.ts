import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'./tests',timeout:60000,use:{baseURL:process.env.KARTA_TEST_URL||'http://localhost:3000',viewport:{width:390,height:844},browserName:'chromium',trace:'retain-on-failure'},workers:1});

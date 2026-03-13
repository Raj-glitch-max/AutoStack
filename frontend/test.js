import puppeteer from 'puppeteer';
const browser = await puppeteer.launch();
const page = await browser.newPage();
page.on('console', msg => console.log('PAGE LOG:', msg.text()));
page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
await page.goto('http://localhost:5173');
await new Promise(r => setTimeout(r, 4000));
await browser.close();

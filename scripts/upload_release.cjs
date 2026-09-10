#!/usr/bin/env node
const fs = require('fs');
const https = require('https');
const path = require('path');

const token = process.argv[2] || process.env.GITHUB_TOKEN;
const tag = process.argv[3] || 'v2.3.40';
const debPath = process.argv[4] || path.join(__dirname, `../release/aldaffa-app-desktop_${tag.replace(/^v/, '')}_amd64.deb`);

if (!token) {
  console.error('Usage: node upload_release.cjs <GITHUB_TOKEN> [TAG] [DEB_PATH]');
  process.exit(1);
}

if (!fs.existsSync(debPath)) {
  console.error('Deb file does not exist at:', debPath);
  process.exit(1);
}

console.log(`[Upload] Target Tag: ${tag}`);
console.log(`[Upload] Package: ${debPath}`);

function githubRequest(options, data) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body || '{}') });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function run() {
  console.log(`[1/3] Fetching release metadata for ${tag}...`);
  const relRes = await githubRequest({
    hostname: 'api.github.com',
    path: `/repos/rdluffy-v/aldaffa-erp-system/releases/tags/${tag}`,
    method: 'GET',
    headers: {
      'User-Agent': 'Aldaffa-ERP-Uploader',
      'Authorization': `Bearer ${token}`
    }
  });

  let release = relRes.data;
  if (relRes.status === 404) {
    console.log(`Release ${tag} not found, creating it...`);
    const createRes = await githubRequest({
      hostname: 'api.github.com',
      path: '/repos/rdluffy-v/aldaffa-erp-system/releases',
      method: 'POST',
      headers: {
        'User-Agent': 'Aldaffa-ERP-Uploader',
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }, JSON.stringify({
      tag_name: tag,
      name: `Aldaffa Perfumes ERP ${tag}`,
      draft: false,
      prerelease: false
    }));
    release = createRes.data;
  }

  if (!release || !release.id) {
    console.error('Failed to get/create release:', relRes);
    process.exit(1);
  }

  console.log(`[2/3] Release found with ID: ${release.id}`);

  const fileName = path.basename(debPath);
  console.log(`[3/3] Uploading binary asset: ${fileName} (${(fs.statSync(debPath).size / (1024 * 1024)).toFixed(2)} MB)...`);

  const uploadUrl = new URL(release.upload_url.replace(/\{.*\}/, ''));
  uploadUrl.searchParams.set('name', fileName);

  const fileStream = fs.createReadStream(debPath);
  const uploadReq = https.request({
    hostname: uploadUrl.hostname,
    path: `${uploadUrl.pathname}${uploadUrl.search}`,
    method: 'POST',
    headers: {
      'User-Agent': 'Aldaffa-ERP-Uploader',
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/vnd.debian.binary-package',
      'Content-Length': fs.statSync(debPath).size
    }
  }, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      console.log(`[Result] Upload response status: ${res.statusCode}`);
      if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log(`✅ Asset ${fileName} successfully attached to release ${tag}!`);
      } else {
        console.error('Upload error response:', body);
      }
    });
  });

  uploadReq.on('error', (err) => {
    console.error('Upload stream error:', err);
  });

  fileStream.pipe(uploadReq);
}

run().catch(console.error);

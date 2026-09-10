#!/usr/bin/env node
const fs = require('fs');
const https = require('https');
const path = require('path');

const token = process.argv[2] || process.env.GITHUB_TOKEN;
const tag = process.argv[3] || 'v2.3.45';
const debPath = process.argv[4] || path.join(__dirname, `../release/aldaffa-app-desktop_${tag.replace(/^v/, '')}_amd64.deb`);
const ymlPath = path.join(__dirname, '../release/latest-linux.yml');

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

function uploadAsset(uploadBaseUrl, filePath, contentType) {
  return new Promise((resolve, reject) => {
    const fileName = path.basename(filePath);
    const size = fs.statSync(filePath).size;
    console.log(`Uploading asset: ${fileName} (${(size / (1024 * 1024)).toFixed(2)} MB)...`);

    const uploadUrl = new URL(uploadBaseUrl.replace(/\{.*\}/, ''));
    uploadUrl.searchParams.set('name', fileName);

    const fileStream = fs.createReadStream(filePath);
    const uploadReq = https.request({
      hostname: uploadUrl.hostname,
      path: `${uploadUrl.pathname}${uploadUrl.search}`,
      method: 'POST',
      headers: {
        'User-Agent': 'Aldaffa-ERP-Uploader',
        'Authorization': `Bearer ${token}`,
        'Content-Type': contentType,
        'Content-Length': size
      }
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log(`[Result] Upload response for ${fileName}: status ${res.statusCode}`);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`✅ Asset ${fileName} successfully attached to release ${tag}!`);
          resolve(true);
        } else {
          console.error(`Upload error response for ${fileName}:`, body);
          resolve(false);
        }
      });
    });

    uploadReq.on('error', (err) => {
      console.error(`Upload stream error for ${fileName}:`, err);
      reject(err);
    });

    fileStream.pipe(uploadReq);
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
    const releaseNotes = `### الإصدار المستقر v2.3.45 - تخصيص المخزون للعطور وسلاسة الأداء 🌿✨

- **تخصيص كامل للمخزون للعطور**: نافذة إضافة منتج مقسمة لـ 4 بطاقات ذكية وبديهية.
- **الوحدات الذكية**: دعم العطور الجاهزة، الزيوت العطرية الخام، القناني الفارغة مع حرية تامة للمستخدم في اختيار وتحديد وحدات القياس وسعة العبوات.
- **حاسبة هوامش الربح الحية**: حساب فوري لهامش ونسبة الربح قبل الحفظ.
- **توليد باركود بنقرة واحدة**: دعم كامل للباركود التلقائي والماسح الضوئي.
- **تتبع موقع الرف**: إضافة حقل موقع الرف أو الدولاب داخل المحل.
- **الفلاتر السريعة والتعديل المباشر**: فلاتر فورية للمخزون، وتعديل مباشر من البطاقات، وتزويد سريع للمخزون (Quick Restock) متزامن مع متوسط التكلفة المرجح WAC، والتعديل الجماعي للأسعار.
- **استعادة الشعار**: ضبط مسار الشعار الخارجي للتطبيق ليظهر بوضوح وبأعلى جودة.`;

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
      body: releaseNotes,
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

  console.log(`[3/3] Uploading binary assets...`);
  if (Array.isArray(release.assets)) {
    for (const existingAsset of release.assets) {
      if (existingAsset.name === path.basename(debPath) || existingAsset.name === 'latest-linux.yml') {
        console.log(`Removing old asset ${existingAsset.name} (id: ${existingAsset.id})...`);
        await githubRequest({
          hostname: 'api.github.com',
          path: `/repos/rdluffy-v/aldaffa-erp-system/releases/assets/${existingAsset.id}`,
          method: 'DELETE',
          headers: {
            'User-Agent': 'Aldaffa-ERP-Uploader',
            'Authorization': `Bearer ${token}`
          }
        });
      }
    }
  }

  await uploadAsset(release.upload_url, debPath, 'application/vnd.debian.binary-package');
  if (fs.existsSync(ymlPath)) {
    await uploadAsset(release.upload_url, ymlPath, 'text/yaml');
  }
  console.log('🎉 All assets uploaded successfully!');
}

run().catch(console.error);

const fs = require('fs');
const https = require('https');
const path = require('path');
const crypto = require('crypto');

const token = process.argv[2] || process.env.GITHUB_TOKEN;
const tag = process.argv[3] || 'v2.3.51';
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

// Compute genuine SHA-512 of Debian package and synchronize latest-linux.yml
const debBuffer = fs.readFileSync(debPath);
const computedSha512 = crypto.createHash('sha512').update(debBuffer).digest('base64');
console.log(`[Upload] Computed SHA-512 for package: ${computedSha512}`);

if (fs.existsSync(ymlPath)) {
  let ymlContent = fs.readFileSync(ymlPath, 'utf8');
  ymlContent = ymlContent.replace(/sha512: .*/g, `sha512: ${computedSha512}`);
  fs.writeFileSync(ymlPath, ymlContent, 'utf8');
  console.log('[Upload] Synchronized release/latest-linux.yml with computed SHA-512');
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
        console.log(`Asset ${fileName} upload response status: ${res.statusCode}`);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(body);
        } else {
          console.error(`Asset upload failed:`, body);
          reject(new Error(`Asset upload failed with status ${res.statusCode}: ${body}`));
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
    const releaseNotes = `### الإصدار الشامل المستقر v2.3.51 - تحسينات المشتريات والتوالف واحتساب عبوات التيسترات والحماية الوقائية 🛡️📦🧪

- **1. وحدة المشتريات (Purchases Module)**:
  - إصلاح وتحسين قائمة الفئات في فاتورة الموردين: دمج فئات العطور الأساسية تلقائياً مع فئات قاعدة البيانات والمخزون لمنع انحصار القائمة في فئة واحدة.
  - التحديث الديناميكي للمدخلات المعتمدة: ضبط وحدة القياس الافتراضية ونوع الصنف (\`item_type\`) تلقائياً عند تغيير الفئة (مل للزيوت، لتر للكحول، قطعة للعبوات والإكسسوارات).
  - حفظ وتصنيف الصنف الجديد في جدول المخزون تلقائياً، وإظهار وسم الفئة بوضوح بجانب كل صنف.

- **2. وحدة التوالف والفاقد (Losses Module)**:
  - إضافة منتقي تاريخ الحركة الفعلي (\`transactionDate\`) في نافذة تسجيل التالف يتيح للمستخدم تحديد تاريخ الكسر أو التلف بدقة.
  - الحفظ الآمن في SQLite بصيغة ISO مع الحفاظ الدقيق على تاريخ اليوم المحدد.
  - إضافة تصدير كشف التوالف بصيغة Excel CSV مع ترميز UTF-8 BOM (\`\\uFEFF\`) لضمان فتح النصوص العربية والأرقام بدقة تامة.

- **3. إدارة التيسترات والعينات (Tester Batches & Compounding)**:
  - احتساب التكلفة التجميعية لعينات التخليط ديناميكياً: (تكلفة الزيت العطري) + (تكلفة كحول الإيثانول) + (سعر القارورة/الزجاجة المختارة من المخزون).
  - الخصم الذري لجميع المكونات (الزيت، الكحول، والزجاجة) في حركة واحدة بقاعدة البيانات مع حماية حظر السالب \`MAX(0, qty - ?)\`.
  - إظهار تفاصيل العبوة وتكلفتها في جدول المتابعة وكشف التصدير CSV.

- **4. الحماية الوقائية المؤتمتة والأمان البرمجي (Error Prevention Engine)**:
  - سكريبت الفحص الوقائي (\`scripts/verify_aldaffa_guardrails.cjs\`) المعتمد على القواعد الـ 13 المستفادة من تاريخ النظام (خطافات React، دقة TSPL 203 DPI، علامة UTF-8 BOM، حظر السالب، استقرار أزرار ومدراء النظام، وتطابق قنوات IPC).
  - حزمة الاختبارات الآلية رقم 36 (\`Suite 36\`) واجتياز 40 حزمة اختبار (280 فحصاً آلياً) بنسبة نجاح 100%.`;

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

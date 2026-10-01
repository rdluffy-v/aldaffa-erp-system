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
    const releaseNotes = `### الإصدار الشامل المستقر v2.3.52 - ضبط الثيم الليلي وتوثيق التواريخ والتدقيق والفرز الشامل 🛡️📅✨

- **1. ضبط تباين الثيم الليلي (Theme Consistency & Dark Mode)**:
  - إصلاح مشكلة الشاشات البيضاء والأزرار الفاتحة في معمل التعتيق (\`MacerationLab.jsx\`) الناجمة عن ألوان Tailwind غير المعرفة.
  - تعريف لون \`slate-850\` المخصص وضبط كافة البطاقات، القوائم المنسدلة، وأزرار النوافذ التفاعلية والموحدة لتكون مريحة للعين ومتناسقة مع الوضع الليلي.

- **2. توثيق وتسجيل التواريخ الشامل (Ubiquitous Date Tracking)**:
  - **إدارة المخزون والجرد (\`InventoryFull.jsx\`)**: إضافة طوابع التاريخ \`created_at\` و \`updated_at\` لكل صنف، وشارات زمنية دقيقة على البطاقات، وتوثيق تاريخ التسجيل/التعديل في كشف الجرد المطبوع A4.
  - **الملاحظات والمهام (\`Notes.jsx\`)**: إضافة منتقي تاريخ الحركة الفعلي في نافذة تسجيل وتعديل الملاحظات مع حفظ تاريخ التعديل \`updated_at\`.
  - **إغلاق الوردية والحسابات (\`ShiftClose.jsx\`)**: إضافة عمود التاريخ لجميع الجداول التفصيلية (التوالف، السحوبات النقدية، الضخ المالي، الهدايا والعينات).

- **3. سجل حركات وتعديلات الجرد والأسعار (Stock Audit Trail)**:
  - إنشاء جدول مستودع \`stock_audits\` يسجل حركة وتاريخ كل صنف عند الإضافة، التعديل، التوريد، التعديل الجماعي، أو الحذف بالثانية واسم المستخدم.
  - إضافة نافذة تفاعلية تتيح معاينة وتصفية سجل التدقيق حسب الصنف ونطاق التاريخ.

- **4. أدوات الفلترة والفرز المرن (Filtering & Sorting Engine)**:
  - إضافة شريط فلترة التواريخ (\`من تاريخ\` و \`إلى تاريخ\`) في جميع الأقسام.
  - إضافة خيارات فرز متعددة (الأحدث، الأقدم، آخر تعديل، حسب السعر، حسب الكمية، حسب الأولوية، وتاريخ الجاهزية).

- **5. فحص الجودة والمطابقة التامة**:
  - اجتياز 100% من قواعد الحماية الوقائية (13 قاعدة).
  - اجتياز جميع حزم الاختبارات الـ 40 (280 فحصاً آلياً) بنجاح تام.`;

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

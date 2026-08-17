import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Printer,
  FileText,
  Type,
  Database,
  Sparkles,
  RefreshCw,
  Download,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Save,
  RotateCcw,
  HardDrive,
  Sliders,
  ShieldCheck,
  Smartphone,
  Tag,
  Key,
  FolderArchive,
  ArrowRight,
  Info,
  Check,
  BookOpen,
  Package,
  ShoppingCart,
  ShoppingBag,
  Lock,
  HelpCircle,
  Layers,
  Undo2,
  FlaskConical,
  TrendingUp,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Shield,
  Clock,
  Compass
} from 'lucide-react';

import { SandboxEngine } from '../database/SandboxEngine.js';
import { SettingsRepository } from '../database/repositories/SettingsRepository.js';
import { useLabelsStore, DEFAULT_MODULE_LABELS } from '../stores/useLabelsStore.js';
import { useUIStore } from '../stores/useUIStore.js';
import { formatCurrency, formatDate } from '../utils/helpers.js';
import Modal from '../components/ui/Modal.jsx';
import ConfirmModal from '../components/shared/ConfirmModal.jsx';

const settingsRepo = new SettingsRepository();

// Default print configuration
const DEFAULT_PRINT_SETTINGS = {
  printMode: 'thermal', // 'thermal' | 'a4'
  storeName: 'الدفة للعطور',
  storeSubtitle: 'Aldaffa Perfumes - لأرقى العطور والخلطات',
  storePhone: '0123456789',
  storeAddress: 'ليبيا - مصراتة',
  receiptGreeting: 'شكراً لتسوقكم معنا .. نسعد بخدمتكم دائماً',
  receiptPolicy: 'سياسة الاستبدال والاسترجاع: خلال 30 ساعة مع الفاتورة الأصلية. المنتجات المفتوحة لا تسترجع.',
  showLogo: true,
  showBarcode: true,
  showCashier: true,
  showPhone: true,
  logoBase64: ''
};

const GUIDE_STAGES = [
  {
    id: 1,
    title: 'المرحلة 1: التثبيت والتهيئة الأولية وتخصيص المتجر',
    subtitle: 'إعداد الهوية التجارية، قوالب الطباعة الحرارية، وتسميات الأقسام',
    icon: Sliders,
    badge: 'الخطوة الأولى',
    steps: [
      {
        heading: '1. ضبط بيانات وهوية المتجر',
        text: 'من تبويب "استوديو وقوالب الطباعة"، أدخل اسم المتجر (الدفة للعطور)، الشعار الرسمي (Logo)، العنوان التفصيلي (ليبيا - مصراتة)، ورقم هاتف خدمة العملاء لتظهر تلقائياً في ترويسة الفواتير.'
      },
      {
        heading: '2. إعداد نوع وقالب الطباعة',
        text: 'اختر نمط الطباعة الافتراضي: إما إيصالات حرارية سريعة (80mm) لكاشير المحل، أو مستندات قياسية (A4) لكشوفات الحساب وتقارير الإدارة والموردين. قم أيضاً بكتابة سياسة الاستبدال والاسترجاع (المعتمدة: خلال 30 ساعة مع الفاتورة الأصلية).'
      },
      {
        heading: '3. التعديل الحر لمسميات الأقسام',
        text: 'من تبويب "التعديل الحر للمسميات"، يمكنك إعادة تسمية أي تبويب أو قسم في القبة العلوية للمنظومة بما يتناسب تماماً مع أسلوب العمل في متجرك.'
      }
    ],
    tips: '💡 تلميح: يمكنك طباعة إيصال تجريبي 80mm أو مستند A4 بنقرة واحدة من استوديو الطباعة لمعاينة المظهر الحقيقي قبل بدء البيع.'
  },
  {
    id: 2,
    title: 'المرحلة 2: بناء المخزون وإدخال الأصناف الافتتاحية والباركود',
    subtitle: 'تسجيل العطور، الزيوت، الزجاجات، البخور، والتسعير وحدود الأمان',
    icon: Package,
    badge: 'تأسيس المخزون',
    steps: [
      {
        heading: '1. إضافة المنتجات وتصنيفها',
        text: 'توجه لقسم "المخزون" واضغط على "➕ إضافة منتج". اكتب اسم الصنف بوضوح (مثال: عطر مسك الدفة الملكي 100ml، أو زيت صندل فرنسي)، وحدد تصنيفه (عطور شرقية، عطور غربية، زيوت خام، زجاجات ومستلزمات، بخور ومباخر).'
      },
      {
        heading: '2. التسعير ووحدات القياس',
        text: 'أدخل سعر التكلفة الفعلي (سعر الشراء)، وسعر البيع القطاعي للمستهلك، وسعر الجملة، والكمية الافتتاحية المتوفرة على الرفوف، ووحدة القياس (قطعة، مل، تولة، جرام).'
      },
      {
        heading: '3. ربط وتوليد الباركود وحد الأمان',
        text: 'يمكنك مسح باركود العبوة بقارئ الباركود أو الضغط على "توليد باركود تلقائي" لينشئ النظام باركوداً فريداً لكل صنف. حدد أيضاً "حد النواقص" (مثل 5 قطع) ليقوم النظام بتنبيهك تلقائياً عند اقتراب نفاد الكمية.'
      }
    ],
    tips: '🏷️ تلميح: يمكنك أيضاً إضافة أي منتج جديد وحقنه وتوليد باركوده فورياً أثناء تسجيل فواتير الشراء دون الحاجة للذهاب للمخزون أولاً.'
  },
  {
    id: 3,
    title: 'المرحلة 3: دورة المشتريات والتوريد وحساب متوسط التكلفة (WAC)',
    subtitle: 'تسجيل فواتير الموردين، حساب متوسط التكلفة المرجح، وطباعة ملصقات الباركود',
    icon: ShoppingBag,
    badge: 'التوريد والشراء',
    steps: [
      {
        heading: '1. تسجيل فاتورة شراء جديدة',
        text: 'ادخل لقسم "المشتريات" واضغط "طلب شراء جديد". أدخل اسم المورد، رقم مرجع الفاتورة، تاريخ الفاتورة، وطريقة الدفع (نقدي أو آجل دين للمورد).'
      },
      {
        heading: '2. إضافة أصناف موجودة أو جديدة كلياً',
        text: 'أضف الأصناف المشتراة، كما يمكنك النقر على "➕ إضافة منتج جديد تماماً" لكتابة اسم صنف جديد وتكلفته وسعر بيعه وحقنه في المخزون وتوليد باركوده تلقائياً في ثوانٍ معدودة.'
      },
      {
        heading: '3. حساب متوسط التكلفة المرجح (WAC)',
        text: 'عند شراء شحنة جديدة بسعر تكلفة مختلف، يطبق النظام معادلة (Weighted Average Cost) لتحديث تكلفة الوحدة في المخزون بدقة تامة وضمان صحة حساب الأرباح.'
      },
      {
        heading: '4. طباعة ملصقات الباركود للكميات المشتراة',
        text: 'اضغط على زر "🏷️ طباعة باركود الكميات" ليقوم النظام بتجهيز وطباعة ملصقات باركود حرارية بعدد القطع المشتراة فوراً للصقها على العبوات والزجاجات.'
      }
    ],
    tips: '🤖 تلميح ذكي: يدعم قسم المشتريات ميزة قراءة الفواتير الورقية المصورة عبر الذكاء الاصطناعي (OCR) لاستخراج الأصناف والكميات والأسعار تلقائياً.'
  },
  {
    id: 4,
    title: 'المرحلة 4: عمليات البيع اليومية وشاشة الكاشير السريعة (POS)',
    subtitle: 'البيع بالباركود، الخصومات المزدوجة، الدفع النقدي والآجل، والإيصال الحراري',
    icon: ShoppingCart,
    badge: 'الكاشير والمبيعات',
    steps: [
      {
        heading: '1. مسح وإضافة المنتجات للسلة',
        text: 'في شاشة نقاط البيع (POS)، مرر قارئ الباركود على المنتج أو اضغط (F1) للبحث، أو تصفح المنتجات والتصنيفات لإضافتها فوراً لسلة المشتريات.'
      },
      {
        heading: '2. تطبيق أنماط الخصم المزدوجة',
        text: 'يدعم النظام التبديل السريع بين الخصم المئوي (%) والخصم المقطوع المباشر بالدينار (د.ل) مع التحقق الأوتوماتيكي وحساب الضريبة والإجمالي لحظياً.'
      },
      {
        heading: '3. تعدد طرق السداد (نقدي / بطاقة / تحويل / دين آجل)',
        text: 'اختر طريقة السداد: نقدي، بطاقة مصرفية، تحويل، أو "دين (آجل)" حيث يتم اختيار العميل وترحيل المبلغ المتبقي آلياً لحساب ديونه مع تحديث كشف حسابه.'
      },
      {
        heading: '4. الحفظ والطباعة الفورية (F3)',
        text: 'بمجرد النقر على "حفظ وطباعة" (أو اختصار F3)، يخرج الإيصال الحراري فوراً وتُخصم الكميات من المخزون ويُسجل صافي الربح في النظام.'
      }
    ],
    tips: '⚡ اختصارات الكاشير: F1 للبحث والباركود، F3 للحفظ والطباعة السريعة، F4 لتفريغ السلة.'
  },
  {
    id: 5,
    title: 'المرحلة 5: مبيعات الأونلاين والتوصيل والشحن',
    subtitle: 'تتبع طلبيات التوصيل لجميع المدن والمناطق وتسوية حسابات شركات الشحن',
    icon: Smartphone,
    badge: 'الشحن والتوصيل',
    steps: [
      {
        heading: '1. تسجيل طلبية أونلاين',
        text: 'في قسم "أونلاين"، أدخل اسم العميل، رقم هاتفه، المدينة (طرابلس، بنغازي، مصراتة، الزاوية، وغيرها)، تكلفة الشحن، والمنتجات المطلوبة.'
      },
      {
        heading: '2. نافذة التعديل المرنة (30 ساعة)',
        text: 'يتيح النظام فترة سماح مدتها 30 ساعة لتعديل تفاصيل الطلب أو أصنافه أو إلغائه قبل إتمام تسليمه لشركة التوصيل.'
      },
      {
        heading: '3. متابعة التحصيل وتسوية حسابات المندوبين',
        text: 'تتبع حالة الشحنات (قيد التجهيز، خرجت للتوصيل، تم التسليم) وتوثيق استلام المبالغ من شركات الشحن وتحديث الإيرادات.'
      }
    ],
    tips: '🚚 تلميح: تظهر فواتير الأونلاين بتبويب مستقل في مركز الفواتير والمرتجعات لتفادي اختلاطها بمبيعات المحل المباشرة.'
  },
  {
    id: 6,
    title: 'المرحلة 6: إدارة المرتجعات واسترجاع الفواتير',
    subtitle: 'استرجاع فواتير المحل والأونلاين جزئياً أو كلياً وإعادة الكميات للمخزون آلياً',
    icon: Undo2,
    badge: 'المرتجعات',
    steps: [
      {
        heading: '1. البحث عن الفاتورة الأصلية',
        text: 'في قسم "المرتجعات"، اختر تبويب "فواتير المحل (POS)" أو "فواتير الأونلاين"، وابحث برقم الفاتورة أو اسم العميل لاستعراض أصنافها.'
      },
      {
        heading: '2. تحديد الأصناف والكميات المسترجعة',
        text: 'حدد الصنف والكمية المراد استرجاعها سواء كان استرجاعاً كلياً للفاتورة أو جزئياً لبعض الأصناف فقط مع ذكر سبب الإرجاع.'
      },
      {
        heading: '3. إعادة المخزون وتحديث الأرباح',
        text: 'يقوم النظام تلقائياً بإعادة الكميات المستلمة إلى رصيد المخزون، وخصم قيمة المرتجع وأرباحه من تقارير اليومية وتعديل الحسابات المالية فوراً.'
      }
    ],
    tips: '🛡️ سياسة الإرجاع: تضمن المنظومة حماية التاجر بالتأكد من صلاحية الفاتورة وعدم تكرار استرجاع الصنف ذاته أكثر من مرة.'
  },
  {
    id: 7,
    title: 'المرحلة 7: مختبر تركيب العطور والخلطات الخاصة (Perfume Mix Lab)',
    subtitle: 'تصنيع خلطات عطرية مخصصة، حساب نسب الزيت والكحول، وحسم المكونات آلياً',
    icon: FlaskConical,
    badge: 'مختبر التركيب',
    steps: [
      {
        heading: '1. اختيار حجم العبوة والزجاجة',
        text: 'ادخل لقسم "المختبر" وحدد حجم الزجاجة المراد تركيبها (مثل: 30ml، 50ml، أو 100ml) من المخزون.'
      },
      {
        heading: '2. دمج الزيوت العطرية والكحول',
        text: 'أضف الزيوت العطرية بنسبها المحددة بالملليتر أو النسبة المئوية (مثل 30% مسك + 20% لافندر)، وأضف الكحول الإيثيلي المقطر لإكمال الحجم.'
      },
      {
        heading: '3. حساب التكلفة الآلي وتحديد سعر البيع',
        text: 'يحسب النظام تكلفة المللي لكل زيت مضاف + تكلفة الكحول + سعر الزجاجة، ويقترح سعر البيع بناءً على هامش الربح المطلوب.'
      },
      {
        heading: '4. الخصم الآلي من المخزون عند البيع',
        text: 'عند اعتماد وحفظ التركيبة وبيعها في الكاشير، يخصم النظام كميات الزيوت بالمللي والكحول والزجاجة الفارغة مباشرة من أرصدة المخزون.'
      }
    ],
    tips: '🧪 تلميح: يمكنك حفظ الوصفات الناجحة في المختبر لإعادة تركيبها للعملاء لاحقاً بنفس الجودة والنسب.'
  },
  {
    id: 8,
    title: 'المرحلة 8: إغلاق الوردية واليومية وتسوية الخزينة (Shift Close)',
    subtitle: 'مطابقة النقدية في الدرج مع الحركة الدفترية، كشف الفوارق، وحفظ الإغلاق',
    icon: Lock,
    badge: 'تسوية النقدية',
    steps: [
      {
        heading: '1. عد النقدية الفعلية في الدرج',
        text: 'في نهاية دوام الكاشير أو نهاية اليوم، ادخل لقسم "إغلاق الوردية" وأدخل اسم الكاشير والنقد الفعلي المعدود في الدرج.'
      },
      {
        heading: '2. حساب النقد المتوقع آلياً',
        text: 'يجمع النظام تلقائياً: (المبيعات النقدية + الضخ الرأسمالي) - (السحوبات النقدية والمصاريف) = النقد المتوقع وجوده في الخزينة.'
      },
      {
        heading: '3. كشف فارق التسوية (مطابقة / عجز / فائض)',
        text: 'يقارن النظام بين الفعلي والمتوقع: إذا تطابقا يظهر "متطابق تماماً"، وإذا كان هناك فرق يظهر "فائض نقدي" باللون الأخضر أو "عجز نقدي" باللون الأحمر.'
      },
      {
        heading: '4. حفظ وإغلاق الوردية نهائياً وطباعة الإيصال',
        text: 'اضغط على زر "🔒 حفظ وإغلاق الوردية نهائياً" ليتم توثيق التقرير المالي في سجل الورديات الدائم وطباعة سند تسوية معتمد.'
      }
    ],
    tips: '📊 تلميح: يمكنك استعراض وطباعة أي تقرير وردية سابقة في أي وقت من تبويب "سجل الورديات السابقة".'
  },
  {
    id: 9,
    title: 'المرحلة 9: الجرد الفعلي للمخزون وتسوية الفوارق (Stocktaking)',
    subtitle: 'التحقق الدوري من مطابقة المخزون الفعلي مع الدفتري ومعالجة التوالف والفوارق',
    icon: Layers,
    badge: 'الجرد الدوري',
    steps: [
      {
        heading: '1. اختيار نمط وفترة الجرد',
        text: 'من قسم "المخزون"، ادخل لتبويب "الجرد" واختر نوع الجرد: جرد شامل لكامل المحل، أو جرد لتصنيف محدد (مثل الزيوت فقط أو العطور الشرقية).'
      },
      {
        heading: '2. مسح الباركود وعد الكميات الفعلية',
        text: 'مرر قارئ الباركود على المنتجات الموجودة فعلياً على الرفوف وأدخل الكميات المعدودة يدوياً.'
      },
      {
        heading: '3. حصر الفوارق وتسجيل التوالف والخسائر',
        text: 'يقارن النظام بين الكميات المسجلة والفعلية: في حال وجود نقص (كسر زجاجة، عطر تالف، أو فقد)، يتم تسجيله واعتماده ونقله تلقائياً لقسم "الخسائر" لتوثيقه محاسبياً.'
      },
      {
        heading: '4. اعتماد الجرد وتحديث الأرصدة الدفترية',
        text: 'بالضغط على "اعتماد التسوية"، تصبح الأرقام الدفترية مطابقة 100% للواقع الفعلي، ويكون المحل جاهزاً لدورة عمل جديدة دقيقة.'
      }
    ],
    tips: '🔍 تلميح: يفضل إجراء الجرد الدوري في أوقات هدوء المبيعات أو بعد إغلاق الوردية لضمان ثبات الأرقام أثناء العد.'
  },
  {
    id: 10,
    title: 'المرحلة 10: ماذا يعني ترحيل المنظومة؟ وماذا يحدث بعد الجرد والترحيل؟',
    subtitle: 'مفهوم أرشفة وترحيل البيانات القديمة، وتصفية السجلات مع الحفاظ على الأرصدة الافتتاحية',
    icon: Database,
    badge: 'الترحيل والأرشفة',
    steps: [
      {
        heading: '1. ما هو ترحيل المنظومة (Data Archiving & Migration)؟',
        text: 'مع مرور الوقت وتراكم آلاف الفواتير والعمليات القديمة، يزداد حجم قاعدة البيانات. "الترحيل" هو استخراج نسخة مؤرشفة مستقلة ومضغوطة من الفواتير والعمليات المنتهية السابقة وحفظها في ملف أرشيف آمن، ثم تفريغ مساحة القرص وتخفيف الحمل على النظام ليظل فائق السرعة وخفيفاً.'
      },
      {
        heading: '2. ماذا يحدث بعد الجرد والترحيل؟ (مرحلة ما بعد الترحيل)',
        text: 'بعد ترحيل الفترة السابقة: (أ) تظل كميات المخزون الفعلية الناتجة عن الجرد، وأسعار المنتجات وتصنيفاتها، وبيانات ديون العملاء محفوظة 100% وتعتبر "أرصدة افتتاحية" للمرحلة الجديدة. (ب) يتم تصفير حركات المبيعات المنتهية المنقولة للأرشيف لتبدأ المنظومة صفحة عمل جديدة سريعة وخفيفة.'
      },
      {
        heading: '3. استعراض الأرشيف في أي وقت دون أي فقدان',
        text: 'لا يُحذف أي سجل تجاري نهائياً؛ حيث يمكنك في أي لحظة الدخول لتبويب "الترحيل وصيانة المنظومة" واستعراض كافة الفواتير والسجلات والتقارير التاريخية التي تم ترحيلها بكل تفاصيلها الأصلية.'
      }
    ],
    tips: '⭐ قاعدة ذهبية: الترحيل لا يحذف أصناف المخزون ولا ديون العملاء، بل ينقل فقط الفواتير القديمة المكتملة إلى الأرشيف التاريخي لتسريع النظام.'
  },
  {
    id: 11,
    title: 'المرحلة 11: الأمان، النسخ الاحتياطي التلقائي، والتحديثات الخفيفة',
    subtitle: 'العمل 100% دون إنترنت، النسخ الاحتياطي اليومي، وحماية البيانات أثناء التحديثات',
    icon: Shield,
    badge: 'الأمان والنسخ',
    steps: [
      {
        heading: '1. العمل دون إنترنت (100% Offline Architecture)',
        text: 'كافة أقسام المنظومة الـ 18، وقاعدة بيانات SQLite، وإصدار الإيصالات، والطباعة، وإغلاق الوردية تعمل محلياً على جهازك دون الحاجة لأي اتصال بالإنترنت.'
      },
      {
        heading: '2. النسخ الاحتياطي اليومي التلقائي',
        text: 'تقوم المنظومة تلقائياً بعمل لقطة احتياطية يومية من قاعدة البيانات وحفظها في مجلد backups لحماية كافة بياناتك من أي طارئ.'
      },
      {
        heading: '3. التحديثات الخفيفة والآمنة (Zero Data Loss Updates)',
        text: 'عند إصدار ميزات وتحسينات جديدة، يتم تحديث أكواد وواجهات النظام ومخططات الجداول بشكل غير مدمر، دون المساس إطلاقاً بقاعدة بياناتك أو تعديل أي سجلات حقيقية تخص تجارتك.'
      }
    ],
    tips: '🔒 أمان تام: يمكنك في أي وقت تصدير نسخة احتياطية إضافية يدوياً وحفظها على قرص خارجي أو فلاش ميموري من تبويب الصيانة.'
  }
];

const SettingsModule = () => {
  const { showSuccess, showError, showWarning, showInfo } = useUIStore();
  const { labels: customLabels, setLabel, setAllLabels, resetLabels } = useLabelsStore();

  const [activeTab, setActiveTab] = useState('guide'); // 'guide' | 'print' | 'labels' | 'archive' | 'ai_updates'
  const [openGuideStage, setOpenGuideStage] = useState(1);
  const [guideSearchTerm, setGuideSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // ----------------------------------------------------
  // SECTION 1: Print & Template Settings State
  // ----------------------------------------------------
  const [printSettings, setPrintSettings] = useState(DEFAULT_PRINT_SETTINGS);
  const fileInputRef = useRef(null);

  // ----------------------------------------------------
  // SECTION 2: Label Customizer State
  // ----------------------------------------------------
  const [editableLabels, setEditableLabels] = useState({ ...customLabels });

  // ----------------------------------------------------
  // SECTION 3: Archiving & Maintenance State
  // ----------------------------------------------------
  const [cutoffYear, setCutoffYear] = useState('2024');
  const [customCutoffDate, setCustomCutoffDate] = useState('');
  const [archiving, setArchiving] = useState(false);
  const [shrinking, setShrinking] = useState(false);
  const [purgingCache, setPurgingCache] = useState(false);
  const [archivesList, setArchivesList] = useState([]);
  const [selectedArchive, setSelectedArchive] = useState(null);
  const [archiveViewerOpen, setArchiveViewerOpen] = useState(false);
  const [confirmShrinkOpen, setConfirmShrinkOpen] = useState(false);

  // ----------------------------------------------------
  // SECTION 4: AI & Auto-Updater State
  // ----------------------------------------------------
  const [aiProvider, setAiProvider] = useState('gemini');
  const [aiModel, setAiModel] = useState('gemini-2.0-flash');
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showOpenAiKey, setShowOpenAiKey] = useState(false);

  // Sandbox Demo Data State
  const [sandboxActive, setSandboxActive] = useState(false);
  const [togglingSandbox, setTogglingSandbox] = useState(false);

  // Updater
  const [appVersion, setAppVersion] = useState('2.3.3');
  const [ghToken, setGhToken] = useState('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');
  const [showGhToken, setShowGhToken] = useState(false);
  const [updateStatus, setUpdateStatus] = useState({ status: 'idle', message: '' });
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [downloadingUpdate, setDownloadingUpdate] = useState(false);

  // Safe IPC invoke helper
  const invokeIpc = useCallback(async (channel, payload) => {
    try {
      if (typeof window !== 'undefined' && window.require) {
        const { ipcRenderer } = window.require('electron');
        return await ipcRenderer.invoke(channel, payload);
      }
      return { success: false, error: 'Electron IPC not available in this environment' };
    } catch (e) {
      console.error(`IPC error on ${channel}:`, e);
      return { success: false, error: e.message };
    }
  }, []);

  // ----------------------------------------------------
  // Load All Persisted Settings
  // ----------------------------------------------------
  const loadAllSettings = useCallback(async () => {
    setLoading(true);
    try {
      const allRows = await settingsRepo.getAllSettings();
      const settingsMap = {};
      allRows.forEach((r) => {
        settingsMap[r.key] = r.value;
      });

      // Load Print Settings
      setPrintSettings({
        printMode: settingsMap['print_mode'] || DEFAULT_PRINT_SETTINGS.printMode,
        storeName: settingsMap['store_name'] || DEFAULT_PRINT_SETTINGS.storeName,
        storeSubtitle: settingsMap['store_subtitle'] || DEFAULT_PRINT_SETTINGS.storeSubtitle,
        storePhone: settingsMap['store_phone'] || DEFAULT_PRINT_SETTINGS.storePhone,
        storeAddress: settingsMap['store_address'] || DEFAULT_PRINT_SETTINGS.storeAddress,
        receiptGreeting: settingsMap['receipt_greeting'] || DEFAULT_PRINT_SETTINGS.receiptGreeting,
        receiptPolicy: settingsMap['receipt_policy'] || DEFAULT_PRINT_SETTINGS.receiptPolicy,
        showLogo: settingsMap['show_logo'] !== undefined ? settingsMap['show_logo'] === 'true' : DEFAULT_PRINT_SETTINGS.showLogo,
        showBarcode: settingsMap['show_barcode'] !== undefined ? settingsMap['show_barcode'] === 'true' : DEFAULT_PRINT_SETTINGS.showBarcode,
        showCashier: settingsMap['show_cashier'] !== undefined ? settingsMap['show_cashier'] === 'true' : DEFAULT_PRINT_SETTINGS.showCashier,
        showPhone: settingsMap['show_phone'] !== undefined ? settingsMap['show_phone'] === 'true' : DEFAULT_PRINT_SETTINGS.showPhone,
        logoBase64: settingsMap['logo_base64'] || ''
      });

      // Load AI Settings
      if (settingsMap['gemini_api_key']) setGeminiApiKey(settingsMap['gemini_api_key']);
      if (settingsMap['openai_api_key']) setOpenaiApiKey(settingsMap['openai_api_key']);
      if (settingsMap['ai_provider']) setAiProvider(settingsMap['ai_provider']);
      if (settingsMap['ai_model']) setAiModel(settingsMap['ai_model']);

      // Load Updater Settings
      if (settingsMap['github_token']) setGhToken(settingsMap['github_token']);

      // Load Version
      const verRes = await invokeIpc('updater:get-version');
      if (verRes?.success && verRes.version) {
        setAppVersion(verRes.version);
      }

      // Load Archives List & Sandbox status
      loadArchives();
      checkSandbox();
    } catch (error) {
      showError('خطأ أثناء تحميل الإعدادات: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [showError, invokeIpc]);

  useEffect(() => {
    loadAllSettings();
    setEditableLabels({ ...customLabels });
  }, [loadAllSettings, customLabels]);

  // Setup updater event listeners
  useEffect(() => {
    if (typeof window !== 'undefined' && window.require) {
      try {
        const { ipcRenderer } = window.require('electron');
        const handleStatus = (event, data) => {
          setUpdateStatus(data);
          if (data.status === 'available') {
            showInfo('يوجد تحديث جديد متاح للتحميل!');
          } else if (data.status === 'downloaded') {
            showSuccess('تم تحميل التحديث بنجاح. جاهز للتثبيت.');
          } else if (data.status === 'not-available') {
            showSuccess('المنظومة محدثة إلى آخر إصدار.');
          } else if (data.status === 'error') {
            showError('خطأ في التحديث: ' + data.error);
          }
        };

        const handleProgress = (event, progress) => {
          setDownloadProgress(progress);
        };

        ipcRenderer.on('update-status', handleStatus);
        ipcRenderer.on('update-download-progress', handleProgress);

        return () => {
          ipcRenderer.removeListener('update-status', handleStatus);
          ipcRenderer.removeListener('update-download-progress', handleProgress);
        };
      } catch (e) {
        console.warn('IPC listener error:', e);
      }
    }
  }, [showInfo, showSuccess, showError]);

  // ----------------------------------------------------
  // PRINT HANDLERS
  // ----------------------------------------------------
  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      showWarning('حجم الصورة كبير جداً، يرجى اختيار صورة أقل من 2 ميجابايت');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setPrintSettings((prev) => ({ ...prev, logoBase64: reader.result }));
      showSuccess('تم تحميل الشعار بنجاح');
    };
    reader.readAsDataURL(file);
  };

  const handleSavePrintSettings = async () => {
    setSaving(true);
    try {
      await Promise.all([
        settingsRepo.setSetting('print_mode', printSettings.printMode),
        settingsRepo.setSetting('store_name', printSettings.storeName),
        settingsRepo.setSetting('store_subtitle', printSettings.storeSubtitle),
        settingsRepo.setSetting('store_phone', printSettings.storePhone),
        settingsRepo.setSetting('store_address', printSettings.storeAddress),
        settingsRepo.setSetting('receipt_greeting', printSettings.receiptGreeting),
        settingsRepo.setSetting('receipt_policy', printSettings.receiptPolicy),
        settingsRepo.setSetting('show_logo', String(printSettings.showLogo)),
        settingsRepo.setSetting('show_barcode', String(printSettings.showBarcode)),
        settingsRepo.setSetting('show_cashier', String(printSettings.showCashier)),
        settingsRepo.setSetting('show_phone', String(printSettings.showPhone)),
        settingsRepo.setSetting('logo_base64', printSettings.logoBase64 || '')
      ]);
      showSuccess('تم حفظ إعدادات وقوالب الطباعة بنجاح');
    } catch (error) {
      showError('فشل حفظ إعدادات الطباعة: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTestThermalPrint = async () => {
    try {
      showInfo('جاري إرسال الفاتورة التجريبية إلى الطابعة الحرارية...');
      const res = await invokeIpc('print:test-thermal', {
        title: printSettings.storeName,
        subtitle: printSettings.storeSubtitle,
        phone: printSettings.storePhone,
        address: printSettings.storeAddress,
        greeting: printSettings.receiptGreeting,
        policy: printSettings.receiptPolicy,
        showLogo: printSettings.showLogo,
        showBarcode: printSettings.showBarcode,
        showCashier: printSettings.showCashier,
        showPhone: printSettings.showPhone,
        logoBase64: printSettings.logoBase64
      });
      if (res?.success) {
        showSuccess('تمت المعالجة بنجاح');
      } else {
        showError('فشل في الطباعة: ' + (res?.error || 'خطأ غير معروف'));
      }
    } catch (error) {
      showError('خطأ أثناء الطباعة التجريبية: ' + error.message);
    }
  };

  const handleTestPdfExport = async () => {
    try {
      showInfo('جاري تصدير ومعاينة مستند A4 التجريبي...');
      const res = await invokeIpc('print:test-pdf', {
        title: printSettings.storeName,
        subtitle: printSettings.storeSubtitle,
        phone: printSettings.storePhone,
        address: printSettings.storeAddress,
        greeting: printSettings.receiptGreeting,
        policy: printSettings.receiptPolicy,
        showLogo: printSettings.showLogo,
        logoBase64: printSettings.logoBase64
      });
      if (res?.success) {
        showSuccess('تم تصدير المستند التجريبي بنجاح');
      } else {
        showError('فشل في التصدير: ' + (res?.error || 'خطأ غير معروف'));
      }
    } catch (error) {
      showError('خطأ أثناء تصدير مستند A4: ' + error.message);
    }
  };

  // ----------------------------------------------------
  // LABEL HANDLERS
  // ----------------------------------------------------
  const handleSaveLabels = async () => {
    setSaving(true);
    try {
      setAllLabels(editableLabels);
      await settingsRepo.setSetting('custom_labels', JSON.stringify(editableLabels));
      showSuccess('تم تطبيق وحفظ مسميات التبويبات بنجاح');
    } catch (error) {
      showError('فشل حفظ المسميات: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleResetLabels = async () => {
    resetLabels();
    setEditableLabels({ ...DEFAULT_MODULE_LABELS });
    await settingsRepo.deleteSetting('custom_labels');
    showSuccess('تمت استعادة المسميات الافتراضية');
  };

  // ----------------------------------------------------
  // ARCHIVING & MAINTENANCE HANDLERS
  // ----------------------------------------------------
  const loadArchives = async () => {
    const res = await invokeIpc('archive:list');
    if (res?.success && res.archives) {
      setArchivesList(res.archives);
    }
  };

  const handleExportArchive = async () => {
    setArchiving(true);
    try {
      const res = await invokeIpc('archive:export', {
        cutoffYear,
        cutoffDate: customCutoffDate || undefined
      });
      if (res?.success) {
        showSuccess(`تم ترحيل البيانات بنجاح إلى الملف:\n${res.file}`);
        loadArchives();
      } else {
        showError('فشل ترحيل البيانات: ' + (res?.error || 'خطأ غير معروف'));
      }
    } catch (error) {
      showError('خطأ أثناء الترحيل: ' + error.message);
    } finally {
      setArchiving(false);
    }
  };

  const handleShrinkDatabase = async () => {
    setShrinking(true);
    setConfirmShrinkOpen(false);
    try {
      const res = await invokeIpc('archive:shrink', {
        cutoffYear,
        cutoffDate: customCutoffDate || undefined
      });
      if (res?.success) {
        showSuccess(`تم تنظيف وحذف السجلات وتفريغ مساحة القرص بنجاح (VACUUM & Optimize).`);
      } else {
        showError('فشل تنظيف قاعدة البيانات: ' + (res?.error || 'خطأ غير معروف'));
      }
    } catch (error) {
      showError('خطأ أثناء التفريغ: ' + error.message);
    } finally {
      setShrinking(false);
    }
  };

  const checkSandbox = useCallback(async () => {
    try {
      const active = await SandboxEngine.isSandboxActive();
      setSandboxActive(active);
    } catch (e) {}
  }, []);

  const handleToggleSandbox = async () => {
    setTogglingSandbox(true);
    try {
      if (sandboxActive) {
        await SandboxEngine.purgeDemoData();
        setSandboxActive(false);
        showSuccess('✅ تم إيقاف وضع التجربة وحذف كافة السجلات الوهمية بأمان.');
      } else {
        await SandboxEngine.seedDemoData();
        setSandboxActive(true);
        showSuccess('✅ تم تفعيل وضع التجربة وزراعة بيانات وهمية واقعية للمنظومة.');
      }
      await loadAllSettings();
    } catch (err) {
      showError(`خطأ في وضع التجربة: ${err.message}`);
    } finally {
      setTogglingSandbox(false);
    }
  };

  const handlePurgeCache = async () => {
    setPurgingCache(true);
    try {
      const res = await invokeIpc('system:purge-cache');
      if (res?.success) {
        showSuccess('تم مسح ملفات الكاش المؤقتة بأمان مع حماية قاعدة البيانات.');
      } else {
        showError('فشل مسح الكاش: ' + (res?.error || ''));
      }
    } catch (error) {
      showError('خطأ أثناء مسح الكاش: ' + error.message);
    } finally {
      setPurgingCache(false);
    }
  };

  const handleViewArchive = async (archive) => {
    try {
      const res = await invokeIpc('archive:view', { archiveFile: archive.filePath });
      if (res?.success && res.data) {
        setSelectedArchive(res.data);
        setArchiveViewerOpen(true);
      } else {
        showError('تعذر قراءة ملف الأرشيف: ' + (res?.error || ''));
      }
    } catch (error) {
      showError('خطأ أثناء استعراض الأرشيف: ' + error.message);
    }
  };

  // ----------------------------------------------------
  // AI & UPDATER HANDLERS
  // ----------------------------------------------------
  const handleSaveAiSettings = async () => {
    setSaving(true);
    try {
      await Promise.all([
        settingsRepo.setSetting('ai_provider', aiProvider),
        settingsRepo.setSetting('ai_model', aiModel),
        settingsRepo.setSetting('gemini_api_key', geminiApiKey),
        settingsRepo.setSetting('openai_api_key', openaiApiKey)
      ]);
      showSuccess('تم حفظ إعدادات الذكاء الاصطناعي بنجاح');
    } catch (error) {
      showError('فشل حفظ إعدادات AI: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveUpdaterToken = async () => {
    try {
      await settingsRepo.setSetting('github_token', ghToken);
      await invokeIpc('updater:set-token', { token: ghToken });
      showSuccess('تم حفظ رمز الوصول للـ GitHub بنجاح');
    } catch (error) {
      showError('خطأ في حفظ الرمز: ' + error.message);
    }
  };

  const handleCheckUpdates = async () => {
    setCheckingUpdates(true);
    try {
      showInfo('جاري الاتصال بمستودع GitHub للتحقق من التحديثات...');
      const res = await invokeIpc('updater:check', { token: ghToken });
      if (res?.success) {
        // Status handled by update-status event
      } else {
        showError('فشل التحقق من التحديثات: ' + (res?.error || ''));
      }
    } catch (error) {
      showError('خطأ في الاتصال: ' + error.message);
    } finally {
      setCheckingUpdates(false);
    }
  };

  const handleDownloadUpdate = async () => {
    setDownloadingUpdate(true);
    try {
      showInfo('جاري بدء تحميل التحديث...');
      const res = await invokeIpc('updater:download');
      if (!res?.success) {
        showError('فشل بدء التحميل: ' + (res?.error || ''));
        setDownloadingUpdate(false);
      }
    } catch (error) {
      showError('خطأ أثناء التحميل: ' + error.message);
      setDownloadingUpdate(false);
    }
  };

  const handleInstallUpdate = async () => {
    try {
      await invokeIpc('updater:install');
    } catch (error) {
      showError('خطأ أثناء التثبيت: ' + error.message);
    }
  };

  // Tab configurations
  const TABS = [
    { id: 'guide', label: '📘 كيف تعمل المنظومة؟ (دليل دورة الحياة)', icon: BookOpen },
    { id: 'print', label: 'استوديو وقوالب الطباعة', icon: Printer },
    { id: 'labels', label: 'التعديل الحر للمسميات', icon: Type },
    { id: 'archive', label: 'الترحيل وصيانة المنظومة', icon: Database },
    { id: 'ai_updates', label: 'المستشار الذكي والتحديثات', icon: Sparkles }
  ];

  return (
    <div className="h-full flex flex-col gap-5 overflow-hidden">
      {/* Header & Sub-Navigation */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-[#e6edf3] flex items-center gap-2.5">
            <Sliders className="w-7 h-7 text-[#fbbf24]" />
            لوحة الإعدادات وتخصيص المنظومة
          </h1>
          <p className="text-xs text-[#768390] mt-1">
            إدارة الطباعة الحرارية والمستندات، تخصيص واجهة المستخدم، ترحيل البيانات، ومزامنة التحديثات
          </p>
        </div>

        {/* Sub-tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-[#161b22] border border-white/10 rounded-xl">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-l from-[#fbbf24] to-[#f59e0b] text-[#0d1117] shadow-[0_0_12px_rgba(251,191,36,0.35)]'
                    : 'text-[#adbac7] hover:text-[#e6edf3] hover:bg-white/5'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1">
        <AnimatePresence mode="wait">
          {/* ========================================================================= */}
          {/* TAB 0: COMPREHENSIVE ERP LIFECYCLE GUIDE (كيف تعمل المنظومة؟) */}
          {/* ========================================================================= */}
          {activeTab === 'guide' && (
            <motion.div
              key="guide-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="space-y-6 pb-8"
            >
              {/* Hero Banner */}
              <div className="glass-card p-6 border border-amber-500/30 bg-gradient-to-l from-amber-500/10 via-[#161b22] to-[#0d1117] rounded-3xl shadow-xl">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center font-bold text-2xl shadow-lg shrink-0">
                      📘
                    </div>
                    <div>
                      <h2 className="text-xl font-extrabold text-[#e6edf3] flex items-center gap-2">
                        دليل دورة حياة منظومة الدفة للعطور
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          11 مرحلة متسلسلة
                        </span>
                      </h2>
                      <p className="text-xs text-[#adbac7] mt-1 leading-relaxed max-w-3xl">
                        دليل تفاعلي شامل يشرح بالتفصيل دورة العمل اليومية والسنوية: من التهيئة الأولية وإضافة المخزون والباركود، إلى البيع والكاشير، والمشتريات، وإغلاق الوردية، والجرد الفعلي، وماذا يعني ترحيل المنظومة وما بعد الجرد.
                      </p>
                    </div>
                  </div>

                  {/* Search Bar */}
                  <div className="relative w-full md:w-72 shrink-0">
                    <input
                      type="text"
                      placeholder="بحث في مواضيع وشروحات الدليل..."
                      value={guideSearchTerm}
                      onChange={(e) => setGuideSearchTerm(e.target.value)}
                      className="w-full bg-[#0d1117] border border-amber-500/30 rounded-full px-4 py-2 text-xs text-[#e6edf3] focus:border-amber-400 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Quick Stage Pills */}
                <div className="mt-5 pt-4 border-t border-white/10 flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar text-xs">
                  <span className="text-gray-400 font-bold shrink-0 ml-1">الانتقال السريع:</span>
                  {GUIDE_STAGES.map((stg) => (
                    <button
                      key={stg.id}
                      type="button"
                      onClick={() => setOpenGuideStage(stg.id)}
                      className={`px-3 py-1 rounded-full text-[11px] font-bold shrink-0 transition-all cursor-pointer ${
                        openGuideStage === stg.id
                          ? 'bg-amber-500 text-slate-950 shadow-md'
                          : 'bg-[#0d1117] text-gray-300 border border-white/10 hover:border-amber-500/40'
                      }`}
                    >
                      {stg.id}. {stg.badge}
                    </button>
                  ))}
                </div>
              </div>

              {/* Lifecycle Stages Cards */}
              <div className="space-y-4">
                {GUIDE_STAGES.filter((stg) => {
                  if (!guideSearchTerm.trim()) return true;
                  const term = guideSearchTerm.toLowerCase();
                  return (
                    stg.title.toLowerCase().includes(term) ||
                    stg.subtitle.toLowerCase().includes(term) ||
                    stg.steps.some(
                      (s) =>
                        s.heading.toLowerCase().includes(term) ||
                        s.text.toLowerCase().includes(term)
                    ) ||
                    stg.tips.toLowerCase().includes(term)
                  );
                }).map((stage) => {
                  const isOpen = openGuideStage === stage.id;
                  const StageIcon = stage.icon;

                  return (
                    <div
                      key={stage.id}
                      className={`glass-card rounded-2xl border transition-all overflow-hidden ${
                        isOpen
                          ? 'border-amber-500/50 bg-[#161b22]/90 shadow-xl'
                          : 'border-white/10 bg-[#161b22]/50 hover:border-white/20'
                      }`}
                    >
                      {/* Stage Header Accordion Button */}
                      <button
                        type="button"
                        onClick={() => setOpenGuideStage(isOpen ? null : stage.id)}
                        className="w-full p-4 text-right flex items-center justify-between gap-4 cursor-pointer"
                      >
                        <div className="flex items-center gap-3.5">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 transition-all ${
                              isOpen
                                ? 'bg-amber-500 text-slate-950 shadow-md'
                                : 'bg-white/5 text-amber-400 border border-white/10'
                            }`}
                          >
                            <StageIcon className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-sm font-extrabold text-[#e6edf3]">{stage.title}</h3>
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/25">
                                {stage.badge}
                              </span>
                            </div>
                            <p className="text-xs text-[#768390] mt-0.5">{stage.subtitle}</p>
                          </div>
                        </div>

                        <div className="text-gray-400">
                          {isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                        </div>
                      </button>

                      {/* Stage Expanded Body */}
                      {isOpen && (
                        <div className="px-5 pb-5 pt-1 border-t border-white/10 space-y-4 text-xs animate-in fade-in duration-200">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-2">
                            {stage.steps.map((step, sIdx) => (
                              <div
                                key={sIdx}
                                className="p-4 rounded-xl bg-[#0d1117]/80 border border-white/5 hover:border-amber-500/20 transition-all space-y-2 flex flex-col justify-between"
                              >
                                <h4 className="font-bold text-amber-400 text-xs flex items-center gap-1.5">
                                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                  <span>{step.heading}</span>
                                </h4>
                                <p className="text-gray-300 text-[11px] leading-relaxed flex-1">
                                  {step.text}
                                </p>
                              </div>
                            ))}
                          </div>

                          {/* Pro-Tips Box */}
                          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2.5">
                            <span className="text-base shrink-0">💡</span>
                            <span className="leading-relaxed font-medium">{stage.tips}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ========================================================================= */}
          {/* TAB 1: PRINT & TEMPLATE STUDIO */}
          {/* ========================================================================= */}
          {activeTab === 'print' && (
            <motion.div
              key="print-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-6"
            >
              {/* Form Controls (7 cols) */}
              <div className="lg:col-span-7 flex flex-col gap-5">
                {/* Mode Selector */}
                <div className="glass-card p-5">
                  <h2 className="text-sm font-bold text-[#fbbf24] flex items-center gap-2 mb-3">
                    <Printer className="w-4 h-4" />
                    نمط الطباعة الافتراضي
                  </h2>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPrintSettings((p) => ({ ...p, printMode: 'thermal' }))}
                      className={`p-3.5 rounded-xl border flex items-center gap-3 transition-all ${
                        printSettings.printMode === 'thermal'
                          ? 'border-[#fbbf24] bg-[#fbbf24]/10 text-[#fbbf24]'
                          : 'border-white/10 bg-[#161b22] text-[#adbac7] hover:border-white/20'
                      }`}
                    >
                      <Printer className="w-5 h-5" />
                      <div className="text-right">
                        <div className="text-xs font-bold">طابعة حرارية (80mm)</div>
                        <div className="text-[10px] text-[#768390]">فواتير الكاشير السريعة ونقاط البيع</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPrintSettings((p) => ({ ...p, printMode: 'a4' }))}
                      className={`p-3.5 rounded-xl border flex items-center gap-3 transition-all ${
                        printSettings.printMode === 'a4'
                          ? 'border-[#fbbf24] bg-[#fbbf24]/10 text-[#fbbf24]'
                          : 'border-white/10 bg-[#161b22] text-[#adbac7] hover:border-white/20'
                      }`}
                    >
                      <FileText className="w-5 h-5" />
                      <div className="text-right">
                        <div className="text-xs font-bold">مستند A4 وتصدير PDF</div>
                        <div className="text-[10px] text-[#768390]">أوامر الشراء وتقارير الورديات الرسمية</div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Header & Contact Information */}
                <div className="glass-card p-5">
                  <h2 className="text-sm font-bold text-[#e6edf3] mb-4">بيانات الترويسة والتواصل</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-[#adbac7] mb-1.5">اسم المتجر / الشركة</label>
                      <input
                        type="text"
                        value={printSettings.storeName}
                        onChange={(e) => setPrintSettings({ ...printSettings, storeName: e.target.value })}
                        className="w-full bg-[#161b22] border border-white/10 rounded-lg px-3 py-2 text-xs text-[#e6edf3] focus:border-[#fbbf24] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#adbac7] mb-1.5">العنوان الفرعي / الوصف</label>
                      <input
                        type="text"
                        value={printSettings.storeSubtitle}
                        onChange={(e) => setPrintSettings({ ...printSettings, storeSubtitle: e.target.value })}
                        className="w-full bg-[#161b22] border border-white/10 rounded-lg px-3 py-2 text-xs text-[#e6edf3] focus:border-[#fbbf24] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#adbac7] mb-1.5">رقم الهاتف والتواصل</label>
                      <input
                        type="text"
                        value={printSettings.storePhone}
                        onChange={(e) => setPrintSettings({ ...printSettings, storePhone: e.target.value })}
                        className="w-full bg-[#161b22] border border-white/10 rounded-lg px-3 py-2 text-xs text-[#e6edf3] focus:border-[#fbbf24] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#adbac7] mb-1.5">العنوان والموقع</label>
                      <input
                        type="text"
                        value={printSettings.storeAddress}
                        onChange={(e) => setPrintSettings({ ...printSettings, storeAddress: e.target.value })}
                        className="w-full bg-[#161b22] border border-white/10 rounded-lg px-3 py-2 text-xs text-[#e6edf3] focus:border-[#fbbf24] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Footer & Policies */}
                <div className="glass-card p-5">
                  <h2 className="text-sm font-bold text-[#e6edf3] mb-4">التذييل والسياسات</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-[#adbac7] mb-1.5">عبارة الترحيب والشكر</label>
                      <input
                        type="text"
                        value={printSettings.receiptGreeting}
                        onChange={(e) => setPrintSettings({ ...printSettings, receiptGreeting: e.target.value })}
                        className="w-full bg-[#161b22] border border-white/10 rounded-lg px-3 py-2 text-xs text-[#e6edf3] focus:border-[#fbbf24] focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#adbac7] mb-1.5">سياسة الاستبدال والاسترجاع</label>
                      <textarea
                        rows={2}
                        value={printSettings.receiptPolicy}
                        onChange={(e) => setPrintSettings({ ...printSettings, receiptPolicy: e.target.value })}
                        className="w-full bg-[#161b22] border border-white/10 rounded-lg px-3 py-2 text-xs text-[#e6edf3] focus:border-[#fbbf24] focus:outline-none resize-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Visibility Toggles & Logo */}
                <div className="glass-card p-5">
                  <h2 className="text-sm font-bold text-[#e6edf3] mb-4">الشعار وخيارات العرض</h2>
                  
                  {/* Logo Selector (Dual: File + URL) */}
                  <div className="mb-5 space-y-3 bg-[#161b22] border border-white/5 p-3.5 rounded-xl">
                    <label className="block text-xs font-bold text-[#adbac7]">شعار المتجر (ملف محلي أو رابط مباشر):</label>
                    <div className="flex flex-wrap items-center gap-3">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="btn-secondary text-xs flex items-center gap-2"
                      >
                        <ImageIcon className="w-4 h-4 text-[#fbbf24]" />
                        اختيار ملف من الجهاز
                      </button>
                      <input
                        type="text"
                        placeholder="أو ضع رابط الشعار (https://...)"
                        value={printSettings.logoBase64?.startsWith('data:') ? '' : printSettings.logoBase64}
                        onChange={(e) => setPrintSettings((p) => ({ ...p, logoBase64: e.target.value }))}
                        className="flex-1 min-w-[200px] bg-[#0d1117] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-[#e6edf3] focus:border-[#fbbf24] focus:outline-none"
                        dir="ltr"
                      />
                      {printSettings.logoBase64 && (
                        <button
                          type="button"
                          onClick={() => setPrintSettings((p) => ({ ...p, logoBase64: '' }))}
                          className="text-xs text-[#ef4444] hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          حذف الشعار
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Switches */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { key: 'showLogo', label: 'إظهار الشعار' },
                      { key: 'showBarcode', label: 'إظهار الباركود' },
                      { key: 'showCashier', label: 'اسم الكاشير' },
                      { key: 'showPhone', label: 'هاتف المتجر' }
                    ].map((item) => (
                      <label
                        key={item.key}
                        className="flex items-center gap-2.5 p-2.5 bg-[#161b22] border border-white/5 rounded-lg cursor-pointer hover:border-white/15 transition-all"
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(printSettings[item.key])}
                          onChange={(e) => setPrintSettings({ ...printSettings, [item.key]: e.target.checked })}
                          className="w-4 h-4 rounded text-[#fbbf24] focus:ring-0 accent-[#fbbf24]"
                        />
                        <span className="text-xs font-semibold text-[#adbac7]">{item.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Save & Action Bar */}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSavePrintSettings}
                    disabled={saving}
                    className="btn-primary text-xs flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'جاري الحفظ...' : 'حفظ إعدادات الطباعة'}
                  </button>

                  <button
                    type="button"
                    onClick={handleTestThermalPrint}
                    className="btn-secondary text-xs flex items-center gap-2"
                  >
                    <Printer className="w-4 h-4 text-[#fbbf24]" />
                    طباعة تجريبية حرارية
                  </button>

                  <button
                    type="button"
                    onClick={handleTestPdfExport}
                    className="btn-secondary text-xs flex items-center gap-2"
                  >
                    <FileText className="w-4 h-4 text-[#38bdf8]" />
                    تصدير تجريبي A4 PDF
                  </button>
                </div>
              </div>

              {/* Live Preview Card (5 cols) */}
              <div className="lg:col-span-5 flex flex-col gap-4">
                <div className="glass-card p-5 sticky top-2">
                  <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2.5">
                    <h3 className="text-xs font-bold text-[#fbbf24] flex items-center gap-1.5">
                      <Eye className="w-4 h-4" />
                      معاينة حية للقالب ({printSettings.printMode === 'thermal' ? 'حراري 80mm' : 'مستند A4'})
                    </h3>
                    <span className="text-[10px] text-[#768390] bg-[#161b22] px-2 py-0.5 rounded border border-white/5">
                      تحديث فوري
                    </span>
                  </div>

                  {/* Simulated Receipt Container */}
                  <div className="bg-[#f9fafb] text-[#111827] rounded-xl p-4 shadow-xl font-mono text-[11px] leading-relaxed border border-gray-300 select-none max-h-[580px] overflow-y-auto custom-scrollbar">
                    {/* Logo area */}
                    {printSettings.showLogo && (
                      <div className="text-center mb-2">
                        {printSettings.logoBase64 ? (
                          <img
                            src={printSettings.logoBase64}
                            alt="Preview Logo"
                            className="max-h-12 mx-auto object-contain"
                          />
                        ) : (
                          <div className="inline-block bg-[#fbbf24] text-[#0d1117] font-bold px-3 py-1 rounded text-xs">
                            {printSettings.storeName}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="text-center font-bold text-sm text-black">{printSettings.storeName}</div>
                    {printSettings.storeSubtitle && (
                      <div className="text-center text-[9px] text-gray-600">{printSettings.storeSubtitle}</div>
                    )}
                    {printSettings.showPhone && printSettings.storePhone && (
                      <div className="text-center text-[10px] text-gray-700">📱 {printSettings.storePhone}</div>
                    )}
                    {printSettings.storeAddress && (
                      <div className="text-center text-[9px] text-gray-500">📍 {printSettings.storeAddress}</div>
                    )}

                    <div className="border-t border-dashed border-gray-400 my-2" />

                    <div className="flex justify-between text-[10px]">
                      <span>فاتورة: #INV-2026</span>
                      <span>{new Date().toLocaleDateString('ar-SD')}</span>
                    </div>
                    {printSettings.showCashier && (
                      <div className="flex justify-between text-[10px]">
                        <span>الكاشير:</span>
                        <span>المدير</span>
                      </div>
                    )}

                    <div className="border-t border-dashed border-gray-400 my-2" />

                    {/* Table items */}
                    <div className="space-y-1">
                      <div className="flex justify-between font-bold border-b border-gray-200 pb-1">
                        <span>الصنف</span>
                        <span>المجموع</span>
                      </div>
                      <div className="flex justify-between">
                        <span>عطر العود الملكي (50ml) x 1</span>
                        <span>15,000</span>
                      </div>
                      <div className="flex justify-between">
                        <span>زيت مسك الصندل (10ml) x 2</span>
                        <span>9,000</span>
                      </div>
                    </div>

                    <div className="border-t border-dashed border-gray-400 my-2" />

                    <div className="space-y-0.5 text-[10px]">
                      <div className="flex justify-between">
                        <span>المجموع الفرعي:</span>
                        <span>24,000 ج.س</span>
                      </div>
                      <div className="flex justify-between text-red-600">
                        <span>الخصم (10%):</span>
                        <span>-2,400 ج.س</span>
                      </div>
                      <div className="flex justify-between font-bold text-xs pt-1 text-black">
                        <span>الإجمالي النهائي:</span>
                        <span>21,600 ج.س</span>
                      </div>
                    </div>

                    {printSettings.showBarcode && (
                      <div className="text-center my-3 text-[9px] tracking-widest bg-gray-100 py-1 rounded">
                        ||| | ||||| ||| |||| |||| ||
                        <div>*ALDAFFA-2026*</div>
                      </div>
                    )}

                    {printSettings.receiptPolicy && (
                      <div className="text-[8px] text-gray-500 text-center mt-2 leading-normal">
                        {printSettings.receiptPolicy}
                      </div>
                    )}

                    {printSettings.receiptGreeting && (
                      <div className="text-center font-bold text-[10px] text-gray-800 mt-2">
                        {printSettings.receiptGreeting}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: DYNAMIC LABEL CUSTOMIZER */}
          {/* ========================================================================= */}
          {activeTab === 'labels' && (
            <motion.div
              key="labels-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col gap-5 pb-6"
            >
              <div className="glass-card p-5">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                  <div>
                    <h2 className="text-sm font-bold text-[#e6edf3] flex items-center gap-2">
                      <Type className="w-4 h-4 text-[#fbbf24]" />
                      وضع التعديل الحر للمسميات (Dynamic Navigation Labels)
                    </h2>
                    <p className="text-xs text-[#768390] mt-0.5">
                      يمكنك تعديل أسماء التبويبات والأقسام في الشريط العلوي لتناسب طبيعة عملك مع الحفظ التلقائي
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleResetLabels}
                      className="btn-secondary text-xs flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      استعادة الافتراضي
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveLabels}
                      disabled={saving}
                      className="btn-primary text-xs flex items-center gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" />
                      {saving ? 'جاري الحفظ...' : 'حفظ المسميات'}
                    </button>
                  </div>
                </div>

                {/* Grid of label editors */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {Object.entries(DEFAULT_MODULE_LABELS).map(([modId, defLabel]) => {
                    const currentVal = editableLabels[modId] ?? defLabel;
                    const isChanged = currentVal !== defLabel;

                    return (
                      <div
                        key={modId}
                        className={`p-3 bg-[#161b22] border rounded-xl flex items-center justify-between gap-3 transition-all ${
                          isChanged ? 'border-[#fbbf24]/50 bg-[#fbbf24]/5' : 'border-white/5'
                        }`}
                      >
                        <div className="shrink-0 text-right">
                          <span className="text-[11px] font-mono text-[#768390] block">{modId}</span>
                          <span className="text-xs font-bold text-[#adbac7]">{defLabel}</span>
                        </div>

                        <div className="flex-1">
                          <input
                            type="text"
                            value={currentVal}
                            onChange={(e) =>
                              setEditableLabels((prev) => ({
                                ...prev,
                                [modId]: e.target.value
                              }))
                            }
                            className="w-full bg-[#0d1117] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-[#e6edf3] font-bold focus:border-[#fbbf24] focus:outline-none text-left"
                            dir="rtl"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: DATA ARCHIVING & MAINTENANCE */}
          {/* ========================================================================= */}
          {activeTab === 'archive' && (
            <motion.div
              key="archive-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-6 pb-6"
            >
              {/* Archiving controls (7 cols) */}
              <div className="lg:col-span-7 flex flex-col gap-5">
                <div className="glass-card p-5">
                  <h2 className="text-sm font-bold text-[#fbbf24] flex items-center gap-2 mb-2">
                    <Database className="w-4 h-4" />
                    ترحيل البيانات القديمة (Data Archiving)
                  </h2>
                  <p className="text-xs text-[#768390] mb-4">
                    تصدير المبيعات والخسائر القديمة إلى ملف أرشيف آمن وتفريغ قاعدة البيانات لتسريع الأداء
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                    <div>
                      <label className="block text-xs font-bold text-[#adbac7] mb-1.5">
                        سنة الحد الفاصل (Cutoff Year)
                      </label>
                      <select
                        value={cutoffYear}
                        onChange={(e) => setCutoffYear(e.target.value)}
                        className="w-full bg-[#161b22] border border-white/10 rounded-lg px-3 py-2 text-xs text-[#e6edf3] focus:border-[#fbbf24] focus:outline-none"
                      >
                        <option value="2023">قبل 2023-01-01 (سجلات قديمة)</option>
                        <option value="2024">قبل 2024-01-01 (سجلات 2023 وما قبلها)</option>
                        <option value="2025">قبل 2025-01-01 (سجلات 2024 وما قبلها)</option>
                        <option value="2026">قبل 2026-01-01</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#adbac7] mb-1.5">
                        أو حدد تاريخاً فاصلاً مخصصاً
                      </label>
                      <input
                        type="date"
                        value={customCutoffDate}
                        onChange={(e) => setCustomCutoffDate(e.target.value)}
                        className="w-full bg-[#161b22] border border-white/10 rounded-lg px-3 py-2 text-xs text-[#e6edf3] focus:border-[#fbbf24] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleExportArchive}
                      disabled={archiving}
                      className="btn-primary text-xs flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      {archiving ? 'جاري تصدير الأرشيف...' : '1. تصدير وترحيل الأرشيف (JSON)'}
                    </button>

                    <button
                      type="button"
                      onClick={() => setConfirmShrinkOpen(true)}
                      disabled={shrinking}
                      className="btn-danger text-xs flex items-center gap-2 bg-[#ef4444]/20 border border-[#ef4444]/40 text-[#ef4444] hover:bg-[#ef4444]/30 px-4 py-2 rounded-lg font-bold"
                    >
                      <Trash2 className="w-4 h-4" />
                      {shrinking ? 'جاري التنظيف...' : '2. تفريغ وتنظيف المساحة (VACUUM)'}
                    </button>
                  </div>
                </div>

                {/* Cache purging and safe maintenance */}
                <div className="glass-card p-5">
                  <h2 className="text-sm font-bold text-[#e6edf3] flex items-center gap-2 mb-2">
                    <HardDrive className="w-4 h-4 text-[#38bdf8]" />
                    تنظيف الذاكرة المؤقتة (Safe Cache Cleaner)
                  </h2>
                  <p className="text-xs text-[#768390] mb-4">
                    مسح ملفات التخزين المؤقت لمتصفح Chromium (GPUCache, Code Cache) بأمان تام مع ضمان عدم المساس بقاعدة البيانات
                  </p>

                  <button
                    type="button"
                    onClick={handlePurgeCache}
                    disabled={purgingCache}
                    className="btn-secondary text-xs flex items-center gap-2"
                  >
                    <RefreshCw className={`w-4 h-4 text-[#38bdf8] ${purgingCache ? 'animate-spin' : ''}`} />
                    {purgingCache ? 'جاري تنظيف الكاش...' : 'تنظيف ملفات الكاش المؤقتة'}
                  </button>
                </div>

                {/* Sandbox Demo Data Mode */}
                <div className="glass-card p-5 border border-amber-500/20">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="text-sm font-bold text-[#e6edf3] flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[#fbbf24]" />
                      وضع تجربة المنظومة (بيانات وهمية)
                    </h2>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      sandboxActive
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-gray-700 text-gray-300'
                    }`}>
                      {sandboxActive ? 'الوضع التجريبي مفعّل' : 'الوضع الحقيقي'}
                    </span>
                  </div>
                  <p className="text-xs text-[#768390] mb-4">
                    زراعة منتجات، فواتير، وديون وهمية لتجربة كافة وظائف النظام بأمان، مع إمكانية حذفها بنقرة زر دون التأثير على البيانات الحقيقية.
                  </p>

                  <button
                    type="button"
                    onClick={handleToggleSandbox}
                    disabled={togglingSandbox}
                    className={`text-xs py-2 px-4 rounded-full font-bold transition-all flex items-center gap-2 cursor-pointer ${
                      sandboxActive
                        ? 'bg-red-600 hover:bg-red-700 text-white'
                        : 'btn-atelier-primary'
                    }`}
                  >
                    <Sparkles className="w-4 h-4" />
                    {togglingSandbox
                      ? 'جاري المعالجة...'
                      : sandboxActive
                      ? '🛑 إيقاف وضع التجربة وحذف البيانات الوهمية'
                      : '✨ تفعيل وضع التجربة وزراعة بيانات وهمية'}
                  </button>
                </div>
              </div>

              {/* Archives Browser (5 cols) */}
              <div className="lg:col-span-5 flex flex-col gap-4">
                <div className="glass-card p-5">
                  <div className="flex items-center justify-between mb-3 border-b border-white/10 pb-2.5">
                    <h3 className="text-xs font-bold text-[#e6edf3] flex items-center gap-1.5">
                      <FolderArchive className="w-4 h-4 text-[#fbbf24]" />
                      سجلات الأرشيف التاريخية ({archivesList.length})
                    </h3>
                    <button
                      type="button"
                      onClick={loadArchives}
                      className="p-1 rounded text-[#768390] hover:text-[#e6edf3]"
                      title="تحديث القائمة"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {archivesList.length === 0 ? (
                    <div className="text-center py-8 text-xs text-[#768390]">
                      لا توجد ملفات أرشيف محفوظة بعد.
                    </div>
                  ) : (
                    <div className="space-y-2.5 max-h-[460px] overflow-y-auto custom-scrollbar">
                      {archivesList.map((arch) => (
                        <div
                          key={arch.filename}
                          className="p-3 bg-[#161b22] border border-white/5 rounded-xl flex items-center justify-between gap-3 hover:border-white/15 transition-all"
                        >
                          <div className="overflow-hidden">
                            <div className="text-xs font-bold text-[#e6edf3] truncate" title={arch.filename}>
                              {arch.filename}
                            </div>
                            <div className="text-[10px] text-[#768390] mt-0.5">
                              {(arch.sizeBytes / 1024).toFixed(1)} KB &bull; {new Date(arch.createdAt).toLocaleDateString('ar-SD')}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleViewArchive(arch)}
                            className="btn-secondary text-[11px] px-2.5 py-1 flex items-center gap-1 shrink-0"
                          >
                            <Eye className="w-3.5 h-3.5 text-[#fbbf24]" />
                            استعراض
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* ========================================================================= */}
          {/* TAB 4: AI & AUTO-UPDATER */}
          {/* ========================================================================= */}
          {activeTab === 'ai_updates' && (
            <motion.div
              key="ai-tab"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-6"
            >
              {/* AI Advisor Configuration */}
              <div className="glass-card p-5 flex flex-col gap-4">
                <div className="flex items-center gap-2 text-sm font-bold text-[#fbbf24] border-b border-white/10 pb-2.5">
                  <Sparkles className="w-4 h-4" />
                  إعدادات المستشار الذكي (AI Engine)
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#adbac7] mb-1.5">مزود الذكاء الاصطناعي</label>
                  <select
                    value={aiProvider}
                    onChange={(e) => setAiProvider(e.target.value)}
                    className="w-full bg-[#161b22] border border-white/10 rounded-lg px-3 py-2 text-xs text-[#e6edf3] focus:border-[#fbbf24] focus:outline-none"
                  >
                    <option value="gemini">Google Gemini (موصى به - فائق السرعة)</option>
                    <option value="openai">OpenAI (GPT-4o)</option>
                  </select>
                </div>

                {aiProvider === 'gemini' ? (
                  <div>
                    <label className="block text-xs font-bold text-[#adbac7] mb-1.5">Google Gemini API Key</label>
                    <div className="relative">
                      <input
                        type={showGeminiKey ? 'text' : 'password'}
                        value={geminiApiKey}
                        onChange={(e) => setGeminiApiKey(e.target.value)}
                        placeholder="AIzaSy..."
                        className="w-full bg-[#161b22] border border-white/10 rounded-lg pl-10 pr-3 py-2 text-xs text-[#e6edf3] font-mono focus:border-[#fbbf24] focus:outline-none text-left"
                        dir="ltr"
                      />
                      <button
                        type="button"
                        onClick={() => setShowGeminiKey(!showGeminiKey)}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#768390] hover:text-[#e6edf3]"
                      >
                        {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-bold text-[#adbac7] mb-1.5">OpenAI API Key</label>
                    <div className="relative">
                      <input
                        type={showOpenAiKey ? 'text' : 'password'}
                        value={openaiApiKey}
                        onChange={(e) => setOpenaiApiKey(e.target.value)}
                        placeholder="sk-..."
                        className="w-full bg-[#161b22] border border-white/10 rounded-lg pl-10 pr-3 py-2 text-xs text-[#e6edf3] font-mono focus:border-[#fbbf24] focus:outline-none text-left"
                        dir="ltr"
                      />
                      <button
                        type="button"
                        onClick={() => setShowOpenAiKey(!showOpenAiKey)}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#768390] hover:text-[#e6edf3]"
                      >
                        {showOpenAiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleSaveAiSettings}
                  disabled={saving}
                  className="btn-primary text-xs flex items-center justify-center gap-2 mt-2"
                >
                  <Save className="w-4 h-4" />
                  حفظ إعدادات الذكاء الاصطناعي
                </button>
              </div>

              {/* GitHub Private Updater */}
              <div className="glass-card p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                  <div className="flex items-center gap-2 text-sm font-bold text-[#e6edf3]">
                    <ShieldCheck className="w-4 h-4 text-[#10b981]" />
                    التحديث التلقائي الآمن (GitHub Releases)
                  </div>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#fbbf24]/10 text-[#fbbf24] border border-[#fbbf24]/20">
                    الإصدار v{appVersion}
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#adbac7] mb-1.5">
                    رمز الوصول الخاص (GitHub Personal Access Token)
                  </label>
                  <div className="relative">
                    <input
                      type={showGhToken ? 'text' : 'password'}
                      value={ghToken}
                      onChange={(e) => setGhToken(e.target.value)}
                      placeholder="ghp_..."
                      className="w-full bg-[#161b22] border border-white/10 rounded-lg pl-10 pr-3 py-2 text-xs text-[#e6edf3] font-mono focus:border-[#fbbf24] focus:outline-none text-left"
                      dir="ltr"
                    />
                    <button
                      type="button"
                      onClick={() => setShowGhToken(!showGhToken)}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#768390] hover:text-[#e6edf3]"
                    >
                      {showGhToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Update Status card */}
                <div className="p-3.5 bg-[#161b22] border border-white/5 rounded-xl text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[#adbac7]">حالة التحديث:</span>
                    <span className="font-bold text-[#e6edf3]">
                      {updateStatus.status === 'checking' && 'جاري التحقق...'}
                      {updateStatus.status === 'available' && 'تحديث جديد متوفر!'}
                      {updateStatus.status === 'downloaded' && 'التحديث جاهز للتثبيت!'}
                      {updateStatus.status === 'not-available' && 'المنظومة محدثة'}
                      {updateStatus.status === 'error' && 'حدث خطأ'}
                      {updateStatus.status === 'idle' && 'جاهز للتحقق'}
                    </span>
                  </div>

                  {downloadProgress && (
                    <div>
                      <div className="flex justify-between text-[10px] text-[#768390] mb-1">
                        <span>التقدم:</span>
                        <span>{Math.round(downloadProgress.percent || 0)}%</span>
                      </div>
                      <div className="w-full bg-[#0d1117] h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-gradient-to-l from-[#fbbf24] to-[#f59e0b] h-full transition-all duration-200"
                          style={{ width: `${downloadProgress.percent || 0}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleCheckUpdates}
                    disabled={checkingUpdates}
                    className="btn-primary text-xs flex items-center gap-2 flex-1 justify-center"
                  >
                    <RefreshCw className={`w-4 h-4 ${checkingUpdates ? 'animate-spin' : ''}`} />
                    التحقق من التحديثات
                  </button>

                  {updateStatus.updateAvailable && (
                    <button
                      type="button"
                      onClick={handleDownloadUpdate}
                      disabled={downloadingUpdate}
                      className="btn-secondary text-xs flex items-center gap-2 text-[#fbbf24]"
                    >
                      <Download className="w-4 h-4" />
                      تحميل التحديث
                    </button>
                  )}

                  {updateStatus.updateDownloaded && (
                    <button
                      type="button"
                      onClick={handleInstallUpdate}
                      className="btn-primary text-xs flex items-center gap-2 bg-[#10b981] hover:bg-[#059669]"
                    >
                      <Check className="w-4 h-4" />
                      تثبيت وإعادة التشغيل
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ========================================================================= */}
      {/* ARCHIVE VIEWER MODAL */}
      {/* ========================================================================= */}
      <Modal
        open={archiveViewerOpen}
        onClose={() => setArchiveViewerOpen(false)}
        title="استعراض محتويات الأرشيف التاريخي"
        size="xl"
      >
        {selectedArchive ? (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 bg-[#0d1117] border border-white/5 rounded-xl">
                <div className="text-[#768390]">تاريخ التصدير</div>
                <div className="text-sm font-bold text-[#e6edf3] mt-1">
                  {new Date(selectedArchive.exportedAt).toLocaleDateString('ar-SD')}
                </div>
              </div>
              <div className="p-3 bg-[#0d1117] border border-white/5 rounded-xl">
                <div className="text-[#768390]">عدد الفواتير المؤرشفة</div>
                <div className="text-sm font-bold text-[#fbbf24] mt-1">
                  {selectedArchive.counts?.sales || selectedArchive.sales?.length || 0}
                </div>
              </div>
              <div className="p-3 bg-[#0d1117] border border-white/5 rounded-xl">
                <div className="text-[#768390]">سجلات الخسائر</div>
                <div className="text-sm font-bold text-[#ef4444] mt-1">
                  {selectedArchive.counts?.losses || selectedArchive.losses?.length || 0}
                </div>
              </div>
              <div className="p-3 bg-[#0d1117] border border-white/5 rounded-xl">
                <div className="text-[#768390]">الملاحظات</div>
                <div className="text-sm font-bold text-[#38bdf8] mt-1">
                  {selectedArchive.counts?.notes || selectedArchive.notes?.length || 0}
                </div>
              </div>
            </div>

            {/* Sales table preview */}
            <div>
              <h4 className="font-bold text-[#e6edf3] mb-2">عينة من الفواتير المؤرشفة:</h4>
              <div className="max-h-60 overflow-y-auto custom-scrollbar border border-white/5 rounded-xl">
                <table className="w-full text-right">
                  <thead className="bg-[#0d1117] text-[#adbac7] sticky top-0">
                    <tr>
                      <th className="p-2">رقم الفاتورة</th>
                      <th className="p-2">التاريخ</th>
                      <th className="p-2">العميل</th>
                      <th className="p-2">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {(selectedArchive.sales || []).slice(0, 50).map((sale) => (
                      <tr key={sale.id} className="hover:bg-white/5">
                        <td className="p-2 font-mono">#{sale.id}</td>
                        <td className="p-2">{new Date(sale.date).toLocaleDateString('ar-SD')}</td>
                        <td className="p-2">{sale.customer_name || 'عميل نقدي'}</td>
                        <td className="p-2 font-bold text-[#10b981]">{formatCurrency(sale.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* ========================================================================= */}
      {/* CONFIRM SHRINK MODAL */}
      {/* ========================================================================= */}
      <ConfirmModal
        open={confirmShrinkOpen}
        onClose={() => setConfirmShrinkOpen(false)}
        onConfirm={handleShrinkDatabase}
        title="تأكيد تفريغ وتنظيف قاعدة البيانات (VACUUM)"
        message={`هل أنت متأكد من حذف السجلات القديمة الأقدم من (${customCutoffDate || cutoffYear}) نهائياً من قاعدة البيانات النشطة وتفريغ المساحة؟ تأكد من تصدير الأرشيف أولاً.`}
        confirmText="نعم، تفريغ وتنظيف الآن"
        cancelText="إلغاء"
        danger={true}
      />
    </div>
  );
};

export default SettingsModule;
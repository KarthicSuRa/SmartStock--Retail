'use client';

// /src/lib/i18n.tsx
// SmartStock — Multi-language support (EN, HI, TA, NL, DE, AR with RTL).
// Unknown keys fall back to English, so new screens stay usable while translations are added.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { applyDictionary, compile, Dict, translateString } from '@/i18n/runtime';
import catalog from '@/i18n/catalog.json';

export type LangCode = 'en' | 'hi' | 'ta' | 'nl' | 'de' | 'ar';

export const LANGUAGES: { code: LangCode; label: string; native: string; locale: string; dir: 'ltr' | 'rtl' }[] = [
  { code: 'en', label: 'English', native: 'English', locale: 'en-GB', dir: 'ltr' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी', locale: 'hi-IN', dir: 'ltr' },
  { code: 'ta', label: 'Tamil', native: 'தமிழ்', locale: 'ta-IN', dir: 'ltr' },
  { code: 'nl', label: 'Dutch', native: 'Nederlands', locale: 'nl-NL', dir: 'ltr' },
  { code: 'de', label: 'German', native: 'Deutsch', locale: 'de-DE', dir: 'ltr' },
  { code: 'ar', label: 'Arabic', native: 'العربية', locale: 'ar-AE', dir: 'rtl' },
];

// key (English) → [hi, ta, nl, de, ar]
const DICT: Record<string, [string, string, string, string, string]> = {
  // Navigation
  'Intelligent Radar': ['इंटेलिजेंट रडार', 'நுண்ணறிவு ரேடார்', 'Intelligente radar', 'Intelligentes Radar', 'الرادار الذكي'],
  'Operations Home': ['संचालन होम', 'செயல்பாடுகள் முகப்பு', 'Operaties start', 'Betriebsübersicht', 'الصفحة الرئيسية للعمليات'],
  'Actions Matrix': ['कार्य मैट्रिक्स', 'செயல் அட்டவணை', 'Actiematrix', 'Aktionsmatrix', 'مصفوفة الإجراءات'],
  'Inventory Ledger': ['इन्वेंटरी लेजर', 'சரக்கு பேரேடு', 'Voorraadgrootboek', 'Bestandsbuch', 'سجل المخزون'],
  'Cycle Counts': ['चक्र गणना', 'சுழற்சி எண்ணிக்கை', 'Cyclustellingen', 'Zyklische Inventur', 'الجرد الدوري'],
  'FEFO Expiry': ['FEFO समाप्ति', 'FEFO காலாவதி', 'FEFO-houdbaarheid', 'FEFO-Ablauf', 'انتهاء الصلاحية FEFO'],
  'Shelf Health Vision': ['शेल्फ स्वास्थ्य विज़न', 'அலமாரி நிலை பார்வை', 'Schapgezondheid', 'Regalzustand (Vision)', 'صحة الرفوف'],
  'Vision Shelf Health': ['शेल्फ स्वास्थ्य विज़न', 'அலமாரி நிலை பார்வை', 'Schapgezondheid', 'Regalzustand (Vision)', 'صحة الرفوف'],
  'Floor Staff PWA': ['फ्लोर स्टाफ ऐप', 'தள ஊழியர் செயலி', 'Winkelvloer-app', 'Verkaufsflächen-App', 'تطبيق موظفي الصالة'],
  'Procurement Hub': ['खरीद केंद्र', 'கொள்முதல் மையம்', 'Inkoopcentrum', 'Beschaffungszentrale', 'مركز المشتريات'],
  'Executive Analytics': ['कार्यकारी विश्लेषण', 'நிர்வாக பகுப்பாய்வு', 'Directieanalyse', 'Management-Analysen', 'تحليلات الإدارة'],
  'Admin Hub': ['एडमिन केंद्र', 'நிர்வாக மையம்', 'Beheercentrum', 'Admin-Zentrale', 'مركز الإدارة'],
  'Floor Tasks': ['फ्लोर कार्य', 'தள பணிகள்', 'Vloertaken', 'Flächenaufgaben', 'مهام الصالة'],
  'Barcode Scanner': ['बारकोड स्कैनर', 'பார்கோடு ஸ்கேனர்', 'Barcodescanner', 'Barcode-Scanner', 'ماسح الباركود'],
  'Guided Cycle Count': ['निर्देशित गणना', 'வழிகாட்டப்பட்ட எண்ணிக்கை', 'Begeleide telling', 'Geführte Inventur', 'جرد موجّه'],
  'Damage Registration': ['क्षति पंजीकरण', 'சேதப் பதிவு', 'Schaderegistratie', 'Schadenserfassung', 'تسجيل التلف'],
  Overview: ['अवलोकन', 'கண்ணோட்டம்', 'Overzicht', 'Übersicht', 'نظرة عامة'],
  'Multi-Store Ledger': ['बहु-स्टोर लेजर', 'பல-கடை பேரேடு', 'Grootboek alle winkels', 'Filialübergreifendes Bestandsbuch', 'سجل متعدد المتاجر'],
  'Network Inventory': ['नेटवर्क इन्वेंटरी', 'வலையமைப்பு சரக்கு', 'Netwerkvoorraad', 'Netzwerkbestand', 'مخزون الشبكة'],
  'POS Control Tower': ['POS नियंत्रण टावर', 'POS கட்டுப்பாட்டு மையம்', 'POS-controletoren', 'POS-Kontrollturm', 'برج مراقبة نقاط البيع'],
  Replenishment: ['पुनःपूर्ति', 'மறுநிரப்பல்', 'Aanvulling', 'Nachschub', 'إعادة التزويد'],
  'Supply Analytics': ['आपूर्ति विश्लेषण', 'விநியோக பகுப்பாய்வு', 'Supply-analyse', 'Lieferketten-Analysen', 'تحليلات التوريد'],
  'Connector Registry': ['कनेक्टर रजिस्ट्री', 'இணைப்பான் பதிவேடு', 'Connectorregister', 'Konnektor-Register', 'سجل الموصلات'],
  'POS Reconciliation': ['POS मिलान', 'POS சரிசெய்தல்', 'POS-afstemming', 'POS-Abgleich', 'تسوية نقاط البيع'],
  'Dead-Letter Queue': ['डेड-लेटर कतार', 'தோல்வி வரிசை', 'Dead-letterwachtrij', 'Dead-Letter-Warteschlange', 'قائمة الرسائل الفاشلة'],
  'Quarantine Manager': ['क्वारंटीन प्रबंधक', 'தனிமைப்படுத்தல் மேலாளர்', 'Quarantainebeheer', 'Quarantäne-Verwaltung', 'إدارة الحجر'],
  'Decision Governance': ['निर्णय शासन', 'முடிவு நிர்வாகம்', 'Beslissingsgovernance', 'Entscheidungs-Governance', 'حوكمة القرارات'],
  'User Directory': ['उपयोगकर्ता निर्देशिका', 'பயனர் அடைவு', 'Gebruikersoverzicht', 'Benutzerverzeichnis', 'دليل المستخدمين'],
  'Store Hierarchy': ['स्टोर पदानुक्रम', 'கடை படிநிலை', 'Winkelhiërarchie', 'Filialhierarchie', 'التسلسل الهرمي للمتاجر'],
  'Decision Policies': ['निर्णय नीतियाँ', 'முடிவுக் கொள்கைகள்', 'Beslissingsregels', 'Entscheidungsrichtlinien', 'سياسات القرار'],
  'Audit Logs': ['ऑडिट लॉग', 'தணிக்கை பதிவுகள்', 'Auditlogboek', 'Audit-Protokolle', 'سجلات التدقيق'],
  'Back-Store Mapping': ['बैक-स्टोर मैपिंग', 'பின்கிடங்கு வரைபடம்', 'Magazijnlocaties', 'Lagerplatz-Zuordnung', 'تخطيط المخزن الخلفي'],
  'Daily Tasks': ['दैनिक कार्य', 'தினசரி பணிகள்', 'Dagelijkse taken', 'Tägliche Aufgaben', 'المهام اليومية'],
  Reports: ['रिपोर्ट', 'அறிக்கைகள்', 'Rapporten', 'Berichte', 'التقارير'],
  Glossary: ['शब्दावली', 'சொற்களஞ்சியம்', 'Woordenlijst', 'Glossar', 'مسرد المصطلحات'],
  'Category / MC': ['श्रेणी / MC', 'வகை / MC', 'Categorie / MC', 'Kategorie / WG', 'الفئة / MC'],
  'Org Structure': ['संगठन संरचना', 'நிறுவன அமைப்பு', 'Organisatiestructuur', 'Organisationsstruktur', 'الهيكل التنظيمي'],
  'Roles & Access': ['भूमिकाएँ और पहुँच', 'பங்குகள் & அணுகல்', 'Rollen & toegang', 'Rollen & Berechtigungen', 'الأدوار والصلاحيات'],
  'Transaction Logs': ['लेनदेन लॉग', 'பரிவர்த்தனை பதிவுகள்', 'Transactielogboek', 'Transaktionsprotokolle', 'سجلات المعاملات'],
  Architecture: ['आर्किटेक्चर', 'கட்டமைப்பு', 'Architectuur', 'Architektur', 'البنية'],
  'Devices & Languages': ['डिवाइस और भाषाएँ', 'சாதனங்கள் & மொழிகள்', 'Apparaten & talen', 'Geräte & Sprachen', 'الأجهزة واللغات'],
  // Common UI
  'Role View': ['भूमिका दृश्य', 'பங்கு பார்வை', 'Rolweergave', 'Rollenansicht', 'عرض الدور'],
  Language: ['भाषा', 'மொழி', 'Taal', 'Sprache', 'اللغة'],
  Search: ['खोजें', 'தேடு', 'Zoeken', 'Suchen', 'بحث'],
  'Sign Out': ['साइन आउट', 'வெளியேறு', 'Afmelden', 'Abmelden', 'تسجيل الخروج'],
  Export: ['निर्यात', 'ஏற்றுமதி', 'Exporteren', 'Exportieren', 'تصدير'],
  'Access restricted': ['पहुँच प्रतिबंधित', 'அணுகல் கட்டுப்படுத்தப்பட்டது', 'Toegang beperkt', 'Zugriff eingeschränkt', 'الوصول مقيد'],
  'Your role does not have access to this module.': ['आपकी भूमिका को इस मॉड्यूल तक पहुँच नहीं है।', 'உங்கள் பங்கிற்கு இந்த தொகுதிக்கு அணுகல் இல்லை.', 'Uw rol heeft geen toegang tot deze module.', 'Ihre Rolle hat keinen Zugriff auf dieses Modul.', 'ليس لدورك صلاحية الوصول إلى هذه الوحدة.'],
  'Read-only access': ['केवल पढ़ने की पहुँच', 'படிக்க மட்டும் அணுகல்', 'Alleen-lezen', 'Nur Lesezugriff', 'وصول للقراءة فقط'],
  All: ['सभी', 'அனைத்தும்', 'Alle', 'Alle', 'الكل'],
  Success: ['सफल', 'வெற்றி', 'Geslaagd', 'Erfolgreich', 'نجاح'],
  Error: ['त्रुटि', 'பிழை', 'Fout', 'Fehler', 'خطأ'],
  Warning: ['चेतावनी', 'எச்சரிக்கை', 'Waarschuwing', 'Warnung', 'تحذير'],
  Store: ['स्टोर', 'கடை', 'Winkel', 'Filiale', 'المتجر'],
  Today: ['आज', 'இன்று', 'Vandaag', 'Heute', 'اليوم'],
  Open: ['खुला', 'திறந்தது', 'Open', 'Offen', 'مفتوح'],
  'In progress': ['प्रगति में', 'நடப்பில்', 'Bezig', 'In Arbeit', 'قيد التنفيذ'],
  Done: ['पूर्ण', 'முடிந்தது', 'Klaar', 'Erledigt', 'تم'],
  Cleaning: ['सफाई', 'சுத்தம்', 'Schoonmaak', 'Reinigung', 'التنظيف'],
  'Bin Movement': ['बिन स्थानांतरण', 'தொட்டி நகர்வு', 'Binverplaatsing', 'Lagerplatzumbuchung', 'نقل الصناديق'],
  'Replenish Shelf': ['शेल्फ भरें', 'அலமாரியை நிரப்பு', 'Schap aanvullen', 'Regal auffüllen', 'إعادة ملء الرف'],
  Communication: ['संचार', 'தொடர்பு', 'Communicatie', 'Kommunikation', 'التواصل'],
  'Add Task': ['कार्य जोड़ें', 'பணி சேர்', 'Taak toevoegen', 'Aufgabe hinzufügen', 'إضافة مهمة'],
  Post: ['पोस्ट करें', 'இடுகை', 'Plaatsen', 'Senden', 'نشر'],
  Announcements: ['घोषणाएँ', 'அறிவிப்புகள்', 'Mededelingen', 'Ankündigungen', 'الإعلانات'],
  'Mark done': ['पूर्ण करें', 'முடிந்ததாகக் குறி', 'Afronden', 'Als erledigt markieren', 'وضع علامة تم'],
  Start: ['शुरू करें', 'தொடங்கு', 'Starten', 'Starten', 'ابدأ'],
  'Assigned to': ['सौंपा गया', 'ஒதுக்கப்பட்டவர்', 'Toegewezen aan', 'Zugewiesen an', 'مُسند إلى'],
  Due: ['नियत', 'கெடு', 'Gepland', 'Fällig', 'الموعد'],
  Priority: ['प्राथमिकता', 'முன்னுரிமை', 'Prioriteit', 'Priorität', 'الأولوية'],
};

const IDX: Record<Exclude<LangCode, 'en'>, number> = { hi: 0, ta: 1, nl: 2, de: 3, ar: 4 };
const STORAGE_KEY = 'ss.lang';

interface I18nCtx {
  lang: LangCode;
  setLang: (l: LangCode) => void;
  t: (key: string) => string;
  locale: string;
  dir: 'ltr' | 'rtl';
  formatNumber: (n: number, opts?: Intl.NumberFormatOptions) => string;
}

const Ctx = createContext<I18nCtx | null>(null);

// Full-app dictionaries (src/i18n/<lang>.json), loaded on demand and merged with DICT above.
const LOADERS: Record<Exclude<LangCode, 'en'>, () => Promise<{ default: Dict }>> = {
  hi: () => import('@/i18n/hi.json'),
  ta: () => import('@/i18n/ta.json'),
  nl: () => import('@/i18n/nl.json'),
  de: () => import('@/i18n/de.json'),
  ar: () => import('@/i18n/ar.json'),
};
const loaded: Partial<Record<LangCode, { dict: Dict; compiled: ReturnType<typeof compile> }>> = {};

export async function loadDictionary(lang: LangCode): Promise<Dict | null> {
  if (lang === 'en') return null;
  if (!loaded[lang]) {
    const file = (await LOADERS[lang]()).default;
    const dict: Dict = { ...file };
    for (const [k, v] of Object.entries(DICT)) if (v[IDX[lang]]) dict[k] = v[IDX[lang]];
    loaded[lang] = { dict, compiled: compile(dict) };
  }
  return loaded[lang]!.dict;
}

export function translate(lang: LangCode, key: string): string {
  if (lang === 'en') return key;
  const c = loaded[lang]?.compiled;
  return c ? translateString(key, c) : DICT[key]?.[IDX[lang]] ?? key;
}

const CATALOG_KEYS: string[] = [...(catalog as { strings: string[]; patterns: string[] }).strings, ...(catalog as { patterns: string[] }).patterns];

/** % of catalog strings that have a translation (only known for loaded languages). */
export function translationCoverage(): { code: LangCode; pct: number | null }[] {
  return LANGUAGES.map((l) => {
    if (l.code === 'en') return { code: l.code, pct: 100 };
    const d = loaded[l.code]?.dict;
    if (!d) return { code: l.code, pct: null };
    return { code: l.code, pct: Math.round((CATALOG_KEYS.filter((k) => d[k] || DICT[k]).length / CATALOG_KEYS.length) * 100) };
  });
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<LangCode>('en');
  const [, setReady] = useState(0); // re-render once a dictionary has loaded

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY) as LangCode | null;
      if (saved && LANGUAGES.some((l) => l.code === saved)) setLangState(saved);
    } catch {
      // ignore
    }
  }, []);

  const meta = LANGUAGES.find((l) => l.code === lang) ?? LANGUAGES[0];

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = meta.dir;
    let cancelled = false;
    loadDictionary(lang)
      .then((dict) => {
        if (cancelled) return;
        applyDictionary(dict); // translates the whole page and keeps it translated
        setReady((n) => n + 1);
      })
      .catch(() => applyDictionary(null));
    return () => {
      cancelled = true;
    };
  }, [lang, meta.dir]);

  const setLang = useCallback((l: LangCode) => {
    setLangState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo<I18nCtx>(
    () => ({
      lang,
      setLang,
      t: (key: string) => translate(lang, key),
      locale: meta.locale,
      dir: meta.dir,
      formatNumber: (n, opts) => new Intl.NumberFormat(meta.locale, opts).format(n),
    }),
    [lang, setLang, meta.locale, meta.dir]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  const ctx = useContext(Ctx);
  if (ctx) return ctx;
  // Safe fallback when rendered outside the provider
  return { lang: 'en', setLang: () => {}, t: (k) => k, locale: 'en-GB', dir: 'ltr', formatNumber: (n, o) => new Intl.NumberFormat('en-GB', o).format(n) };
}

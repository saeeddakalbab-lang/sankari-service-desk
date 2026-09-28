// The Holding's departments, as every form offers them. The English name is what is stored; the
// Arabic name is shown to Arabic readers.
export const DEPARTMENTS = [
  { en: "Executive Office", ar: "المكتب التنفيذي" },
  { en: "Digital Transformation & IT", ar: "التحول الرقمي وتقنية المعلومات" },
  { en: "Finance", ar: "القسم المالي" },
  { en: "Procurement", ar: "المشتريات" },
  { en: "Human Resources", ar: "الموارد البشرية" },
  { en: "Administrative Affairs", ar: "الشؤون الإدارية" },
  { en: "Marketing", ar: "التسويق" },
  { en: "Sales", ar: "المبيعات" },
  { en: "Quality Management", ar: "إدارة الجودة" },
  { en: "Legal", ar: "الشؤون القانونية" },
  { en: "Operations", ar: "العمليات" },
] as const;
export const departmentLabel = (value: string, locale: "en" | "ar") => DEPARTMENTS.find(d => d.en === value)?.[locale] ?? value;
